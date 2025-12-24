import { expect, test } from "@playwright/test";

test.describe("Uploads & memories", () => {
  test("runs the attachment pipeline against mocked R2 endpoints", async ({ page }) => {
    await page.addInitScript(() => {
      // Minimal Turnstile stub so getTurnstileToken resolves without network
      (window as unknown as { turnstile: unknown }).turnstile = {
        render: (_container: HTMLElement, options: { callback: (token: string) => void }) => {
          setTimeout(() => options.callback("turnstile-token"), 0);
          return "pw-turnstile";
        },
        execute: () => {},
        ready: (cb: () => void) => cb(),
        remove: () => {},
      };
    });

    await page.route("**/api/uploads/r2/create", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "sess-1",
          uploadId: "upload-1",
          key: "uploads/mock-key",
          bucket: "capsules",
          partSize: 1024,
          parts: [{ partNumber: 1, url: "https://uploads.example.com/part-1" }],
        }),
      });
    });

    await page.route("https://uploads.example.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { etag: '"etag-mock-1"' },
      });
    });

    await page.route("**/api/uploads/r2/complete", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://cdn.example.com/uploads/mock-key",
          key: "uploads/mock-key",
          sessionId: "sess-1",
          uploadId: "upload-1",
        }),
      });
    });

    const response = await page.goto("/playwright-harness/uploads", { waitUntil: "networkidle" });
    test.skip(!response || response.status() >= 400, "upload harness route not reachable");

    await page
      .getByTestId("upload-file-input")
      .setInputFiles({ name: "hello.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });

    await expect(page.getByTestId("upload-status")).toHaveText(/ready/i, { timeout: 15_000 });
    await expect(page.getByTestId("upload-phase")).toHaveText(/completed/i);
    await expect(page.getByTestId("upload-url")).toContainText("https://cdn.example.com/uploads/mock-key");
  });
});
