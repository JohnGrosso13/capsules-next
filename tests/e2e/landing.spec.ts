import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("shows hero content and CTA", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    test.skip(!response || !response.ok(), "base URL is not reachable");

    await expect(
      page.getByRole("heading", { name: /Create AI Powered Spaces That Remember/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Launch Capsule/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Explore Features/i })).toBeVisible();
  });
});
