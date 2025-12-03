import { decorateDatabaseError } from "@/lib/database/utils";
import type { CapsuleHistoryPeriod } from "@/types/capsules";

import {
  coerceStringArray,
  db,
  normalizeHistoryPeriodValue,
  normalizeName,
  normalizeString,
} from "./shared";
import type {
  CapsuleHistoryActivityRow,
  CapsuleHistoryEditRow,
  CapsuleHistoryExclusionRow,
  CapsuleHistoryPinRow,
  CapsuleHistoryRefreshCandidateRow,
  CapsuleHistorySectionSettingsRow,
  CapsuleHistorySnapshotRow,
  CapsuleTopicPageBacklinkRow,
  CapsuleTopicPageRow,
} from "./types";

export type CapsuleHistorySnapshotRecord = {
  capsuleId: string;
  suggestedGeneratedAt: string;
  suggestedLatestPostAt: string | null;
  postCount: number;
  suggestedSnapshot: Record<string, unknown>;
  suggestedPeriodHashes: Record<string, string>;
  publishedSnapshot: Record<string, unknown> | null;
  publishedGeneratedAt: string | null;
  publishedLatestPostAt: string | null;
  publishedPeriodHashes: Record<string, string>;
  publishedEditorId: string | null;
  publishedEditorReason: string | null;
  promptMemory: Record<string, unknown>;
  templatePresets: Array<Record<string, unknown>>;
  coverageMeta: Record<string, unknown>;
  updatedAt: string | null;
};

export type CapsuleHistorySectionSettings = {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  editorNotes: string | null;
  excludedPostIds: string[];
  templateId: string | null;
  toneRecipeId: string | null;
  promptOverrides: Record<string, unknown>;
  coverageSnapshot: Record<string, unknown>;
  discussionThreadId: string | null;
  metadata: Record<string, unknown>;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type CapsuleHistoryPin = {
  id: string;
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  type: string;
  postId: string | null;
  quote: string | null;
  source: Record<string, unknown>;
  rank: number;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CapsuleHistoryExclusion = {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  postId: string;
  createdBy: string;
  createdAt: string | null;
};

export type CapsuleHistoryEdit = {
  id: string;
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  editorId: string;
  changeType: string;
  reason: string | null;
  payload: Record<string, unknown>;
  snapshot: Record<string, unknown> | null;
  createdAt: string | null;
};

export type CapsuleTopicPage = {
  id: string;
  capsuleId: string;
  slug: string;
  title: string;
  description: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CapsuleTopicPageBacklink = {
  id: string;
  topicPageId: string;
  capsuleId: string;
  sourceType: string;
  sourceId: string;
  period: string | null;
  createdAt: string | null;
};

export async function getCapsuleHistorySnapshotRecord(
  capsuleId: string,
): Promise<CapsuleHistorySnapshotRecord | null> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return null;

  const result = await db
    .from("capsule_history_snapshots")
    .select<CapsuleHistorySnapshotRow>(
      [
        "capsule_id",
        "suggested_generated_at",
        "suggested_latest_post_at",
        "post_count",
        "suggested_snapshot",
        "updated_at",
        "suggested_period_hashes",
        "published_snapshot",
        "published_generated_at",
        "published_latest_post_at",
        "published_period_hashes",
        "published_editor_id",
        "published_editor_reason",
        "prompt_memory",
        "template_presets",
        "coverage_meta",
      ].join(", "),
    )
    .eq("capsule_id", normalizedCapsuleId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.historySnapshots.get", result.error);
  }

  const data = result.data;
  if (!data?.capsule_id) return null;

  const suggestedSnapshot = (data.suggested_snapshot ??
    {}) as CapsuleHistorySnapshotRecord["suggestedSnapshot"];
  const publishedSnapshot = (data.published_snapshot ??
    null) as CapsuleHistorySnapshotRecord["publishedSnapshot"];

  return {
    capsuleId: data.capsule_id,
    suggestedGeneratedAt: normalizeString(data.suggested_generated_at) ?? "",
    suggestedLatestPostAt: normalizeString(data.suggested_latest_post_at),
    postCount:
      typeof data.post_count === "number" && Number.isFinite(data.post_count) ? data.post_count : 0,
    suggestedSnapshot,
    suggestedPeriodHashes: (data.suggested_period_hashes ??
      {}) as CapsuleHistorySnapshotRecord["suggestedPeriodHashes"],
    publishedSnapshot,
    publishedGeneratedAt: normalizeString(data.published_generated_at),
    publishedLatestPostAt: normalizeString(data.published_latest_post_at),
    publishedPeriodHashes: (data.published_period_hashes ??
      {}) as CapsuleHistorySnapshotRecord["publishedPeriodHashes"],
    publishedEditorId: normalizeString(data.published_editor_id),
    publishedEditorReason: normalizeString(data.published_editor_reason),
    promptMemory: (data.prompt_memory ?? {}) as CapsuleHistorySnapshotRecord["promptMemory"],
    templatePresets: (data.template_presets ??
      []) as CapsuleHistorySnapshotRecord["templatePresets"],
    coverageMeta: (data.coverage_meta ?? {}) as CapsuleHistorySnapshotRecord["coverageMeta"],
    updatedAt: normalizeString(data.updated_at),
  };
}

export async function listCapsuleHistorySectionSettings(
  capsuleId: string,
): Promise<CapsuleHistorySectionSettings[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const result = await db
    .from("capsule_history_section_settings")
    .select<CapsuleHistorySectionSettingsRow>(
      "capsule_id, period, editor_notes, excluded_post_ids, template_id, tone_recipe_id, prompt_overrides, coverage_snapshot, discussion_thread_id, metadata, updated_at, updated_by",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.sectionSettings", result.error);
  }

  return (result.data ?? [])
    .map((row) => {
      const period = normalizeHistoryPeriodValue(row.period);
      if (!period) return null;
      return {
        capsuleId: normalizedCapsuleId,
        period,
        editorNotes: normalizeString(row.editor_notes),
        excludedPostIds: coerceStringArray(row.excluded_post_ids),
        templateId: normalizeString(row.template_id),
        toneRecipeId: normalizeString(row.tone_recipe_id),
        promptOverrides: (row.prompt_overrides ?? {}) as Record<string, unknown>,
        coverageSnapshot: (row.coverage_snapshot ?? {}) as Record<string, unknown>,
        discussionThreadId: normalizeString(row.discussion_thread_id),
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        updatedAt: normalizeString(row.updated_at),
        updatedBy: normalizeString(row.updated_by),
      };
    })
    .filter((entry): entry is CapsuleHistorySectionSettings => entry !== null);
}

export async function listCapsuleHistoryPins(capsuleId: string): Promise<CapsuleHistoryPin[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const result = await db
    .from("capsule_history_pins")
    .select<CapsuleHistoryPinRow>(
      "id, capsule_id, period, pin_type, post_id, quote, source, rank, created_at, created_by, updated_at",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .order("rank", { ascending: true })
    .order("created_at", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.pins.list", result.error);
  }

  return (result.data ?? [])
    .map((row) => {
      const period = normalizeHistoryPeriodValue(row.period);
      if (!period) return null;
      return {
        id: normalizeString(row.id) ?? "",
        capsuleId: normalizedCapsuleId,
        period,
        type: normalizeString(row.pin_type) ?? "pin",
        postId: normalizeString(row.post_id),
        quote: normalizeString(row.quote),
        source: (row.source ?? {}) as Record<string, unknown>,
        rank: typeof row.rank === "number" && Number.isFinite(row.rank) ? row.rank : 0,
        createdBy: normalizeString(row.created_by),
        createdAt: normalizeString(row.created_at),
        updatedAt: normalizeString(row.updated_at),
      };
    })
    .filter((entry): entry is CapsuleHistoryPin => entry !== null);
}

export async function listCapsuleHistoryExclusions(
  capsuleId: string,
  period?: CapsuleHistoryPeriod | null,
): Promise<CapsuleHistoryExclusion[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedPeriod = period ? normalizeHistoryPeriodValue(period) : null;
  if (!normalizedCapsuleId) return [];

  let query = db
    .from("capsule_history_exclusions")
    .select<CapsuleHistoryExclusionRow>("capsule_id, period, post_id, created_by, created_at")
    .eq("capsule_id", normalizedCapsuleId)
    .order("created_at", { ascending: true });
  if (normalizedPeriod) {
    query = query.eq("period", normalizedPeriod);
  }

  const result = await query.fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.exclusions.list", result.error);
  }

  return (result.data ?? [])
    .map((row) => {
      const postId = normalizeString(row.post_id);
      if (!postId) return null;
      return {
        capsuleId: normalizedCapsuleId,
        period: normalizeHistoryPeriodValue(row.period) ?? "weekly",
        postId,
        createdBy: normalizeString(row.created_by) ?? "",
        createdAt: normalizeString(row.created_at),
      };
    })
    .filter((entry): entry is CapsuleHistoryExclusion => entry !== null);
}

export async function listCapsuleHistoryEdits(
  capsuleId: string,
  options: { period?: CapsuleHistoryPeriod | null; limit?: number } = {},
): Promise<CapsuleHistoryEdit[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedPeriod = options.period ? normalizeHistoryPeriodValue(options.period) : null;
  if (!normalizedCapsuleId) return [];

  const requestedLimit = Math.max(1, Math.trunc(options.limit ?? 500));
  let query = db
    .from("capsule_history_edits")
    .select<CapsuleHistoryEditRow>(
      "id, capsule_id, period, editor_id, change_type, reason, payload, snapshot, created_at",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .order("created_at", { ascending: true })
    .limit(requestedLimit);
  if (normalizedPeriod) {
    query = query.eq("period", normalizedPeriod);
  }

  const result = await query.fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.edits.list", result.error);
  }

  return (result.data ?? [])
    .map((row) => {
      const changeType = normalizeString(row.change_type);
      const editorId = normalizeString(row.editor_id);
      if (!changeType || !editorId) return null;
      return {
        id: normalizeString(row.id) ?? "",
        capsuleId: normalizedCapsuleId,
        period: normalizeHistoryPeriodValue(row.period) ?? "weekly",
        editorId,
        changeType,
        reason: normalizeString(row.reason),
        payload: (row.payload ?? {}) as Record<string, unknown>,
        snapshot: (row.snapshot ?? null) as Record<string, unknown> | null,
        createdAt: normalizeString(row.created_at),
      };
    })
    .filter((entry): entry is CapsuleHistoryEdit => Boolean(entry));
}

export async function listCapsuleTopicPages(
  capsuleId: string,
  options: { limit?: number } = {},
): Promise<CapsuleTopicPage[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200);

  const result = await db
    .from("capsule_topic_pages")
    .select<CapsuleTopicPageRow>(
      "id, capsule_id, slug, title, description, created_by, updated_by, created_at, updated_at",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.topicPages.list", result.error);
  }

  return (result.data ?? [])
    .map((row) => {
      const id = normalizeString(row.id);
      const slug = normalizeString(row.slug);
      if (!id || !slug) return null;
      return {
        id,
        capsuleId: normalizedCapsuleId,
        slug,
        title: normalizeName(row.title),
        description: normalizeString(row.description),
        createdBy: normalizeString(row.created_by),
        updatedBy: normalizeString(row.updated_by),
        createdAt: normalizeString(row.created_at),
        updatedAt: normalizeString(row.updated_at),
      };
    })
    .filter((entry): entry is CapsuleTopicPage => entry !== null);
}

export async function listCapsuleTopicPageBacklinks(
  topicPageId: string,
): Promise<CapsuleTopicPageBacklink[]> {
  const normalizedTopicPageId = normalizeString(topicPageId);
  if (!normalizedTopicPageId) return [];

  const result = await db
    .from("capsule_topic_page_backlinks")
    .select<CapsuleTopicPageBacklinkRow>(
      "id, topic_page_id, capsule_id, source_type, source_id, period, created_at",
    )
    .eq("topic_page_id", normalizedTopicPageId)
    .order("created_at", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.topicPageBacklinks.list", result.error);
  }

  return (result.data ?? [])
    .map((row) => {
      const capsuleId = normalizeString(row.capsule_id);
      const sourceType = normalizeString(row.source_type);
      const sourceId = normalizeString(row.source_id);
      if (!capsuleId || !sourceType || !sourceId) return null;
      return {
        id: normalizeString(row.id) ?? "",
        topicPageId: normalizedTopicPageId,
        capsuleId,
        sourceType,
        sourceId,
        period: normalizeString(row.period),
        createdAt: normalizeString(row.created_at),
      };
    })
    .filter((entry): entry is CapsuleTopicPageBacklink => entry !== null);
}

export async function upsertCapsuleHistorySectionSettingsRecord(params: {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  editorNotes: string | null;
  excludedPostIds?: string[];
  templateId: string | null;
  toneRecipeId: string | null;
  promptOverrides?: Record<string, unknown> | null;
  coverageSnapshot?: Record<string, unknown> | null;
  discussionThreadId?: string | null;
  metadata?: Record<string, unknown> | null;
  updatedBy: string | null;
}): Promise<CapsuleHistorySectionSettings | null> {
  const capsuleId = normalizeString(params.capsuleId);
  const period = normalizeHistoryPeriodValue(params.period);
  if (!capsuleId || !period) return null;

  const payload: CapsuleHistorySectionSettingsRow = {
    capsule_id: capsuleId,
    period,
    editor_notes: normalizeString(params.editorNotes),
    excluded_post_ids: Array.from(new Set(params.excludedPostIds ?? [])),
    template_id: normalizeString(params.templateId),
    tone_recipe_id: normalizeString(params.toneRecipeId),
    prompt_overrides: params.promptOverrides ?? {},
    coverage_snapshot: params.coverageSnapshot ?? {},
    discussion_thread_id: normalizeString(params.discussionThreadId ?? null),
    metadata: params.metadata ?? {},
    updated_at: null,
    updated_by: normalizeString(params.updatedBy),
  };

  const result = await db
    .from("capsule_history_section_settings")
    .upsert(payload, { onConflict: "capsule_id,period" })
    .select<CapsuleHistorySectionSettingsRow>(
      "capsule_id, period, editor_notes, excluded_post_ids, template_id, tone_recipe_id, prompt_overrides, coverage_snapshot, discussion_thread_id, metadata, updated_at, updated_by",
    )
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.sectionSettings.upsert", result.error);
  }

  if (!result.data) return null;

  const updatedPeriod = normalizeHistoryPeriodValue(result.data.period);
  if (!updatedPeriod) return null;

  return {
    capsuleId,
    period: updatedPeriod,
    editorNotes: normalizeString(result.data.editor_notes),
    excludedPostIds: coerceStringArray(result.data.excluded_post_ids),
    templateId: normalizeString(result.data.template_id),
    toneRecipeId: normalizeString(result.data.tone_recipe_id),
    promptOverrides: (result.data.prompt_overrides ?? {}) as Record<string, unknown>,
    coverageSnapshot: (result.data.coverage_snapshot ?? {}) as Record<string, unknown>,
    discussionThreadId: normalizeString(result.data.discussion_thread_id),
    metadata: (result.data.metadata ?? {}) as Record<string, unknown>,
    updatedAt: normalizeString(result.data.updated_at),
    updatedBy: normalizeString(result.data.updated_by),
  };
}

export async function insertCapsuleHistoryEdit(params: {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  editorId: string;
  changeType: string;
  reason: string | null;
  payload: Record<string, unknown>;
  snapshot?: Record<string, unknown> | null;
}): Promise<string | null> {
  const capsuleId = normalizeString(params.capsuleId);
  const period = normalizeHistoryPeriodValue(params.period);
  const editorId = normalizeString(params.editorId);
  const changeType = normalizeString(params.changeType);
  if (!capsuleId || !period || !editorId || !changeType) return null;

  const result = await db
    .from("capsule_history_edits")
    .insert({
      capsule_id: capsuleId,
      period,
      editor_id: editorId,
      change_type: changeType,
      reason: normalizeString(params.reason),
      payload: params.payload ?? {},
      snapshot: params.snapshot ?? {},
    })
    .select<CapsuleHistoryEditRow>("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.edits.insert", result.error);
  }

  return normalizeString(result.data?.id);
}

export async function insertCapsuleHistoryPin(params: {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  type: string;
  postId: string | null;
  quote: string | null;
  source: Record<string, unknown>;
  rank: number | null;
  createdBy: string;
}): Promise<string | null> {
  const capsuleId = normalizeString(params.capsuleId);
  const period = normalizeHistoryPeriodValue(params.period);
  const pinType = normalizeString(params.type);
  const createdBy = normalizeString(params.createdBy);
  if (!capsuleId || !period || !pinType || !createdBy) return null;

  const payload = {
    capsule_id: capsuleId,
    period,
    pin_type: pinType,
    post_id: normalizeString(params.postId),
    quote: normalizeString(params.quote),
    source: params.source ?? {},
    rank: Number.isFinite(params.rank ?? null) ? (params.rank as number) : 0,
    created_by: createdBy,
  };

  const result = await db
    .from("capsule_history_pins")
    .insert(payload)
    .select<CapsuleHistoryPinRow>("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.pins.insert", result.error);
  }

  return normalizeString(result.data?.id);
}

export async function deleteCapsuleHistoryPin(params: {
  capsuleId: string;
  pinId: string;
}): Promise<boolean> {
  const capsuleId = normalizeString(params.capsuleId);
  const pinId = normalizeString(params.pinId);
  if (!capsuleId || !pinId) return false;

  const result = await db
    .from("capsule_history_pins")
    .delete({ count: "exact" })
    .eq("capsule_id", capsuleId)
    .eq("id", pinId)
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.pins.delete", result.error);
  }

  const deletedRow = result.data as { id?: string | null } | null;
  return Boolean(deletedRow?.id);
}

export async function insertCapsuleHistoryExclusion(params: {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  postId: string;
  createdBy: string;
}): Promise<void> {
  const capsuleId = normalizeString(params.capsuleId);
  const period = normalizeHistoryPeriodValue(params.period);
  const postId = normalizeString(params.postId);
  const createdBy = normalizeString(params.createdBy);
  if (!capsuleId || !period || !postId || !createdBy) {
    throw new Error("capsules.history.exclusions.insert: invalid parameters");
  }

  const result = await db
    .from("capsule_history_exclusions")
    .upsert(
      {
        capsule_id: capsuleId,
        period,
        post_id: postId,
        created_by: createdBy,
      },
      { onConflict: "capsule_id,period,post_id" },
    )
    .select("post_id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.exclusions.insert", result.error);
  }
}

export async function deleteCapsuleHistoryExclusion(params: {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  postId: string;
}): Promise<boolean> {
  const capsuleId = normalizeString(params.capsuleId);
  const period = normalizeHistoryPeriodValue(params.period);
  const postId = normalizeString(params.postId);
  if (!capsuleId || !period || !postId) return false;

  const result = await db
    .from("capsule_history_exclusions")
    .delete({ count: "exact" })
    .eq("capsule_id", capsuleId)
    .eq("period", period)
    .eq("post_id", postId)
    .select("post_id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.exclusions.delete", result.error);
  }

  const deletedRow = result.data as { post_id?: string | null } | null;
  return Boolean(deletedRow?.post_id);
}

export async function updateCapsuleHistoryPromptMemory(params: {
  capsuleId: string;
  promptMemory: Record<string, unknown>;
  templates?: Array<Record<string, unknown>>;
  coverageMeta?: Record<string, unknown>;
}): Promise<void> {
  const capsuleId = normalizeString(params.capsuleId);
  if (!capsuleId) {
    throw new Error("capsules.history.promptMemory.update: invalid capsuleId");
  }

  const payload: Record<string, unknown> = {
    prompt_memory: params.promptMemory ?? {},
  };
  if (params.templates) {
    payload.template_presets = params.templates;
  }
  if (params.coverageMeta) {
    payload.coverage_meta = params.coverageMeta;
  }

  const result = await db
    .from("capsule_history_snapshots")
    .update(payload)
    .eq("capsule_id", capsuleId)
    .select("capsule_id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.promptMemory.update", result.error);
  }
}

export async function upsertCapsuleHistorySnapshotRecord(params: {
  capsuleId: string;
  suggestedSnapshot: Record<string, unknown>;
  suggestedGeneratedAt: string;
  suggestedLatestPostAt: string | null;
  postCount: number;
  suggestedPeriodHashes: Record<string, string>;
  promptMemory?: Record<string, unknown>;
  templatePresets?: Array<Record<string, unknown>>;
  coverageMeta?: Record<string, unknown>;
}): Promise<void> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const generatedAt = normalizeString(params.suggestedGeneratedAt);
  if (!normalizedCapsuleId || !generatedAt) {
    throw new Error("capsules.historySnapshots.upsert: capsuleId and generatedAt are required");
  }

  const payload: Record<string, unknown> = {
    capsule_id: normalizedCapsuleId,
    suggested_generated_at: generatedAt,
    suggested_latest_post_at: params.suggestedLatestPostAt
      ? normalizeString(params.suggestedLatestPostAt)
      : null,
    post_count: Number.isFinite(params.postCount) ? Math.max(0, Math.trunc(params.postCount)) : 0,
    suggested_snapshot: params.suggestedSnapshot,
    suggested_period_hashes: params.suggestedPeriodHashes,
  };

  if (params.promptMemory) {
    payload.prompt_memory = params.promptMemory;
  }
  if (params.templatePresets) {
    payload.template_presets = params.templatePresets;
  }
  if (params.coverageMeta) {
    payload.coverage_meta = params.coverageMeta;
  }

  const result = await db
    .from("capsule_history_snapshots")
    .upsert(payload, { onConflict: "capsule_id" })
    .select("capsule_id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.historySnapshots.upsert", result.error);
  }
}

export async function updateCapsuleHistoryPublishedSnapshotRecord(params: {
  capsuleId: string;
  publishedSnapshot: Record<string, unknown> | null;
  publishedGeneratedAt: string | null;
  publishedLatestPostAt: string | null;
  publishedPeriodHashes: Record<string, string>;
  editorId: string | null;
  editorReason: string | null;
}): Promise<void> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  if (!normalizedCapsuleId) {
    throw new Error("capsules.historySnapshots.publish: capsuleId is required");
  }

  const payload: Record<string, unknown> = {
    capsule_id: normalizedCapsuleId,
    published_snapshot: params.publishedSnapshot,
    published_generated_at: params.publishedGeneratedAt
      ? normalizeString(params.publishedGeneratedAt)
      : null,
    published_latest_post_at: params.publishedLatestPostAt
      ? normalizeString(params.publishedLatestPostAt)
      : null,
    published_period_hashes: params.publishedPeriodHashes,
    published_editor_id: params.editorId ? normalizeString(params.editorId) : null,
    published_editor_reason: params.editorReason ?? null,
  };

  const result = await db
    .from("capsule_history_snapshots")
    .upsert(payload, { onConflict: "capsule_id" })
    .select("capsule_id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.historySnapshots.publish", result.error);
  }
}

export async function getCapsuleHistoryActivity(
  capsuleId: string,
): Promise<{ latestPostAt: string | null; postCount: number }> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) {
    return { latestPostAt: null, postCount: 0 };
  }

  const result = await db
    .from("posts_view")
    .select<CapsuleHistoryActivityRow>("id, created_at", { count: "exact" })
    .eq("capsule_id", normalizedCapsuleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.activity", result.error);
  }

  const rows = result.data ?? [];
  const latestPostAt = rows.length ? normalizeString(rows[0]?.created_at ?? null) : null;
  const postCount = typeof result.count === "number" && Number.isFinite(result.count) ? result.count : 0;

  return { latestPostAt, postCount };
}

export async function listCapsuleHistoryRefreshCandidates(params: {
  limit?: number;
  staleAfterMinutes?: number;
}): Promise<
  Array<{
    capsuleId: string;
    ownerId: string;
    snapshotGeneratedAt: string | null;
    snapshotLatestPostAt: string | null;
    latestPostAt: string | null;
  }>
> {
  const limit = Math.max(1, Math.trunc(params.limit ?? 24));
  const staleAfterMinutes = Math.max(5, Math.trunc(params.staleAfterMinutes ?? 360));
  const intervalValue = `${staleAfterMinutes} minutes`;

  const result = await db.rpc<CapsuleHistoryRefreshCandidateRow>(
    "list_capsule_history_refresh_candidates",
    {
      limit_count: limit,
      stale_after: intervalValue,
    },
  );

  if (result.error) {
    throw decorateDatabaseError("capsules.historySnapshots.listRefreshCandidates", result.error);
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  return rows
    .map((row) => {
      const capsuleId = normalizeString(row.capsule_id);
      const ownerId = normalizeString(row.owner_user_id);
      if (!capsuleId || !ownerId) return null;
      return {
        capsuleId,
        ownerId,
        snapshotGeneratedAt: normalizeString(row.snapshot_generated_at),
        snapshotLatestPostAt: normalizeString(row.snapshot_latest_post),
        latestPostAt: normalizeString(row.latest_post),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}
