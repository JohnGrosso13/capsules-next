import type {
  CapsuleHistoryArticle,
  CapsuleHistoryArticleLink,
  CapsuleHistoryCoverage,
  CapsuleHistoryCoverageMetric,
  CapsuleHistoryPeriod,
  CapsuleHistoryPromptMemory,
  CapsuleHistoryTemplatePreset,
  CapsuleHistoryTimelineEntry,
  CapsuleHistorySource,
} from "@/types/capsules";
import { normalizeOptionalString } from "../domain/common";
import {
  HISTORY_ARTICLE_LIMIT,
  HISTORY_ARTICLE_LINK_LIMIT,
  HISTORY_ARTICLE_PARAGRAPH_LENGTH,
  HISTORY_ARTICLE_PARAGRAPH_LIMIT,
  HISTORY_ARTICLE_TITLE_LIMIT,
  HISTORY_LINE_LIMIT,
  HISTORY_TIMELINE_LIMIT,
  buildCapsulePostPermalink,
  buildEmptyCoverage,
  ensurePostSource,
  makeContentBlock,
  makeTimelineEntry,
  sanitizeHistoryArray,
  sanitizeHistoryContent,
  sanitizeHistoryString,
  type CapsuleHistoryPost,
  type CapsuleHistoryTimeframe,
} from "./summary";

export type CoverageMetaMap = Record<CapsuleHistoryPeriod, CapsuleHistoryCoverage>;

export type HistoryModelSection = {
  period?: unknown;
  title?: unknown;
  summary?: unknown;
  highlights?: unknown;
  articles?: unknown;
  next_focus?: unknown;
  timeline?: unknown;
  empty?: unknown;
};

export type HistoryModelTimelineEntry = {
  label?: unknown;
  detail?: unknown;
  timestamp?: unknown;
  post_id?: unknown;
};

export type HistoryModelArticle = {
  title?: unknown;
  summary?: unknown;
  paragraphs?: unknown;
  sources?: unknown;
  primary_source_id?: unknown;
};

export type HistoryModelArticleSource = {
  label?: unknown;
  post_id?: unknown;
  url?: unknown;
};

export const DEFAULT_PROMPT_MEMORY: CapsuleHistoryPromptMemory = {
  guidelines: [],
  tone: null,
  mustInclude: [],
  autoLinkTopics: [],
};

export const DEFAULT_HISTORY_TEMPLATE_PRESETS: CapsuleHistoryTemplatePreset[] = [
  {
    id: "press-release",
    label: "Press Release",
    description: "Structured, third-person recap suited for announcements.",
    tone: "formal",
  },
];

export const CAPSULE_HISTORY_RESPONSE_SCHEMA = {
  name: "CapsuleHistory",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["generated_at", "sections"],
    properties: {
      generated_at: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["period", "summary", "highlights", "articles", "timeline", "next_focus"],
          properties: {
            period: { type: "string", enum: ["weekly", "monthly", "all_time"] },
            title: { type: "string" },
            summary: { type: "string" },
            highlights: { type: "array", items: { type: "string" } },
            articles: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "paragraphs"],
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  paragraphs: { type: "array", items: { type: "string" } },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["label"],
                      properties: {
                        label: { type: "string" },
                        post_id: { type: ["string", "null"] },
                        url: { type: ["string", "null"] },
                      },
                    },
                  },
                  primary_source_id: { type: ["string", "null"] },
                },
              },
            },
            timeline: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "detail"],
                properties: {
                  label: { type: "string" },
                  detail: { type: "string" },
                  timestamp: { type: ["string", "null"] },
                  post_id: { type: ["string", "null"] },
                },
              },
            },
            next_focus: { type: "array", items: { type: "string" } },
            empty: { type: "boolean" },
          },
        },
      },
    },
  },
} as const;

export function normalizeHistoryPeriod(value: unknown): CapsuleHistoryPeriod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "weekly" || normalized === "monthly" || normalized === "all_time") {
    return normalized;
  }
  return null;
}

export function coercePromptMemory(value: unknown): CapsuleHistoryPromptMemory {
  if (!value || typeof value !== "object") {
    return DEFAULT_PROMPT_MEMORY;
  }
  const record = value as Record<string, unknown>;
  const guidelines = Array.isArray(record.guidelines)
    ? record.guidelines.filter((entry): entry is string => typeof entry === "string")
    : [];
  const mustInclude = Array.isArray(record.mustInclude)
    ? record.mustInclude.filter((entry): entry is string => typeof entry === "string")
    : [];
  const autoLinkTopics = Array.isArray(record.autoLinkTopics)
    ? record.autoLinkTopics.filter((entry): entry is string => typeof entry === "string")
    : [];
  const tone = typeof record.tone === "string" ? record.tone : null;
  return {
    guidelines,
    mustInclude,
    autoLinkTopics,
    tone,
  };
}

export function coerceTemplatePresets(value: unknown): CapsuleHistoryTemplatePreset[] {
  if (!Array.isArray(value)) {
    return DEFAULT_HISTORY_TEMPLATE_PRESETS;
  }
  const presets: CapsuleHistoryTemplatePreset[] = [];
  const legacyDefaults = new Set(["press-release", "community-recap", "investor-brief"]);
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const label = typeof record.label === "string" ? record.label : null;
    if (!id || !label) return;
    presets.push({
      id,
      label,
      description: typeof record.description === "string" ? record.description : null,
      tone: typeof record.tone === "string" ? record.tone : null,
    });
  });
  if (!presets.length) return DEFAULT_HISTORY_TEMPLATE_PRESETS;

  const ids = new Set(presets.map((preset) => preset.id));
  const isLegacyPresetSet =
    presets.length >= 3 && presets.length <= legacyDefaults.size && ids.size === presets.length &&
    presets.every((preset) => legacyDefaults.has(preset.id));

  if (isLegacyPresetSet) {
    return presets.filter((preset) => preset.id === "press-release");
  }

  return presets;
}

export function coerceCoverageMeta(value: Record<string, unknown>): CoverageMetaMap {
  const base: CoverageMetaMap = {
    weekly: buildEmptyCoverage(),
    monthly: buildEmptyCoverage(),
    all_time: buildEmptyCoverage(),
  };
  (Object.keys(base) as CapsuleHistoryPeriod[]).forEach((period) => {
    const raw = value?.[period];
    if (!raw || typeof raw !== "object") return;
    const record = raw as Record<string, unknown>;
    const completeness = typeof record.completeness === "number" ? record.completeness : 0;
    const authors = Array.isArray(record.authors)
      ? record.authors
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const data = entry as Record<string, unknown>;
            const id = typeof data.id === "string" ? data.id : null;
            const label = typeof data.label === "string" ? data.label : null;
            if (!id || !label) return null;
            return {
              id,
              label,
              covered: Boolean(data.covered),
              weight: Number(data.weight ?? 0) || 0,
            };
          })
          .filter((item): item is CapsuleHistoryCoverageMetric => item !== null)
      : [];
    const themes = Array.isArray(record.themes)
      ? record.themes
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const data = entry as Record<string, unknown>;
            const id = typeof data.id === "string" ? data.id : null;
            const label = typeof data.label === "string" ? data.label : null;
            if (!id || !label) return null;
            return {
              id,
              label,
              covered: Boolean(data.covered),
              weight: Number(data.weight ?? 0) || 0,
            };
          })
          .filter((item): item is CapsuleHistoryCoverageMetric => item !== null)
      : [];
    const timeSpans = Array.isArray(record.timeSpans)
      ? record.timeSpans
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const data = entry as Record<string, unknown>;
            const id = typeof data.id === "string" ? data.id : null;
            const label = typeof data.label === "string" ? data.label : null;
            if (!id || !label) return null;
            return {
              id,
              label,
              covered: Boolean(data.covered),
              weight: Number(data.weight ?? 0) || 0,
            };
          })
          .filter((item): item is CapsuleHistoryCoverageMetric => item !== null)
      : [];
    base[period] = {
      completeness,
      authors,
      themes,
      timeSpans,
    };
  });
  return base;
}

function coerceArticleLinks(
  value: unknown,
  capsuleId: string,
  sources: Record<string, CapsuleHistorySource>,
  postLookup: Map<string, CapsuleHistoryPost>,
): { links: CapsuleHistoryArticleLink[]; sourceIds: string[] } {
  if (!Array.isArray(value)) {
    return { links: [], sourceIds: [] };
  }

  const links: CapsuleHistoryArticleLink[] = [];
  const sourceIds: string[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as HistoryModelArticleSource;
    const rawPostId =
      typeof record.post_id === "string" && record.post_id.trim().length
        ? record.post_id.trim()
        : null;
    let resolvedSourceId: string | null = null;
    if (rawPostId && postLookup.has(rawPostId)) {
      resolvedSourceId = ensurePostSource(sources, capsuleId, postLookup.get(rawPostId)!);
    }
    const label =
      sanitizeHistoryString(record.label, 140) ??
      (resolvedSourceId && sources[resolvedSourceId]?.label
        ? sanitizeHistoryString(sources[resolvedSourceId]?.label ?? null, 140)
        : null) ??
      (rawPostId && postLookup.has(rawPostId)
        ? sanitizeHistoryString(postLookup.get(rawPostId)!.content, 140)
        : null);

    let url =
      typeof record.url === "string" && record.url.trim().length ? record.url.trim() : null;
    if (!url && resolvedSourceId) {
      url = sources[resolvedSourceId]?.url ?? null;
    }

    const safeLabel = label ?? "Capsule post";
    links.push({
      label: safeLabel,
      url,
      sourceId: resolvedSourceId,
    });

    if (resolvedSourceId) {
      sourceIds.push(resolvedSourceId);
    }

    if (links.length >= HISTORY_ARTICLE_LINK_LIMIT) break;
  }

  return {
    links,
    sourceIds: Array.from(new Set(sourceIds)),
  };
}

export function coerceHistoryArticles(
  capsuleId: string,
  period: CapsuleHistoryPeriod,
  timeframe: CapsuleHistoryTimeframe,
  value: unknown,
  sources: Record<string, CapsuleHistorySource>,
  postLookup: Map<string, CapsuleHistoryPost>,
): CapsuleHistoryArticle[] {
  if (!Array.isArray(value)) return [];
  const articles: CapsuleHistoryArticle[] = [];
  const entries = (value as HistoryModelArticle[]).slice(0, HISTORY_ARTICLE_LIMIT);

  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;

    const titleCandidate = sanitizeHistoryString(entry.title, HISTORY_ARTICLE_TITLE_LIMIT);
    const summaryCandidate = sanitizeHistoryContent(entry.summary);
    let paragraphs = sanitizeHistoryArray(
      entry.paragraphs,
      HISTORY_ARTICLE_PARAGRAPH_LIMIT,
      HISTORY_ARTICLE_PARAGRAPH_LENGTH,
    );

    if (!paragraphs.length && summaryCandidate.length) {
      paragraphs = [summaryCandidate];
    }
    if (!paragraphs.length) {
      paragraphs = [titleCandidate ?? `${timeframe.label} highlights`];
    }

    const primarySourcePostId =
      typeof entry.primary_source_id === "string" && entry.primary_source_id.trim().length
        ? entry.primary_source_id.trim()
        : null;

    const { links, sourceIds } = coerceArticleLinks(entry.sources, capsuleId, sources, postLookup);

    if (primarySourcePostId && postLookup.has(primarySourcePostId)) {
      const primarySourceId = ensurePostSource(
        sources,
        capsuleId,
        postLookup.get(primarySourcePostId)!,
      );
      if (!sourceIds.includes(primarySourceId)) {
        sourceIds.unshift(primarySourceId);
      }
      const existingIndex = links.findIndex((link) => link.sourceId === primarySourceId);
      if (existingIndex >= 0) {
        const [primary] = links.splice(existingIndex, 1);
        if (primary) {
          links.unshift(primary);
        }
      } else {
        const primarySource = sources[primarySourceId] ?? null;
        links.unshift({
          url: primarySource?.url ?? null,
          label:
            primarySource?.label ??
            sanitizeHistoryString(primarySource?.description, HISTORY_ARTICLE_TITLE_LIMIT) ??
            `Post ${primarySourcePostId}`,
          sourceId: primarySourceId,
        });
      }
    }

    const metadata = {
      title: titleCandidate ?? `${timeframe.label} highlights`,
      paragraphs,
      links,
    };
    const text = paragraphs[0] ?? metadata.title;
    if (!text) return;
    const block = makeContentBlock({
      period,
      kind: "article",
      index,
      text,
      seed: `${period}-article-${index}`,
      sourceIds: Array.from(new Set(sourceIds)),
      metadata,
    }) as CapsuleHistoryArticle;
    articles.push(block);
  });

  return articles;
}

export function coerceTimelineEntries(
  value: unknown,
  capsuleId: string,
  period: CapsuleHistoryPeriod,
  sources: Record<string, CapsuleHistorySource>,
  postLookup: Map<string, CapsuleHistoryPost>,
): CapsuleHistoryTimelineEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CapsuleHistoryTimelineEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as HistoryModelTimelineEntry;
    const label = sanitizeHistoryString(record.label, 120);
    const detail = sanitizeHistoryString(record.detail, HISTORY_LINE_LIMIT);
    const timestamp =
      typeof record.timestamp === "string" && record.timestamp.trim().length
        ? record.timestamp.trim()
        : null;
    if (!label || !detail) continue;
    const postIdRaw = record.post_id;
    let postId: string | null = null;
    if (typeof postIdRaw === "string") {
      postId = normalizeOptionalString(postIdRaw);
    } else if (typeof postIdRaw === "number" && Number.isFinite(postIdRaw)) {
      postId = normalizeOptionalString(String(postIdRaw));
    }
    let sourceIds: string[] = [];
    if (postId) {
      const post = postLookup.get(postId) ?? null;
      if (post) {
        sourceIds = [ensurePostSource(sources, capsuleId, post)];
      } else {
        const fallbackSourceId = `post:${postId}`;
        if (!sources[fallbackSourceId]) {
          sources[fallbackSourceId] = {
            id: fallbackSourceId,
            type: "post",
            label: `Post ${postId}`,
            description: null,
            url: buildCapsulePostPermalink(capsuleId, postId),
            postId,
            topicPageId: null,
            quoteId: null,
            authorName: null,
            authorAvatarUrl: null,
            occurredAt: null,
            metrics: {
              reactions: null,
              comments: null,
              shares: null,
            },
          };
        }
        sourceIds = [fallbackSourceId];
      }
    }
    entries.push(
      makeTimelineEntry({
        period,
        index: entries.length,
        label,
        detail,
        timestamp,
        postId,
        permalink: postId ? buildCapsulePostPermalink(capsuleId, postId) : null,
        sourceIds,
      }),
    );
    if (entries.length >= HISTORY_TIMELINE_LIMIT) break;
  }
  return entries;
}
