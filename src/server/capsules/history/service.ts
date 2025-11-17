import type {
  CapsuleHistoryArticle,
  CapsuleHistoryArticleLink,
  CapsuleHistoryArticleMetadata,
  CapsuleHistorySnapshot,
  CapsuleHistorySource,
  CapsuleHistoryPeriod,
  CapsuleHistorySectionContent,
} from "@/types/capsules";
import {
  CapsuleMembershipError,
  normalizeId,
  normalizeOptionalString,
  requireCapsule,
} from "../domain/common";
import {
  getCapsuleHistoryActivity,
  getCapsuleHistorySnapshotRecord,
  upsertCapsuleHistorySnapshotRecord,
  listCapsuleHistoryPins,
  listCapsuleHistoryEdits,
  listCapsuleHistoryExclusions,
  listCapsuleHistorySectionSettings,
  listCapsuleHistoryRefreshCandidates,
  listCapsuleTopicPages,
  listCapsuleTopicPageBacklinks,
  insertCapsuleHistoryPin,
  deleteCapsuleHistoryPin,
  insertCapsuleHistoryExclusion,
  deleteCapsuleHistoryExclusion,
  upsertCapsuleHistorySectionSettingsRecord,
  updateCapsuleHistoryPromptMemory,
  insertCapsuleHistoryEdit,
  updateCapsuleHistoryPublishedSnapshotRecord,
} from "../repository";
import { AIConfigError } from "@/lib/ai/prompter";
import { enqueueCapsuleKnowledgeRefresh } from "../knowledge";
import {
  getCachedCapsuleHistory,
  setCachedCapsuleHistory,
} from "./cache";
import { fetchCapsuleHistoryPostRows } from "./db";
import {
  HISTORY_ARTICLE_LINK_LIMIT,
  HISTORY_ARTICLE_PARAGRAPH_LENGTH,
  HISTORY_ARTICLE_PARAGRAPH_LIMIT,
  HISTORY_SUMMARY_LIMIT,
  buildEmptyCoverage,
  buildFallbackHighlights,
  buildFallbackNextFocus,
  buildFallbackSummary,
  buildFallbackTimelineEntries,
  buildHistoryTimeframes,
  computeCoverageMetrics,
  ensurePostSource,
  makeContentBlock,
  mapHistoryPostRow,
  sanitizeHistoryArray,
  sanitizeHistoryString,
} from "./summary";
import type { CapsuleHistoryPost, CapsuleHistoryTimeframe } from "./summary";
import { indexCapsuleHistorySnapshot } from "../knowledge-index";
import {
  DEFAULT_HISTORY_TEMPLATE_PRESETS,
  DEFAULT_PROMPT_MEMORY,
  coerceCoverageMeta,
  coerceHistoryArticles,
  coercePromptMemory,
  coerceTemplatePresets,
  coerceTimelineEntries,
  normalizeHistoryPeriod,
  type CoverageMetaMap,
  type HistoryModelSection,
} from "./schema";
import {
  buildPeriodHashMap,
  coerceStoredSnapshot,
  composeCapsuleHistorySnapshot,
  extractLatestTimelineTimestampFromStored,
  toTimestamp,
  type StoredHistorySection,
  type StoredHistorySnapshot,
} from "./snapshot";
import { generateCapsuleHistoryFromModel } from "./ai";

function buildFallbackArticles(
  capsuleId: string,
  timeframe: CapsuleHistoryTimeframe,
  summaryText: string,
  highlightTexts: string[],
  sources: Record<string, CapsuleHistorySource>,
): CapsuleHistoryArticle[] {
  const period = timeframe.period;
  const fallbackParagraphs: string[] = [];
  const summaryParagraph = sanitizeHistoryString(summaryText, HISTORY_ARTICLE_PARAGRAPH_LENGTH);
  if (summaryParagraph) {
    fallbackParagraphs.push(summaryParagraph);
  }

  if (fallbackParagraphs.length < HISTORY_ARTICLE_PARAGRAPH_LIMIT) {
    const highlightParagraph = highlightTexts
      .map((item) => sanitizeHistoryString(item, HISTORY_ARTICLE_PARAGRAPH_LENGTH))
      .find((item): item is string => Boolean(item));
    if (highlightParagraph) {
      fallbackParagraphs.push(highlightParagraph);
    }
  }

  if (!fallbackParagraphs.length) {
    const message =
      timeframe.posts.length === 0
        ? `Capsule AI didn't find new activity for ${timeframe.label.toLowerCase()}. Share an update to get this wiki started.`
        : `${timeframe.posts.length} update${timeframe.posts.length === 1 ? "" : "s"} were shared. Capture the highlights to keep your team aligned.`;
    fallbackParagraphs.push(message);
  }

  const links: CapsuleHistoryArticleLink[] = [];
  const sourceIds: string[] = [];
  timeframe.posts.slice(0, HISTORY_ARTICLE_LINK_LIMIT).forEach((post) => {
    const sourceId = ensurePostSource(sources, capsuleId, post);
    const source = sources[sourceId] ?? null;
    const label =
      sanitizeHistoryString(source?.label, 140) ??
      sanitizeHistoryString(post.content, 140) ??
      `Post from ${post.user ?? "member"}`;
    links.push({
      label: label ?? "Capsule post",
      url: source?.url ?? null,
      sourceId,
    });
    sourceIds.push(sourceId);
  });

  const metadata: CapsuleHistoryArticleMetadata = {
    title: `${timeframe.label} recap`,
    paragraphs: fallbackParagraphs.slice(0, HISTORY_ARTICLE_PARAGRAPH_LIMIT),
    links,
  };
  if (!metadata.paragraphs.length) {
    metadata.paragraphs = [`Capsule AI is still gathering updates for ${timeframe.label.toLowerCase()}.`];
  }
  const articleText = metadata.paragraphs[0] ?? `${timeframe.label} recap`;

  const block = makeContentBlock({
    period,
    kind: "article",
    index: 0,
    text: articleText,
    seed: `${period}-article-fallback`,
    sourceIds: Array.from(new Set(sourceIds)),
    metadata,
  }) as CapsuleHistoryArticle;

  return [block];
}

function ensureEditorId(editorId: string | null | undefined): string {
  const normalized = normalizeId(editorId ?? null);
  if (!normalized) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  return normalized;
}

function ensureHistoryPeriod(
  value: CapsuleHistoryPeriod | string | null | undefined,
): CapsuleHistoryPeriod {
  const period = normalizeHistoryPeriod(value);
  if (!period) {
    throw new CapsuleMembershipError("invalid", "Invalid history period.", 400);
  }
  return period;
}

async function resolveCapsuleContext(capsuleId: string): Promise<{
  capsuleId: string;
  capsuleName: string | null;
}> {
  const { capsule } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.history: capsule has invalid identifier");
  }
  return { capsuleId: capsuleIdValue, capsuleName: normalizeOptionalString(capsule.name ?? null) };
}

async function loadCapsuleHistoryPosts(
  capsuleId: string,
  limit = HISTORY_POST_LIMIT,
): Promise<CapsuleHistoryPost[]> {
  const rows = await fetchCapsuleHistoryPostRows(capsuleId, limit);
  return rows
    .map(mapHistoryPostRow)
    .filter((post): post is CapsuleHistoryPost => post !== null);
}



















function buildHistorySections(
  capsuleId: string,
  timeframes: CapsuleHistoryTimeframe[],
  modelSections: HistoryModelSection[] | null,
  sources: Record<string, CapsuleHistorySource>,
): { sections: StoredHistorySection[]; coverage: CoverageMetaMap } {
  const coverage: CoverageMetaMap = {
    weekly: buildEmptyCoverage(),
    monthly: buildEmptyCoverage(),
    all_time: buildEmptyCoverage(),
  };

  const sections = timeframes.map((timeframe) => {
    const period = timeframe.period;
    const posts = timeframe.posts;
    const postLookup = new Map<string, CapsuleHistoryPost>();
    posts.forEach((post) => {
      postLookup.set(post.id, post);
      ensurePostSource(sources, capsuleId, post);
    });

    const match =
      modelSections?.find(
        (section) => normalizeHistoryPeriod(section.period) === timeframe.period,
      ) ?? null;

    const title = sanitizeHistoryString(match?.title, 80) ?? timeframe.label;
    const summaryText =
      sanitizeHistoryString(match?.summary, HISTORY_SUMMARY_LIMIT) ??
      buildFallbackSummary(timeframe);

    const summaryBlock = makeContentBlock({
      period,
      kind: "summary",
      index: 0,
      text: summaryText,
      seed: `${period}-summary`,
    });

    const modelHighlights = sanitizeHistoryArray(match?.highlights, HISTORY_HIGHLIGHT_LIMIT);
    const resolvedHighlights = modelHighlights.length
      ? modelHighlights
      : sanitizeHistoryArray(buildFallbackHighlights(timeframe), HISTORY_HIGHLIGHT_LIMIT);
    const highlightBlocks = resolvedHighlights.map((text, index) =>
      makeContentBlock({
        period,
        kind: "highlight",
        index,
        text,
        seed: `${period}-highlight-${index}`,
      }),
    );

    const modelArticles = coerceHistoryArticles(
      capsuleId,
      period,
      timeframe,
      match?.articles,
      sources,
      postLookup,
    );
    const resolvedArticles = modelArticles.length
      ? modelArticles
      : buildFallbackArticles(capsuleId, timeframe, summaryText, resolvedHighlights, sources);

    const modelNextFocus = sanitizeHistoryArray(match?.next_focus, HISTORY_NEXT_FOCUS_LIMIT, 160);
    const resolvedNextFocus = modelNextFocus.length
      ? modelNextFocus
      : sanitizeHistoryArray(buildFallbackNextFocus(timeframe), HISTORY_NEXT_FOCUS_LIMIT, 160);
    const nextFocusBlocks = resolvedNextFocus.map((text, index) =>
      makeContentBlock({
        period,
        kind: "next",
        index,
        text,
        seed: `${period}-next-${index}`,
      }),
    );

    const modelTimeline = coerceTimelineEntries(
      match?.timeline,
      capsuleId,
      period,
      sources,
      postLookup,
    );
    const resolvedTimeline = modelTimeline.length
      ? modelTimeline
      : buildFallbackTimelineEntries(capsuleId, timeframe, sources);

    const isEmpty = Boolean(match?.empty) || timeframe.posts.length === 0;

    const summarySourceSet = new Set<string>(summaryBlock.sourceIds);
    resolvedTimeline.forEach((entry) => {
      entry.sourceIds.forEach((sourceId) => {
        if (sourceId) summarySourceSet.add(sourceId);
      });
    });
    posts.slice(0, HISTORY_ARTICLE_LINK_LIMIT).forEach((post) => {
      const sourceId = ensurePostSource(sources, capsuleId, post);
      summarySourceSet.add(sourceId);
    });
    summaryBlock.sourceIds = Array.from(summarySourceSet);

    const content: CapsuleHistorySectionContent = {
      summary: summaryBlock,
      highlights: highlightBlocks,
      articles: resolvedArticles,
      timeline: resolvedTimeline,
      nextFocus: nextFocusBlocks,
    };

    const section: StoredHistorySection = {
      period,
      title,
      timeframe: { start: timeframe.start, end: timeframe.end },
      postCount: posts.length,
      isEmpty,
      content,
    };

    coverage[period] = computeCoverageMetrics(timeframe, content);
    return section;
  });

  return { sections, coverage };
}

async function buildCapsuleHistorySnapshot({
  capsuleId,
  capsuleName,
}: {
  capsuleId: string;
  capsuleName: string | null;
}): Promise<{
  suggestedSnapshot: StoredHistorySnapshot;
  suggestedPeriodHashes: Record<string, string>;
  coverage: CoverageMetaMap;
  latestTimelineAt: string | null;
}> {
  const posts = await loadCapsuleHistoryPosts(capsuleId, HISTORY_POST_LIMIT);
  const now = new Date();
  const nowIso = now.toISOString();
  const timeframes = buildHistoryTimeframes(posts, now);
  const periodHashes = buildPeriodHashMap(timeframes);
  const sources: Record<string, CapsuleHistorySource> = {};

  if (!posts.length) {
    const sections = timeframes.map<StoredHistorySection>((timeframe) => {
      const summaryText = buildFallbackSummary(timeframe);
      const summaryBlock = makeContentBlock({
        period: timeframe.period,
        kind: "summary",
        index: 0,
        text: summaryText,
        seed: `${timeframe.period}-summary`,
      });
      const fallbackHighlights = sanitizeHistoryArray(
        buildFallbackHighlights(timeframe),
        HISTORY_HIGHLIGHT_LIMIT,
      );
      const highlightBlocks = fallbackHighlights.map((text, index) =>
        makeContentBlock({
          period: timeframe.period,
          kind: "highlight",
          index,
          text,
          seed: `${timeframe.period}-highlight-${index}`,
        }),
      );
      const articleBlocks = buildFallbackArticles(
        capsuleId,
        timeframe,
        summaryText,
        fallbackHighlights,
        sources,
      );
      const summarySourceIds = new Set<string>();
      timeframe.posts.slice(0, HISTORY_ARTICLE_LINK_LIMIT).forEach((post) => {
        const sourceId = ensurePostSource(sources, capsuleId, post);
        summarySourceIds.add(sourceId);
      });
      summaryBlock.sourceIds = Array.from(summarySourceIds);
      const nextFocusBlocks = sanitizeHistoryArray(
        buildFallbackNextFocus(timeframe),
        HISTORY_NEXT_FOCUS_LIMIT,
        160,
      ).map((text, index) =>
        makeContentBlock({
          period: timeframe.period,
          kind: "next",
          index,
          text,
          seed: `${timeframe.period}-next-${index}`,
        }),
      );
      return {
        period: timeframe.period,
        title: timeframe.label,
        timeframe: { start: timeframe.start, end: timeframe.end },
        postCount: 0,
        isEmpty: true,
        content: {
          summary: summaryBlock,
          highlights: highlightBlocks,
          articles: articleBlocks,
          timeline: [],
          nextFocus: nextFocusBlocks,
        },
      };
    });

    const coverage: CoverageMetaMap = {
      weekly: buildEmptyCoverage(),
      monthly: buildEmptyCoverage(),
      all_time: buildEmptyCoverage(),
    };

    return {
      suggestedSnapshot: {
        capsuleId,
        capsuleName,
        generatedAt: nowIso,
        sections,
        sources,
      },
      suggestedPeriodHashes: periodHashes,
      coverage,
      latestTimelineAt: null,
    };
  }

  let modelSections: HistoryModelSection[] | null = null;
  let generatedAt = nowIso;
  try {
    const model = await generateCapsuleHistoryFromModel({
      capsuleId,
      capsuleName,
      timeframes,
      posts,
      nowIso,
    });
    modelSections = model.sections;
    if (model.generatedAt) {
      generatedAt = model.generatedAt;
    }
  } catch (error) {
    if (error instanceof AIConfigError) {
      throw error;
    }
    console.error("capsules.history.generate", error);
  }

  const { sections, coverage } = buildHistorySections(
    capsuleId,
    timeframes,
    modelSections,
    sources,
  );
  const snapshot: StoredHistorySnapshot = {
    capsuleId,
    capsuleName,
    generatedAt,
    sections,
    sources,
  };
  return {
    suggestedSnapshot: snapshot,
    suggestedPeriodHashes: periodHashes,
    coverage,
    latestTimelineAt: extractLatestTimelineTimestampFromStored(snapshot),
  };
}

export async function getCapsuleHistory(
  capsuleId: string,
  _viewerId: string | null | undefined,
  options: { forceRefresh?: boolean } = {},
): Promise<CapsuleHistorySnapshot> {
  const { capsule } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.history: capsule has invalid identifier");
  }

  const activity = await getCapsuleHistoryActivity(capsuleIdValue);

  if (!options.forceRefresh) {
    const cachedEntry = getCachedCapsuleHistory<CapsuleHistorySnapshot>(capsuleIdValue);
    if (
      cachedEntry &&
      !historySnapshotIsStale({
        suggestedGeneratedAtMs: cachedEntry.suggestedGeneratedAtMs,
        storedLatestPostAt: cachedEntry.latestPostAt,
        activityLatestPostAt: activity.latestPostAt,
      })
    ) {
      return cachedEntry.snapshot;
    }
  }

  let persisted = await getCapsuleHistorySnapshotRecord(capsuleIdValue);
  let promptMemory = coercePromptMemory(persisted?.promptMemory ?? DEFAULT_PROMPT_MEMORY);
  let templates = coerceTemplatePresets(
    persisted?.templatePresets ?? DEFAULT_HISTORY_TEMPLATE_PRESETS,
  );
  let coverageMeta = persisted
    ? coerceCoverageMeta(persisted.coverageMeta ?? {})
    : {
        weekly: buildEmptyCoverage(),
        monthly: buildEmptyCoverage(),
        all_time: buildEmptyCoverage(),
      };
  let suggestedSnapshot = persisted ? coerceStoredSnapshot(persisted.suggestedSnapshot) : null;
  let publishedSnapshot = persisted ? coerceStoredSnapshot(persisted.publishedSnapshot ?? null) : null;
  let suggestedPeriodHashes = persisted?.suggestedPeriodHashes ?? {};
  let latestTimelineAt = persisted?.suggestedLatestPostAt ?? null;

  let shouldRefresh = Boolean(options.forceRefresh || !persisted || !suggestedSnapshot);
  if (!shouldRefresh && persisted) {
    shouldRefresh = historySnapshotIsStale({
      suggestedGeneratedAtMs: toTimestamp(persisted.suggestedGeneratedAt) ?? Date.now(),
      storedLatestPostAt: persisted.suggestedLatestPostAt,
      activityLatestPostAt: activity.latestPostAt,
    });
  }

  if (shouldRefresh) {
    const generated = await buildCapsuleHistorySnapshot({
      capsuleId: capsuleIdValue,
      capsuleName: normalizeOptionalString(capsule.name ?? null),
    });
    suggestedSnapshot = generated.suggestedSnapshot;
    suggestedPeriodHashes = generated.suggestedPeriodHashes;
    coverageMeta = generated.coverage;
    latestTimelineAt = generated.latestTimelineAt ?? activity.latestPostAt ?? null;

    await upsertCapsuleHistorySnapshotRecord({
      capsuleId: capsuleIdValue,
      suggestedSnapshot: generated.suggestedSnapshot as unknown as Record<string, unknown>,
      suggestedGeneratedAt: generated.suggestedSnapshot.generatedAt,
      suggestedLatestPostAt: latestTimelineAt,
      postCount: activity.postCount,
      suggestedPeriodHashes,
      promptMemory,
      templatePresets: templates,
      coverageMeta,
    });

    persisted = await getCapsuleHistorySnapshotRecord(capsuleIdValue);
    if (persisted) {
      promptMemory = coercePromptMemory(persisted.promptMemory ?? promptMemory);
      templates = coerceTemplatePresets(persisted.templatePresets ?? templates);
      coverageMeta = coerceCoverageMeta(persisted.coverageMeta ?? coverageMeta);
      suggestedPeriodHashes = persisted.suggestedPeriodHashes ?? suggestedPeriodHashes;
      latestTimelineAt = persisted.suggestedLatestPostAt ?? latestTimelineAt;
      suggestedSnapshot = coerceStoredSnapshot(persisted.suggestedSnapshot) ?? suggestedSnapshot;
      publishedSnapshot = coerceStoredSnapshot(persisted.publishedSnapshot ?? null);
    }
  }

  const sectionSettings = await listCapsuleHistorySectionSettings(capsuleIdValue);
  const pins = await listCapsuleHistoryPins(capsuleIdValue);
  const exclusions = await listCapsuleHistoryExclusions(capsuleIdValue);
  const edits = await listCapsuleHistoryEdits(capsuleIdValue, { limit: 200 });
  const topicPages = await listCapsuleTopicPages(capsuleIdValue);
  const backlinks = await listCapsuleTopicPageBacklinks(capsuleIdValue);

  const response = composeCapsuleHistorySnapshot({
    capsuleId: capsuleIdValue,
    capsuleName: normalizeOptionalString(capsule.name ?? null),
    suggested: suggestedSnapshot,
    published: publishedSnapshot,
    coverage: coverageMeta,
    promptMemory,
    templates,
    sectionSettings,
    pins,
    exclusions,
    edits,
    topicPages,
    backlinks,
  });

  if (shouldRefresh) {
    void indexCapsuleHistorySnapshot(capsuleIdValue, response).catch((error) => {
      console.warn("capsule history vector sync failed", { capsuleId: capsuleIdValue, error });
    });
    enqueueCapsuleKnowledgeRefresh(capsuleIdValue, capsule.name ?? null);
  }

  setCachedCapsuleHistory({
    capsuleId: capsuleIdValue,
    snapshot: response,
    latestPostAt: activity.latestPostAt ?? latestTimelineAt ?? null,
    suggestedGeneratedAtMs: toTimestamp(response.suggestedGeneratedAt) ?? Date.now(),
  });

  return response;
}

export async function publishCapsuleHistorySection(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod | string;
  content: CapsuleHistorySectionContent;
  title?: string;
  timeframe?: { start: string | null; end: string | null };
  postCount?: number;
  notes?: string | null;
  templateId?: string | null;
  toneRecipeId?: string | null;
  promptOverrides?: Record<string, unknown> | null;
  coverage?: Record<string, unknown> | null;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const editorId = ensureEditorId(params.editorId);
  const { capsuleId, capsuleName } = await resolveCapsuleContext(params.capsuleId);
  await getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });

  const persisted = await getCapsuleHistorySnapshotRecord(capsuleId);
  const baseSnapshot: StoredHistorySnapshot =
    coerceStoredSnapshot(persisted?.publishedSnapshot ?? null) ??
    coerceStoredSnapshot(persisted?.suggestedSnapshot ?? null) ?? {
      capsuleId,
      capsuleName,
      generatedAt: new Date().toISOString(),
      sections: [],
      sources: {},
    };

  const period = ensureHistoryPeriod(params.period);
  const existingSection = baseSnapshot.sections.find((section) => section.period === period) ?? null;
  const isEmpty =
    !params.postCount &&
    params.content.highlights.length === 0 &&
    params.content.articles.length === 0 &&
    params.content.timeline.length === 0 &&
    params.content.nextFocus.length === 0;
  const updatedSection: StoredHistorySection = {
    period,
    title: params.title ?? existingSection?.title ?? period.toUpperCase(),
    timeframe: params.timeframe ?? existingSection?.timeframe ?? { start: null, end: null },
    postCount:
      typeof params.postCount === "number" && Number.isFinite(params.postCount)
        ? Math.max(0, Math.trunc(params.postCount))
        : existingSection?.postCount ?? 0,
    isEmpty: existingSection?.isEmpty ?? isEmpty,
    content: params.content,
  };

  const mergedSections = baseSnapshot.sections.filter((section) => section.period !== period);
  mergedSections.push(updatedSection);
  const publishedSnapshot: StoredHistorySnapshot = {
    ...baseSnapshot,
    capsuleId,
    capsuleName,
    generatedAt: baseSnapshot.generatedAt ?? new Date().toISOString(),
    sections: mergedSections,
  };

  const publishedPeriodHashes = {
    ...(persisted?.publishedPeriodHashes ?? persisted?.suggestedPeriodHashes ?? {}),
    [period]: `${Date.now()}`,
  };

  await updateCapsuleHistoryPublishedSnapshotRecord({
    capsuleId,
    publishedSnapshot: publishedSnapshot as unknown as Record<string, unknown>,
    publishedGeneratedAt: publishedSnapshot.generatedAt,
    publishedLatestPostAt: persisted?.publishedLatestPostAt ?? persisted?.suggestedLatestPostAt ?? null,
    publishedPeriodHashes,
    editorId,
    editorReason: params.reason ?? null,
  });

  await upsertCapsuleHistorySectionSettingsRecord({
    capsuleId,
    period,
    editorNotes: params.notes ?? null,
    templateId: params.templateId ?? null,
    toneRecipeId: params.toneRecipeId ?? null,
    promptOverrides: params.promptOverrides ?? null,
    coverageSnapshot: params.coverage ?? null,
    updatedBy: editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId,
    period,
    editorId,
    changeType: "publish_section",
    reason: params.reason ?? null,
    payload: {
      title: params.title ?? null,
      notes: params.notes ?? null,
    },
    snapshot: publishedSnapshot as unknown as Record<string, unknown>,
  });

  return getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });
}

export async function addCapsuleHistoryPin(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod | string;
  type: string;
  postId?: string | null;
  quote?: string | null;
  source?: Record<string, unknown> | null;
  rank?: number | null;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const editorId = ensureEditorId(params.editorId);
  const { capsuleId } = await resolveCapsuleContext(params.capsuleId);
  const period = ensureHistoryPeriod(params.period);

  await insertCapsuleHistoryPin({
    capsuleId,
    period,
    type: params.type,
    postId: params.postId ?? null,
    quote: params.quote ?? null,
    source: params.source ?? {},
    rank: params.rank ?? null,
    createdBy: editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId,
    period,
    editorId,
    changeType: "add_pin",
    reason: params.reason ?? null,
    payload: { ...params },
  });

  return getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });
}

export async function removeCapsuleHistoryPin(params: {
  capsuleId: string;
  editorId: string;
  pinId: string;
  period?: CapsuleHistoryPeriod | string;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const editorId = ensureEditorId(params.editorId);
  const { capsuleId } = await resolveCapsuleContext(params.capsuleId);
  const period = params.period ? ensureHistoryPeriod(params.period) : null;

  await deleteCapsuleHistoryPin({ capsuleId, pinId: params.pinId });
  await insertCapsuleHistoryEdit({
    capsuleId,
    period: period ?? "weekly",
    editorId,
    changeType: "remove_pin",
    reason: params.reason ?? null,
    payload: { pinId: params.pinId },
  });

  return getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });
}

export async function addCapsuleHistoryExclusion(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod | string;
  postId: string;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const editorId = ensureEditorId(params.editorId);
  const { capsuleId } = await resolveCapsuleContext(params.capsuleId);
  const period = ensureHistoryPeriod(params.period);

  await insertCapsuleHistoryExclusion({
    capsuleId,
    period,
    postId: params.postId,
    createdBy: editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId,
    period,
    editorId,
    changeType: "add_exclusion",
    reason: params.reason ?? null,
    payload: { postId: params.postId },
  });

  return getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });
}

export async function removeCapsuleHistoryExclusion(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod | string;
  postId: string;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const editorId = ensureEditorId(params.editorId);
  const { capsuleId } = await resolveCapsuleContext(params.capsuleId);
  const period = ensureHistoryPeriod(params.period);

  await deleteCapsuleHistoryExclusion({
    capsuleId,
    period,
    postId: params.postId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId,
    period,
    editorId,
    changeType: "remove_exclusion",
    reason: params.reason ?? null,
    payload: { postId: params.postId },
  });

  return getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });
}

export async function updateCapsuleHistorySectionSettings(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod | string;
  notes?: string | null;
  templateId?: string | null;
  toneRecipeId?: string | null;
  promptOverrides?: Record<string, unknown> | null;
  discussionThreadId?: string | null;
  coverage?: Record<string, unknown> | null;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const editorId = ensureEditorId(params.editorId);
  const { capsuleId } = await resolveCapsuleContext(params.capsuleId);
  const period = ensureHistoryPeriod(params.period);

  await upsertCapsuleHistorySectionSettingsRecord({
    capsuleId,
    period,
    editorNotes: params.notes ?? null,
    templateId: params.templateId ?? null,
    toneRecipeId: params.toneRecipeId ?? null,
    promptOverrides: params.promptOverrides ?? null,
    coverageSnapshot: params.coverage ?? null,
    discussionThreadId: params.discussionThreadId ?? null,
    updatedBy: editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId,
    period,
    editorId,
    changeType: "update_settings",
    reason: params.reason ?? null,
    payload: { ...params },
  });

  return getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });
}

export async function updateCapsuleHistoryPromptSettings(params: {
  capsuleId: string;
  editorId: string;
  promptMemory: Record<string, unknown>;
  templates?: Array<Record<string, unknown>>;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const editorId = ensureEditorId(params.editorId);
  const { capsuleId } = await resolveCapsuleContext(params.capsuleId);

  const promptPayload: {
    capsuleId: string;
    promptMemory: Record<string, unknown>;
    templates?: Array<Record<string, unknown>>;
  } = {
    capsuleId,
    promptMemory: params.promptMemory ?? {},
  };
  if (params.templates) {
    promptPayload.templates = params.templates;
  }

  await updateCapsuleHistoryPromptMemory(promptPayload);

  await insertCapsuleHistoryEdit({
    capsuleId,
    period: "weekly",
    editorId,
    changeType: "update_prompt",
    reason: params.reason ?? null,
    payload: { ...params },
  });

  return getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });
}

export async function refineCapsuleHistorySection(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod | string;
  instructions?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const editorId = ensureEditorId(params.editorId);
  const { capsuleId } = await resolveCapsuleContext(params.capsuleId);
  const period = ensureHistoryPeriod(params.period);

  await insertCapsuleHistoryEdit({
    capsuleId,
    period,
    editorId,
    changeType: "refine_section",
    reason: params.instructions ?? null,
    payload: { instructions: params.instructions ?? null },
  });

  return getCapsuleHistory(capsuleId, editorId, { forceRefresh: true });
}

export async function refreshStaleCapsuleHistories(params: {
  limit?: number;
  staleAfterMinutes?: number;
} = {}): Promise<{
  refreshed: number;
  candidates: number;
  errors: Array<{ capsuleId: string; error: string }>;
}> {
  const limit = Math.max(1, Math.trunc(params.limit ?? 12));
  const staleAfterMinutes = Math.max(5, Math.trunc(params.staleAfterMinutes ?? 360));
  const candidates = await listCapsuleHistoryRefreshCandidates({
    limit,
    staleAfterMinutes,
  });
  let refreshed = 0;
  const errors: Array<{ capsuleId: string; error: string }> = [];

  for (const candidate of candidates) {
    try {
      await getCapsuleHistory(candidate.capsuleId, candidate.ownerId, { forceRefresh: true });
      refreshed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ capsuleId: candidate.capsuleId, error: message });
    }
  }

  return {
    refreshed,
    candidates: candidates.length,
    errors,
  };
}







function historySnapshotIsStale(params: {
  suggestedGeneratedAtMs: number;
  storedLatestPostAt: string | null | undefined;
  activityLatestPostAt: string | null | undefined;
}): boolean {
  const now = Date.now();
  if (!Number.isFinite(params.suggestedGeneratedAtMs)) return true;
  if (now - params.suggestedGeneratedAtMs > HISTORY_SNAPSHOT_STALE_MS) {
    return true;
  }
  const storedMs = toTimestamp(params.storedLatestPostAt);
  const activityMs = toTimestamp(params.activityLatestPostAt);
  if (activityMs !== null && (storedMs === null || activityMs > storedMs)) {
    return true;
  }
  return false;
}


const HISTORY_POST_LIMIT = 120;
const HISTORY_HIGHLIGHT_LIMIT = 5;
const HISTORY_NEXT_FOCUS_LIMIT = 4;
const HISTORY_SNAPSHOT_STALE_MS = 15 * 60 * 1000;
