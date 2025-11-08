#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
if (!require.cache[serverOnlyPath]) {
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    path: serverOnlyPath,
    exports: {},
    children: [],
    paths: [],
  } as unknown as NodeModule;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value.replace(/^"|"$/g, "");
      }
    });
}

loadEnvFile(".env.local");
loadEnvFile(".env");

async function main() {
  const [{ listAllCapsules }, { refreshCapsuleKnowledge }] = await Promise.all([
    import("@/server/capsules/repository"),
    import("@/server/capsules/knowledge"),
  ]);

  const capsules = await listAllCapsules();
  if (!capsules.length) {
    console.log("No capsules found to backfill.");
    return;
  }

  console.log(`Refreshing capsule knowledge for ${capsules.length} capsule(s)...`);
  let refreshed = 0;
  const failures: Array<{ id: string; error: unknown }> = [];

  for (const capsule of capsules) {
    const label = capsule.name ?? capsule.id;
    try {
      await refreshCapsuleKnowledge(capsule.id, capsule.name ?? null);
      refreshed += 1;
      console.log(`✅ ${label}`);
    } catch (error) {
      failures.push({ id: capsule.id, error });
      console.error(`❌ ${label}`, error);
    }
  }

  console.log(
    `Knowledge refresh complete. Success: ${refreshed}/${capsules.length}${
      failures.length ? `, failures: ${failures.length}` : ""
    }.`,
  );

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Capsule knowledge backfill failed", error);
  process.exit(1);
});
