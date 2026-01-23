import fs from "node:fs";
import path from "node:path";
import { Pinecone } from "@pinecone-database/pinecone";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, "utf8");
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) return;
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (!key || process.env[key] !== undefined) return;
      process.env[key] = value;
    });
}

async function main() {
  loadEnvLocal();

  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX;

  if (!apiKey || !indexName) {
    console.error("PINECONE_API_KEY or PINECONE_INDEX is not set");
    process.exit(1);
  }

  const client = new Pinecone({ apiKey });
  const index = client.index(indexName);

  const argId = process.argv[2];
  if (argId) {
    const res = await index.fetch([argId]);
    console.log("Fetch result:", JSON.stringify(res, null, 2));
    return;
  }

  const stats = await index.describeIndexStats();
  console.log("Index stats:", JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error("debug-pinecone error", error);
  process.exit(1);
});
