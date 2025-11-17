import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const draftResponse = {
  action: "draft_post",
  message: "ok",
  post: { kind: "image", content: "" },
  history: [],
};

describe("callAiPrompt", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(draftResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards the entire user prompt to the AI endpoint", async () => {
    const { callAiPrompt } = await import("./ai");
    const prompt = "Can you make me an image of a supercar with coastal lighting?";
    await callAiPrompt({ message: prompt });

    const fetchSpy = vi.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(requestBody).toBeTruthy();
    const parsed = JSON.parse(requestBody as string);
    expect(parsed.message).toContain(prompt);
  });
});
