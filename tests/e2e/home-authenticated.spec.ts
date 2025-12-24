import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const authStatePath =
  process.env.E2E_STORAGE_STATE ?? path.join(process.cwd(), "playwright", ".auth", "user.json");
const hasAuthState = !!authStatePath && fs.existsSync(authStatePath);

test.describe("Authenticated home feed", () => {
  test.skip(!hasAuthState, "requires signed-in storage state (set E2E_STORAGE_STATE)");

  test("renders feed with stubbed posts and interaction affordances", async ({ page }) => {
    await page.route("**/api/posts/pw-feed-1/like", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ likes: 2, viewer_liked: true }),
      });
    });

    const memoryCalls: Array<{ url: string; body: unknown }> = [];
    await page.route("**/api/posts/pw-feed-1/memory", async (route) => {
      const postData = route.request().postData() ?? "{}";
      memoryCalls.push({ url: route.request().url(), body: JSON.parse(postData) });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ remembered: true }),
      });
    });

    await page.route("**/api/posts**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          posts: [
            {
              id: "pw-feed-1",
              user_name: "Playwright Tester",
              user_avatar: null,
              content: "Hello from Playwright",
              media_url: null,
              created_at: new Date().toISOString(),
              likes: 1,
              comments: 0,
              shares: 0,
              viewer_liked: false,
              viewer_remembered: false,
              owner_user_id: "owner-1",
              owner_user_key: "playwright",
              attachments: [],
            },
          ],
          cursor: null,
          deleted: [],
        }),
      });
    });

    const response = await page.goto("/home", { waitUntil: "networkidle" });
    test.skip(!response || response.status() >= 400, "/home is not reachable");

    await expect(page.getByText("Playwright Tester")).toBeVisible();
    await expect(page.getByText("Hello from Playwright")).toBeVisible();

    const likeButton = page.locator('[data-action-key="like"]').first();
    await expect(likeButton).toBeVisible();
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true");

    const rememberButton = page.getByRole("button", { name: /remember this post/i }).first();
    await rememberButton.click();
    expect(memoryCalls.length).toBeGreaterThan(0);
    expect(memoryCalls[0]?.body).toMatchObject({ action: "remember" });
  });
});
