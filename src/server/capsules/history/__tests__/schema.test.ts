import { describe, expect, it } from "vitest";

import { coerceCoverageMeta } from "../schema";
import { buildEmptyCoverage } from "../summary";

describe("coerceCoverageMeta", () => {
  it("merges provided meta with defaults and filters invalid items", () => {
    const result = coerceCoverageMeta({
      weekly: {
        completeness: 0.5,
        authors: [
          { id: "writer-1", label: "Ada", covered: true, weight: 2 },
          { id: null, label: "ignore" },
        ],
        themes: [{ id: "theme-1", label: "Growth", covered: false, weight: "3" }],
        timeSpans: [
          { id: "ts-1", label: "Q1", covered: true, weight: 1 },
          { id: undefined, label: "skip" },
        ],
      } as Record<string, unknown>,
      monthly: {
        completeness: "bad",
        authors: [{ id: "writer-2", label: "Bea", covered: false, weight: undefined }],
      } as Record<string, unknown>,
    });

    expect(result.weekly.completeness).toBe(0.5);
    expect(result.weekly.authors).toEqual([
      { id: "writer-1", label: "Ada", covered: true, weight: 2 },
    ]);
    expect(result.weekly.themes).toEqual([
      { id: "theme-1", label: "Growth", covered: false, weight: 3 },
    ]);
    expect(result.weekly.timeSpans).toEqual([
      { id: "ts-1", label: "Q1", covered: true, weight: 1 },
    ]);

    expect(result.monthly.completeness).toBe(0);
    expect(result.monthly.authors).toEqual([
      { id: "writer-2", label: "Bea", covered: false, weight: 0 },
    ]);
    expect(result.monthly.themes).toEqual([]);
    expect(result.monthly.timeSpans).toEqual([]);
    expect(result.all_time).toEqual(buildEmptyCoverage());
  });
});
