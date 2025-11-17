import { describe, expect, it } from "vitest";

import { sanitizePostForModel } from "@/lib/ai/prompter";

describe("sanitizePostForModel", () => {
  it("drops data URIs and trims long URLs", () => {
    const input = {
      media_url: "data:image/png;base64,AAA",
      safe_url: "https://example.com/some/path",
    };
    const result = sanitizePostForModel(input);
    expect(result).toBeTruthy();
    expect(result?.media_url).toBeUndefined();
    expect(result?.safe_url).toBe("https://example.com/some/path");
  });

  it("truncates very long strings", () => {
    const longText = "a".repeat(4100);
    const result = sanitizePostForModel({ content: longText });
    expect(result?.content).toBeTruthy();
    expect((result?.content as string).length).toBe(4003); // 4000 chars + ellipsis
    expect((result?.content as string).endsWith("...")).toBe(true);
  });

  it("omits oversized arrays", () => {
    const result = sanitizePostForModel({ tags: Array.from({ length: 30 }, (_, i) => `t${i}`) });
    expect(result?.tags).toBeUndefined();
  });
});
