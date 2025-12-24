import { expect, test } from "@playwright/test";

test.describe("Chat & party harness", () => {
  test("sends messages, shows typing, and resumes party", async ({ page }) => {
    const response = await page.goto("/playwright-harness/chat", { waitUntil: "domcontentloaded" });
    test.skip(!response || response.status() >= 400, "chat harness route not reachable");

    await page.getByTestId("chat-draft").fill("Playwright message");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-message").last()).toContainText("Playwright message");

    await page.getByTestId("chat-typing-start").click();
    await expect(page.getByTestId("chat-typing-indicator")).toContainText(/typing/i);
    await page.getByTestId("chat-typing-clear").click();
    await expect(page.getByTestId("chat-typing-indicator")).toHaveText("");

    await page.getByTestId("party-disconnect").click();
    await expect(page.getByTestId("party-status")).toHaveText("disconnected");
    await page.getByTestId("party-resume").click();
    await expect(page.getByTestId("party-status")).toHaveText("resumed");
    await expect(page.getByTestId("party-token")).toContainText("resume-token");
  });
});
