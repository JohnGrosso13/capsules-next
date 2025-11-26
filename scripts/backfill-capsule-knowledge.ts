#!/usr/bin/env tsx
/**
 * Backfill capsule knowledge via the deployed cron endpoint.
 *
 * Usage:
 *   1) Ensure your Next app is running (e.g. npm run dev) and
 *      ASSISTANT_REMINDER_SECRET is set.
 *   2) Run: npm run knowledge:backfill
 *
 * This keeps all the server-only logic inside the Next runtime.
 */

const DEFAULT_SITE_URL = process.env.SITE_URL || "https://localhost:3000";
const SECRET = process.env.ASSISTANT_REMINDER_SECRET;

async function runBackfill() {
  if (!SECRET) {
    console.error("ASSISTANT_REMINDER_SECRET is not set in the environment.");
    process.exitCode = 1;
    return;
  }

  const endpoint = new URL("/api/cron/knowledge", DEFAULT_SITE_URL);
  endpoint.searchParams.set("secret", SECRET);

  console.info(`Starting knowledge backfill via ${endpoint.toString()}`);

  const response = await fetch(endpoint.toString(), { method: "POST" });
  const text = await response.text();

  if (!response.ok) {
    console.error("Backfill request failed", {
      status: response.status,
      body: text,
    });
    process.exitCode = 1;
    return;
  }

  console.info("Backfill completed:", text);
}

runBackfill().catch((error) => {
  console.error("knowledge backfill failed", error);
  process.exitCode = 1;
});
