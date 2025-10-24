import { describe, expect, it } from "vitest";

import { normalizeSummaryResponse } from "./client-summary";
import type { SummaryApiResponse } from "@/types/summary";

describe("normalizeSummaryResponse", () => {
  it("normalizes summary fields from API response", () => {
    const payload: SummaryApiResponse = {
      status: "ok",
      summary: "Snapshot of recent updates",
      highlights: ["Won the hackathon", "Shipped v1 to beta testers"],
      hashtags: ["launch", "#Momentum"],
      nextActions: ["Share customer testimonials"],
      insights: ["Community engagement is accelerating"],
      tone: "upbeat",
      sentiment: "positive",
      postTitle: "Weekly Capsule Recap",
      postPrompt: "Draft a celebratory post thanking the community.",
      wordCount: 94,
      model: "gpt-4o-mini",
      source: "feed",
    };

    const result = normalizeSummaryResponse(payload);

    expect(result.summary).toBe(payload.summary);
    expect(result.highlights).toEqual(payload.highlights);
    expect(result.hashtags).toEqual(["#launch", "#Momentum"]);
    expect(result.nextActions).toEqual(payload.nextActions);
    expect(result.insights).toEqual(payload.insights);
    expect(result.tone).toBe(payload.tone);
    expect(result.sentiment).toBe(payload.sentiment);
    expect(result.postTitle).toBe(payload.postTitle);
    expect(result.postPrompt).toBe(payload.postPrompt);
    expect(result.wordCount).toBe(payload.wordCount);
    expect(result.model).toBe(payload.model);
    expect(result.source).toBe(payload.source);
  });

  it("falls back to safe defaults when arrays are missing", () => {
    const payload = {
      status: "ok",
      summary: "Only summary provided",
      highlights: null,
      hashtags: null,
      nextActions: null,
      insights: null,
      tone: null,
      sentiment: null,
      postTitle: null,
      postPrompt: null,
      wordCount: null,
      model: null,
      source: "text",
    } as unknown as SummaryApiResponse;

    const result = normalizeSummaryResponse(payload);

    expect(result.highlights).toEqual([]);
    expect(result.hashtags).toEqual([]);
    expect(result.nextActions).toEqual([]);
    expect(result.insights).toEqual([]);
    expect(result.tone).toBeNull();
    expect(result.postTitle).toBeNull();
  });
});
