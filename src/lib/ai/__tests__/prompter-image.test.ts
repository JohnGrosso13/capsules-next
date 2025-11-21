import { describe, expect, it } from "vitest";

import { normalizeOpenAiImageSize } from "@/lib/ai/prompter";

describe("normalizeOpenAiImageSize", () => {
  it("defaults to 1024x1024 when size is missing", () => {
    expect(normalizeOpenAiImageSize(undefined)).toBe("1024x1024");
    expect(normalizeOpenAiImageSize(null)).toBe("1024x1024");
    expect(normalizeOpenAiImageSize("")).toBe("1024x1024");
  });

  it("preserves allowed sizes", () => {
    expect(normalizeOpenAiImageSize("256x256")).toBe("256x256");
    expect(normalizeOpenAiImageSize("512x512")).toBe("512x512");
    expect(normalizeOpenAiImageSize("1024x1024")).toBe("1024x1024");
  });

  it("rounds custom sizes to the nearest supported bucket", () => {
    expect(normalizeOpenAiImageSize("200x200")).toBe("256x256");
    expect(normalizeOpenAiImageSize("512x400")).toBe("512x512");
    // 768 is not supported by OpenAI; map to 1024
    expect(normalizeOpenAiImageSize("768x768")).toBe("1024x1024");
    expect(normalizeOpenAiImageSize("300x600")).toBe("1024x1024");
  });

  it("handles uppercase and whitespace", () => {
    expect(normalizeOpenAiImageSize(" 512X512 ")).toBe("512x512");
  });
});
