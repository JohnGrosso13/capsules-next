import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const authStatePath =
  process.env.E2E_STORAGE_STATE ?? path.join(process.cwd(), "playwright", ".auth", "user.json");
const hasAuthState = !!authStatePath && fs.existsSync(authStatePath);
const startWebServer = process.env.E2E_WEB_SERVER === "0" ? false : true;
const webServer = startWebServer
  ? {
      command: "npm run dev -- --hostname 0.0.0.0 --port 3000",
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "pw-test-key",
      },
    }
  : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    storageState: hasAuthState ? authStatePath : undefined,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  ...(webServer ? { webServer } : {}),
});
