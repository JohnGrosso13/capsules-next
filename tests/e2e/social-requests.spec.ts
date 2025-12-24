import { expect, test } from "@playwright/test";

test.describe("Social graph & requests harness", () => {
  test("counters update across friend/capsule/party actions", async ({ page }) => {
    const response = await page.goto("/playwright-harness/social", { waitUntil: "domcontentloaded" });
    test.skip(!response || response.status() >= 400, "social harness route not reachable");

    await expect(page.getByTestId("requests-count")).toHaveText("3");
    await expect(page.getByTestId("friend-requests").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("capsule-invites").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("party-invites").locator("li")).toHaveCount(1);

    await page.getByTestId("accept-friend").click();
    await expect(page.getByTestId("requests-count")).toHaveText("2");

    await page.getByTestId("decline-capsule").click();
    await expect(page.getByTestId("requests-count")).toHaveText("1");

    await page.getByTestId("decline-party").click();
    await expect(page.getByTestId("requests-count")).toHaveText("0");
    await expect(page.getByTestId("friend-requests").locator("li")).toHaveCount(0);
    await expect(page.getByTestId("capsule-invites").locator("li")).toHaveCount(0);
    await expect(page.getByTestId("party-invites").locator("li")).toHaveCount(0);
  });
});
