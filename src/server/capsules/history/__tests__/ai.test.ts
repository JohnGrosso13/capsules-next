import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/prompter", () => ({
  callOpenAIChat: vi.fn(),
  extractJSON: (value: string) => {
    try {
      return JSON.parse(value as string);
    } catch {
      return null;
    }
  },
}));

import { parseHistoryModelContent, sanitizeHistoryModelPayload } from "../ai";

describe("parseHistoryModelContent", () => {
  it("returns parsed sections and generated_at when JSON is present", () => {
    const content = JSON.stringify({
      generated_at: "2024-05-01T12:00:00Z",
      sections: [
        {
          period: "weekly",
          summary: "Summary text",
          highlights: [],
          articles: [],
          timeline: [],
          next_focus: [],
        },
        null,
      ],
    });

    const parsed = parseHistoryModelContent(content);

    expect(parsed.generatedAt).toBe("2024-05-01T12:00:00Z");
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.period).toBe("weekly");
  });

  it("returns an empty payload when the model response is malformed", () => {
    const parsed = parseHistoryModelContent("not-json");

    expect(parsed.generatedAt).toBeNull();
    expect(parsed.sections).toEqual([]);
  });
});

describe("sanitizeHistoryModelPayload", () => {
  it("filters out non-object sections", () => {
    const parsed = sanitizeHistoryModelPayload({
      generated_at: "2024-07-04T00:00:00Z",
      sections: [null, "skip", { period: "monthly", summary: "ok" }],
    });

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.period).toBe("monthly");
    expect(parsed.generatedAt).toBe("2024-07-04T00:00:00Z");
  });
});
