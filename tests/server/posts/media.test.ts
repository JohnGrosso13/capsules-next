import { describe, expect, it } from "vitest";

import { extractSafetyDecision } from "@/server/posts/media";

describe("extractSafetyDecision", () => {
  it("returns null when no metadata is present", () => {
    expect(extractSafetyDecision(null)).toBeNull();
    expect(extractSafetyDecision(undefined)).toBeNull();
    expect(extractSafetyDecision({})).toBeNull();
  });

  it("prefers explicit safety_decision at the root", () => {
    expect(extractSafetyDecision({ safety_decision: "block" })).toBe("block");
  });

  it("falls back to processing.safety_decision", () => {
    const metadata = { processing: { safety_decision: "review" } };
    expect(extractSafetyDecision(metadata)).toBe("review");
  });

  it("reads decision from safety_scan block", () => {
    const metadata = { safety_scan: { decision: "allow" } };
    expect(extractSafetyDecision(metadata)).toBe("allow");
  });

  it("normalizes casing and ignores invalid values", () => {
    expect(extractSafetyDecision({ safety_decision: "BLOCK " })).toBe("block");
    expect(extractSafetyDecision({ safety_decision: "unknown" })).toBeNull();
  });
});
