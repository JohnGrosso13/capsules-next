import { describe, expect, it } from "vitest";

import { buildTranscriptSegments } from "@/app/api/party/[partyId]/summary/route";
import { computeTextCreditsFromTokens } from "@/lib/billing/usage";

describe("party summary helpers", () => {
  it("returns all segments when under budget", () => {
    const segments = [
      { id: "s1", text: "Hello world", speakerId: "u1", speakerName: "Alice", startTime: 1 },
      { id: "s2", text: "How are you?", speakerId: "u2", speakerName: "Bob", startTime: 6 },
      { id: "s3", text: "Doing great!", speakerId: "u1", speakerName: "Alice", startTime: 12 },
    ];

    const formatted = buildTranscriptSegments(segments);
    expect(formatted).toHaveLength(segments.length);
    expect(formatted[0]).toContain("Alice");
    expect(formatted[0]).toContain("[00:00:01]");
    expect(formatted[formatted.length - 1]).toContain("Doing great!");
  });

  it("downsamples long transcripts but keeps start and end context", () => {
    const longSegments = Array.from({ length: 300 }, (_, index) => ({
      id: `seg-${index}`,
      text: `Segment ${index} ${"text ".repeat(8)}`.trim(),
      speakerId: `u-${index % 5}`,
      speakerName: `Speaker-${index % 5}`,
      startTime: index * 5,
    }));

    const formatted = buildTranscriptSegments(longSegments);
    const totalLength = formatted.reduce((sum, entry) => sum + entry.length + 2, 0);

    expect(formatted.length).toBeLessThan(longSegments.length);
    expect(totalLength).toBeLessThanOrEqual(12000);
    expect(formatted[0]).toContain("Speaker-0");
    expect(formatted[formatted.length - 1]).toContain(`Segment ${longSegments.length - 1}`);
  });
});

describe("billing usage helpers", () => {
  it("computes non-zero credits from token counts", () => {
    expect(computeTextCreditsFromTokens(1000, "gpt-5-mini")).toBeGreaterThan(0);
    expect(computeTextCreditsFromTokens(null, "gpt-5-mini")).toBe(0);
    expect(computeTextCreditsFromTokens(0, "gpt-5-mini")).toBe(0);
  });
});
