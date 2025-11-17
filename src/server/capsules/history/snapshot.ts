import { createHash } from "node:crypto";

import type {
  CapsuleHistoryArticle,
  CapsuleHistoryCandidate,
  CapsuleHistoryContentBlock,
  CapsuleHistoryPeriod,
  CapsuleHistoryPinnedItem,
  CapsuleHistoryPinnedItemType,
  CapsuleHistoryPromptMemory,
  CapsuleHistorySection,
  CapsuleHistorySectionContent,
  CapsuleHistorySnapshot,
  CapsuleHistoryTemplatePreset,
  CapsuleHistoryTimelineEntry,
  CapsuleHistorySource,
  CapsuleHistoryVersion,
} from "@/types/capsules";
import type {
  CapsuleHistoryPin,
  CapsuleHistoryExclusion,
  CapsuleHistoryEdit,
  CapsuleHistorySectionSettings,
  CapsuleTopicPage,
  CapsuleTopicPageBacklink,
} from "../repository";
import {
  buildEmptyCoverage,
  cloneContentBlock,
  makeContentBlock,
  normalizeArticleBlock,
  type CapsuleHistoryTimeframe,
} from "./summary";
import { normalizeHistoryPeriod, type CoverageMetaMap } from "./schema";

export type StoredHistorySection = {
  period: CapsuleHistoryPeriod;
  title: string;
  timeframe: { start: string | null; end: string | null };
  postCount: number;
  isEmpty: boolean;
  content: CapsuleHistorySectionContent;
};

export type StoredHistorySnapshot = {
  capsuleId: string;
  capsuleName: string | null;
  generatedAt: string;
  sections: StoredHistorySection[];
  sources: Record<string, CapsuleHistorySource>;
};

export function cloneTimelineEntry(entry: CapsuleHistoryTimelineEntry): CapsuleHistoryTimelineEntry {
  return {
    ...cloneContentBlock(entry),
    label: entry.label,
    detail: entry.detail,
    timestamp: entry.timestamp ?? null,
    postId: entry.postId ?? null,
    permalink: entry.permalink ?? null,
  };
}

export function cloneSectionContent(content: CapsuleHistorySectionContent): CapsuleHistorySectionContent {
  return {
    summary: cloneContentBlock(content.summary),
    highlights: content.highlights.map((item) => cloneContentBlock(item)),
    articles: content.articles.map((item) =>
      normalizeArticleBlock(cloneContentBlock(item) as CapsuleHistoryArticle),
    ),
    timeline: content.timeline.map((item) => cloneTimelineEntry(item)),
    nextFocus: content.nextFocus.map((item) => cloneContentBlock(item)),
  };
}

function normalizePinType(value: string | null | undefined): CapsuleHistoryPinnedItemType {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "summary" || normalized === "highlight" || normalized === "timeline") {
    return normalized;
  }
  if (normalized === "next_focus" || normalized === "next-focus") {
    return "next_focus";
  }
  return "highlight";
}

export function decorateContentWithPins(
  content: CapsuleHistorySectionContent,
  pins: CapsuleHistoryPin[],
): CapsuleHistorySectionContent {
  if (!pins.length) {
    return cloneSectionContent(content);
  }

  const decorated = cloneSectionContent(content);

  const findHighlight = (pin: CapsuleHistoryPin) => {
    const needle = typeof pin.quote === "string" ? pin.quote.trim().toLowerCase() : "";
    if (!needle && pin.postId) {
      const postSourceId = `post:${pin.postId}`;
      return decorated.highlights.find((block) => block.sourceIds.includes(postSourceId)) ?? null;
    }
    return decorated.highlights.find((block) => block.text.trim().toLowerCase() === needle) ?? null;
  };

  const findNextFocus = (pin: CapsuleHistoryPin) => {
    const needle = typeof pin.quote === "string" ? pin.quote.trim().toLowerCase() : "";
    if (!needle) return null;
    return decorated.nextFocus.find((block) => block.text.trim().toLowerCase() === needle) ?? null;
  };

  const findTimeline = (pin: CapsuleHistoryPin) => {
    if (pin.postId) {
      const matched = decorated.timeline.find((entry) => entry.postId === pin.postId);
      if (matched) return matched;
    }
    const needle = typeof pin.quote === "string" ? pin.quote.trim() : "";
    if (!needle) return null;
    return decorated.timeline.find((entry) => entry.detail.includes(needle)) ?? null;
  };

  pins.forEach((pin) => {
    const type = normalizePinType(pin.type);
    if (type === "summary") {
      decorated.summary.pinned = true;
      decorated.summary.pinId = pin.id;
      return;
    }
    if (type === "highlight") {
      const highlight = findHighlight(pin);
      if (highlight) {
        highlight.pinned = true;
        highlight.pinId = pin.id;
      }
      return;
    }
    if (type === "next_focus") {
      const next = findNextFocus(pin);
      if (next) {
        next.pinned = true;
        next.pinId = pin.id;
      }
      return;
    }
    if (type === "timeline") {
      const timelineEntry = findTimeline(pin);
      if (timelineEntry) {
        timelineEntry.pinned = true;
        timelineEntry.pinId = pin.id;
      }
    }
  });

  return decorated;
}

export function convertPinToPinnedItem(pin: CapsuleHistoryPin): CapsuleHistoryPinnedItem {
  const type = normalizePinType(pin.type);
  const sourceRecord =
    pin.source && typeof pin.source === "object" ? (pin.source as Record<string, unknown>) : null;
  const sourceIdValue =
    sourceRecord && typeof sourceRecord.source_id === "string" ? sourceRecord.source_id : null;
  const fallbackSourceId = pin.postId ? `post:${pin.postId}` : null;
  return {
    id: pin.id,
    type,
    period: pin.period,
    postId: pin.postId ?? null,
    quote: typeof pin.quote === "string" ? pin.quote : null,
    rank: Number.isFinite(pin.rank) ? Number(pin.rank) : 0,
    sourceId: sourceIdValue ?? fallbackSourceId,
    createdAt: pin.createdAt ?? null,
    createdBy: pin.createdBy ?? null,
  };
}

export function buildSectionCandidates(
  content: CapsuleHistorySectionContent,
  sources: Record<string, CapsuleHistorySource>,
): CapsuleHistoryCandidate[] {
  const seen = new Set<string>();
  const candidates: CapsuleHistoryCandidate[] = [];

  content.timeline.forEach((entry) => {
    const sourceId = entry.sourceIds[0] ?? (entry.postId ? `post:${entry.postId}` : null);
    const source = sourceId ? sources[sourceId] ?? null : null;
    const id = sourceId ?? entry.id;
    if (seen.has(id)) return;
    seen.add(id);
    candidates.push({
      id,
      kind: "post",
      postId: source?.postId ?? entry.postId ?? null,
      quoteId: source?.quoteId ?? null,
      title: source?.label ?? entry.label,
      excerpt: entry.detail ?? entry.text,
      sourceIds: sourceId ? [sourceId] : [],
      createdAt: source?.occurredAt ?? entry.timestamp ?? null,
      authorName: source?.authorName ?? null,
      authorAvatarUrl: source?.authorAvatarUrl ?? null,
      metrics: {
        reactions: Number(source?.metrics.reactions ?? 0) || 0,
        comments: Number(source?.metrics.comments ?? 0) || 0,
        shares: Number(source?.metrics.shares ?? 0) || 0,
      },
      tags: [],
    });
  });

  content.highlights.forEach((block) => {
    if (!block.text || block.text.length < 8) return;
    const candidateId = `highlight:${block.id}`;
    if (seen.has(candidateId)) return;
    seen.add(candidateId);
    const sourceId = block.sourceIds[0] ?? null;
    const source = sourceId ? sources[sourceId] ?? null : null;
    candidates.push({
      id: candidateId,
      kind: "quote",
      postId: source?.postId ?? null,
      quoteId: source?.quoteId ?? null,
      title: source?.label ?? "Highlight",
      excerpt: block.text,
      sourceIds: sourceId ? [sourceId] : [],
      createdAt: source?.occurredAt ?? null,
      authorName: source?.authorName ?? null,
      authorAvatarUrl: source?.authorAvatarUrl ?? null,
      metrics: {
        reactions: Number(source?.metrics.reactions ?? 0) || 0,
        comments: Number(source?.metrics.comments ?? 0) || 0,
        shares: Number(source?.metrics.shares ?? 0) || 0,
      },
      tags: [],
    });
  });

  return candidates;
}

export function composeCapsuleHistorySnapshot(params: {
  capsuleId: string;
  capsuleName: string | null;
  suggested: StoredHistorySnapshot | null;
  published: StoredHistorySnapshot | null;
  coverage: CoverageMetaMap;
  promptMemory: CapsuleHistoryPromptMemory;
  templates: CapsuleHistoryTemplatePreset[];
  sectionSettings: CapsuleHistorySectionSettings[];
  pins: CapsuleHistoryPin[];
  exclusions: CapsuleHistoryExclusion[];
  edits: CapsuleHistoryEdit[];
  topicPages: CapsuleTopicPage[];
  backlinks: CapsuleTopicPageBacklink[];
}): CapsuleHistorySnapshot {
  const periods: CapsuleHistoryPeriod[] = ["weekly", "monthly", "all_time"];
  const sources: Record<string, CapsuleHistorySource> = {};

  const mergeSources = (origin: StoredHistorySnapshot | null) => {
    if (!origin || !origin.sources) return;
    Object.entries(origin.sources).forEach(([sourceId, source]) => {
      if (!sourceId || sources[sourceId]) return;
      sources[sourceId] = source;
    });
  };

  mergeSources(params.suggested);
  mergeSources(params.published);

  const sections: CapsuleHistorySection[] = periods.map((period) => {
    const suggestedSection =
      params.suggested?.sections.find((section) => section.period === period) ?? null;
    const publishedSection =
      params.published?.sections.find((section) => section.period === period) ?? null;
    const settings = params.sectionSettings.find((entry) => entry.period === period) ?? null;
    const pins = params.pins
      .filter((pin) => pin.period === period)
      .slice()
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          (a.createdAt ?? "").localeCompare(b.createdAt ?? "", undefined, { sensitivity: "base" }),
      );
    const exclusions = params.exclusions.filter((entry) => entry.period === period);
    const edits = params.edits.filter((entry) => entry.period === period);

    const decoratedSuggested = suggestedSection
      ? decorateContentWithPins(suggestedSection.content, pins)
      : decorateContentWithPins(
          {
            summary: makeContentBlock({
              period,
              kind: "summary",
              index: 0,
              text: "No updates captured for this period yet.",
              seed: `${period}-empty`,
            }),
            highlights: [],
            articles: [],
            timeline: [],
            nextFocus: [],
          },
          pins,
        );

    const decoratedPublished = publishedSection
      ? decorateContentWithPins(publishedSection.content, pins)
      : null;

    const pinnedItems = pins.map(convertPinToPinnedItem);
    const coverage = params.coverage[period] ?? buildEmptyCoverage();
    const editorNotes = settings?.editorNotes ?? null;
    const excludedPostIds = Array.from(
      new Set([
        ...(settings?.excludedPostIds ?? []),
        ...exclusions.map((entry) => entry.postId),
      ]),
    );
    const versions: CapsuleHistoryVersion[] = edits.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      editorId: entry.editorId,
      editorName: null,
      changeType: entry.changeType,
      reason: entry.reason,
    }));
    const lastEdited = edits[0] ?? null;
    const candidates = buildSectionCandidates(decoratedSuggested, sources);

    const postCount = suggestedSection?.postCount ?? publishedSection?.postCount ?? 0;
    const timeframe =
      suggestedSection?.timeframe ?? publishedSection?.timeframe ?? { start: null, end: null };
    const title = suggestedSection?.title ?? publishedSection?.title ?? period.toUpperCase();
    return {
      period,
      title,
      timeframe,
      postCount,
      suggested: decoratedSuggested,
      published: decoratedPublished,
      editorNotes,
      excludedPostIds,
      coverage,
      candidates,
      pinned: pinnedItems,
      versions,
      discussionThreadId: settings?.discussionThreadId ?? null,
      lastEditedAt: lastEdited?.createdAt ?? null,
      lastEditedBy: lastEdited?.editorId ?? null,
      templateId: settings?.templateId ?? null,
      toneRecipeId: settings?.toneRecipeId ?? null,
    };
  });

  return {
    capsuleId: params.capsuleId,
    capsuleName: params.capsuleName,
    suggestedGeneratedAt: params.suggested?.generatedAt ?? new Date().toISOString(),
    publishedGeneratedAt: params.published?.generatedAt ?? null,
    sections,
    sources,
    promptMemory: params.promptMemory,
    templates: params.templates,
  };
}

export function coerceStoredSnapshot(
  value: Record<string, unknown> | null,
): StoredHistorySnapshot | null {
  if (!value) return null;
  const record = value as Record<string, unknown>;
  const sectionsRaw = Array.isArray(record.sections) ? record.sections : [];
  const sections: StoredHistorySection[] = [];

  sectionsRaw.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const period = normalizeHistoryPeriod(raw.period);
    if (!period) return;
    const title = typeof raw.title === "string" ? raw.title : period.toUpperCase();
    const timeframeRaw = raw.timeframe;
    const timeframe =
      timeframeRaw && typeof timeframeRaw === "object"
        ? {
            start:
              typeof (timeframeRaw as Record<string, unknown>).start === "string"
                ? ((timeframeRaw as Record<string, unknown>).start as string)
                : null,
            end:
              typeof (timeframeRaw as Record<string, unknown>).end === "string"
                ? ((timeframeRaw as Record<string, unknown>).end as string)
                : null,
          }
        : { start: null, end: null };
    const postCount = Number(raw.postCount ?? 0) || 0;
    const isEmpty = Boolean(raw.isEmpty);
    const contentRaw = raw.content;

    const coerceBlock = (blockValue: unknown): CapsuleHistoryContentBlock => {
      if (!blockValue || typeof blockValue !== "object") {
        return makeContentBlock({
          period,
          kind: "summary",
          index: 0,
          text: "",
          seed: `${period}-missing`,
        });
      }
      return cloneContentBlock(blockValue as CapsuleHistoryContentBlock);
    };

    const coerceBlockArray = (value: unknown[]): CapsuleHistoryContentBlock[] =>
      value.map((item) => cloneContentBlock(item as CapsuleHistoryContentBlock));

    const coerceArticleArray = (value: unknown[]): CapsuleHistoryArticle[] =>
      value.map((item) =>
        normalizeArticleBlock(cloneContentBlock(item as CapsuleHistoryContentBlock) as CapsuleHistoryArticle),
      );

    const coerceTimelineArray = (value: unknown[]): CapsuleHistoryTimelineEntry[] =>
      value.map((item) => cloneTimelineEntry(item as CapsuleHistoryTimelineEntry));

    const content: CapsuleHistorySectionContent =
      contentRaw && typeof contentRaw === "object"
        ? {
            summary: coerceBlock((contentRaw as Record<string, unknown>).summary),
            highlights: Array.isArray((contentRaw as Record<string, unknown>).highlights)
              ? coerceBlockArray((contentRaw as Record<string, unknown>).highlights as unknown[])
              : [],
            articles: Array.isArray((contentRaw as Record<string, unknown>).articles)
              ? coerceArticleArray((contentRaw as Record<string, unknown>).articles as unknown[])
              : [],
            timeline: Array.isArray((contentRaw as Record<string, unknown>).timeline)
              ? coerceTimelineArray((contentRaw as Record<string, unknown>).timeline as unknown[])
              : [],
            nextFocus: Array.isArray((contentRaw as Record<string, unknown>).nextFocus)
              ? coerceBlockArray((contentRaw as Record<string, unknown>).nextFocus as unknown[])
              : [],
          }
        : {
            summary: makeContentBlock({
              period,
              kind: "summary",
              index: 0,
              text: "",
              seed: `${period}-empty`,
            }),
            highlights: [],
            articles: [],
            timeline: [],
            nextFocus: [],
          };

    sections.push({
      period,
      title,
      timeframe,
      postCount,
      isEmpty,
      content,
    });
  });

  if (!sections.length) return null;
  const generatedAt =
    typeof record.generatedAt === "string"
      ? (record.generatedAt as string)
      : typeof record.generated_at === "string"
        ? (record.generated_at as string)
        : new Date().toISOString();
  const capsuleId = typeof record.capsuleId === "string" ? (record.capsuleId as string) : "";
  const capsuleName =
    typeof record.capsuleName === "string" ? (record.capsuleName as string) : null;
  const sources =
    record.sources && typeof record.sources === "object"
      ? (record.sources as Record<string, CapsuleHistorySource>)
      : {};

  return {
    capsuleId,
    capsuleName,
    generatedAt,
    sections,
    sources,
  };
}

export function toTimestamp(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim().length) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractLatestTimelineTimestampFromStored(
  snapshot: StoredHistorySnapshot | null,
): string | null {
  if (!snapshot) return null;
  let latest: { iso: string; ms: number } | null = null;
  for (const section of snapshot.sections) {
    for (const entry of section.content.timeline) {
      if (!entry?.timestamp) continue;
      const ms = toTimestamp(entry.timestamp);
      if (ms === null) continue;
      if (!latest || ms > latest.ms) {
        latest = { iso: entry.timestamp, ms };
      }
    }
  }
  if (!latest) {
    return null;
  }
  return latest.iso;
}

export function computeSectionContentHash(content: CapsuleHistorySectionContent): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function computeTimeframeHash(timeframe: CapsuleHistoryTimeframe): string {
  const hasher = createHash("sha256");
  hasher.update(timeframe.period);
  hasher.update(timeframe.start ?? "");
  hasher.update(timeframe.end ?? "");
  timeframe.posts.forEach((post) => {
    hasher.update(post.id);
    hasher.update(post.createdAt ?? "");
    hasher.update(post.user ?? "");
    hasher.update(post.content);
  });
  return hasher.digest("hex");
}

export function buildPeriodHashMap(timeframes: CapsuleHistoryTimeframe[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  timeframes.forEach((timeframe) => {
    hashes[timeframe.period] = computeTimeframeHash(timeframe);
  });
  return hashes;
}
