import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    STABILITY_API_KEY: "test-key",
    STABILITY_IMAGE_MODEL: "sd3.5-large",
    STABILITY_BASE_URL: "https://api.stability.ai",
  },
}));

const { generateStabilityImage } = await import("./server");

describe("generateStabilityImage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ artifacts: [{ base64: "Zm9v" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps capsule style presets to Stability supported presets", async () => {
    await generateStabilityImage({ prompt: "car", aspectRatio: "1:1", stylePreset: "vibrant-future" });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1]?.body ?? "{}") as string);
    expect(body.style_preset).toBe("cinematic");
  });

  it("omits style preset when mapping does not exist", async () => {
    await generateStabilityImage({ prompt: "car", aspectRatio: "1:1", stylePreset: "capsule-default" });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1]?.body ?? "{}") as string);
    expect(body.style_preset).toBeUndefined();
  });
});
