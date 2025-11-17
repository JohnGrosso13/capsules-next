import { describe, expect, it } from "vitest";

import {
  composeCapsuleHistorySnapshot,
  extractLatestTimelineTimestampFromStored,
  type StoredHistorySnapshot,
} from "../snapshot";
import { DEFAULT_HISTORY_TEMPLATE_PRESETS, DEFAULT_PROMPT_MEMORY, type CoverageMetaMap } from "../schema";
import {
  buildEmptyCoverage,
  makeContentBlock,
  type CapsuleHistorySectionContent,
} from "../summary";
import type {
  CapsuleHistoryEdit,
  CapsuleHistoryExclusion,
  CapsuleHistoryPin,
  CapsuleHistorySectionSettings,
} from "../../repository";

const baseTimelineEntry = (id: string, timestamp: string | null) => ({
  id,
  text: `${id}-detail`,
  label: id,
  detail: `${id}-detail`,
  timestamp,
  postId: null,
  permalink: null,
  sourceIds: [],
  pinned: false,
  pinId: null,
  note: null,
  metadata: null,
});

describe("composeCapsuleHistorySnapshot", () => {
  it("decorates snapshots with pins, coverage, and exclusions", () => {
    const coverage: CoverageMetaMap = {
      weekly: { completeness: 0.75, authors: [], themes: [], timeSpans: [] },
      monthly: buildEmptyCoverage(),
      all_time: buildEmptyCoverage(),
    };

    const weeklyContent: CapsuleHistorySectionContent = {
      summary: makeContentBlock({
        period: "weekly",
        kind: "summary",
        index: 0,
        text: "Summary",
      }),
      highlights: [
        makeContentBlock({
          period: "weekly",
          kind: "highlight",
          index: 0,
          text: "Highlight",
        }),
      ],
      articles: [],
      timeline: [baseTimelineEntry("tl-1", "2024-01-01T00:00:00Z")],
      nextFocus: [],
    };

    const suggested: StoredHistorySnapshot = {
      capsuleId: "capsule-1",
      capsuleName: "Capsule One",
      generatedAt: "2024-01-01T00:00:00Z",
      sections: [
        {
          period: "weekly",
          title: "Weekly",
          timeframe: { start: null, end: null },
          postCount: 2,
          isEmpty: false,
          content: weeklyContent,
        },
      ],
      sources: {},
    };

    const sectionSettings: CapsuleHistorySectionSettings[] = [
      {
        capsuleId: "capsule-1",
        period: "weekly",
        editorNotes: "Note",
        excludedPostIds: ["post-100"],
        templateId: null,
        toneRecipeId: null,
        promptOverrides: {},
        coverageSnapshot: {},
        discussionThreadId: "thread-1",
        metadata: {},
        updatedAt: null,
        updatedBy: null,
      },
    ];

    const pins: CapsuleHistoryPin[] = [
      {
        id: "pin-summary",
        capsuleId: "capsule-1",
        period: "weekly",
        type: "summary",
        postId: null,
        quote: null,
        source: {},
        rank: 0,
        createdBy: "user-1",
        createdAt: "2024-01-02T00:00:00Z",
        updatedAt: null,
      },
    ];
    const exclusions: CapsuleHistoryExclusion[] = [
      {
        capsuleId: "capsule-1",
        period: "weekly",
        postId: "post-99",
        createdBy: "user-1",
        createdAt: null,
      },
    ];
    const edits: CapsuleHistoryEdit[] = [
      {
        id: "edit-1",
        capsuleId: "capsule-1",
        period: "weekly",
        editorId: "user-1",
        changeType: "refine_section",
        reason: null,
        payload: {},
        snapshot: null,
        createdAt: "2024-01-03T00:00:00Z",
      },
    ];

    const snapshot = composeCapsuleHistorySnapshot({
      capsuleId: "capsule-1",
      capsuleName: "Capsule One",
      suggested,
      published: null,
      coverage,
      promptMemory: DEFAULT_PROMPT_MEMORY,
      templates: DEFAULT_HISTORY_TEMPLATE_PRESETS,
      sectionSettings,
      pins,
      exclusions,
      edits,
      topicPages: [],
      backlinks: [],
    });

    const weekly = snapshot.sections.find((section) => section.period === "weekly");
    expect(weekly?.coverage).toEqual(coverage.weekly);
    expect(weekly?.suggested.summary.pinned).toBe(true);
    expect(weekly?.pinned.map((pin) => pin.id)).toContain("pin-summary");
    expect(weekly?.excludedPostIds.sort()).toEqual(["post-100", "post-99"].sort());
    expect(weekly?.versions[0]?.id).toBe("edit-1");
    expect(weekly?.discussionThreadId).toBe("thread-1");
    expect(snapshot.suggestedGeneratedAt).toBe("2024-01-01T00:00:00Z");
  });
});

describe("extractLatestTimelineTimestampFromStored", () => {
  it("returns the newest timestamp across sections", () => {
    const snapshot: StoredHistorySnapshot = {
      capsuleId: "capsule-1",
      capsuleName: "Capsule One",
      generatedAt: "2024-01-01T00:00:00Z",
      sections: [
        {
          period: "weekly",
          title: "Weekly",
          timeframe: { start: null, end: null },
          postCount: 1,
          isEmpty: false,
          content: {
            summary: makeContentBlock({ period: "weekly", kind: "summary", index: 0, text: "S" }),
            highlights: [],
            articles: [],
            timeline: [
              baseTimelineEntry("tl-1", "2024-01-01T00:00:00Z"),
              baseTimelineEntry("tl-2", "2024-01-10T00:00:00Z"),
            ],
            nextFocus: [],
          },
        },
      ],
      sources: {},
    };

    expect(extractLatestTimelineTimestampFromStored(snapshot)).toBe("2024-01-10T00:00:00Z");
  });
});
