import "server-only";

import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError, expectResult, maybeResult } from "@/lib/database/utils";
import type { DatabaseResult } from "@/ports/database";

export type AiVideoRunStatus = "pending" | "running" | "uploading" | "succeeded" | "failed";

export type AiVideoRunAttempt = {
  attempt: number;
  stage?: "generate" | "edit" | "upload" | "transcode" | "finalize";
  model: string | null;
  provider?: string | null;
  startedAt: string;
  completedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown> | null;
};

export type AiVideoRunRecord = {
  id: string;
  ownerUserId: string | null;
  capsuleId: string | null;
  mode: "generate" | "edit";
  sourceUrl: string | null;
  userPrompt: string;
  resolvedPrompt: string;
  provider: string;
  model: string | null;
  status: AiVideoRunStatus;
  errorCode: string | null;
  errorMessage: string | null;
  errorMeta: Record<string, unknown> | null;
  options: Record<string, unknown>;
  responseMetadata: Record<string, unknown> | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  muxPosterUrl: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  retryCount: number;
  attempts: AiVideoRunAttempt[];
  startedAt: string;
  completedAt: string | null;
};

export type CreateAiVideoRunInput = {
  ownerUserId?: string | null;
  capsuleId?: string | null;
  mode: "generate" | "edit";
  sourceUrl?: string | null;
  userPrompt: string;
  resolvedPrompt: string;
  provider?: string | null;
  model?: string | null;
  options?: Record<string, unknown>;
  status?: AiVideoRunStatus;
};

export type UpdateAiVideoRunInput = {
  status?: AiVideoRunStatus;
  retryCount?: number;
  model?: string | null;
  provider?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorMeta?: Record<string, unknown> | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  muxPosterUrl?: string | null;
  responseMetadata?: Record<string, unknown> | null;
  durationSeconds?: number | null;
  sizeBytes?: number | null;
  attempts?: AiVideoRunAttempt[];
  completedAt?: string | null;
  options?: Record<string, unknown>;
};

const TABLE_NAME = "ai_video_runs";

type AiVideoRunRow = {
  id: string;
  owner_user_id: string | null;
  capsule_id: string | null;
  mode: "generate" | "edit";
  source_url: string | null;
  user_prompt: string;
  resolved_prompt: string;
  provider: string;
  model: string | null;
  status: AiVideoRunStatus;
  error_code: string | null;
  error_message: string | null;
  error_meta: Record<string, unknown> | null;
  options: Record<string, unknown> | null;
  response_metadata: Record<string, unknown> | null;
  video_url: string | null;
  thumbnail_url: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_poster_url: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  retry_count: number;
  attempts: AiVideoRunAttempt[] | null;
  started_at: string;
  completed_at: string | null;
};

function cloneObject<T extends Record<string, unknown>>(input: unknown, fallback: T): T {
  if (!input || typeof input !== "object") return fallback;
  return { ...(input as Record<string, unknown>) } as T;
}

function mapOptionalObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  return { ...(input as Record<string, unknown>) };
}

function sanitizeAttempts(input: unknown): AiVideoRunAttempt[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const source = entry as Record<string, unknown>;
      const attemptNumber = Number(source.attempt);
      const startedAtValue = typeof source.startedAt === "string" ? source.startedAt : null;
      if (!Number.isFinite(attemptNumber) || !startedAtValue) return null;
      const normalized: AiVideoRunAttempt = {
        attempt: Math.max(0, Math.floor(attemptNumber)),
        stage:
          typeof source.stage === "string" && source.stage.trim().length
            ? (source.stage.trim().toLowerCase() as AiVideoRunAttempt["stage"])
            : undefined,
        model: typeof source.model === "string" ? source.model : null,
        provider:
          typeof source.provider === "string" && source.provider.trim().length
            ? source.provider.trim()
            : null,
        startedAt: startedAtValue,
        completedAt:
          typeof source.completedAt === "string" && source.completedAt.trim().length
            ? source.completedAt
            : null,
        errorCode: typeof source.errorCode === "string" ? source.errorCode : null,
        errorMessage: typeof source.errorMessage === "string" ? source.errorMessage : null,
        meta:
          source.meta && typeof source.meta === "object"
            ? { ...(source.meta as Record<string, unknown>) }
            : null,
      };
      return normalized;
    })
    .filter((entry): entry is AiVideoRunAttempt => Boolean(entry));
}

function mapRow(row: AiVideoRunRow): AiVideoRunRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    capsuleId: row.capsule_id,
    mode: row.mode,
    sourceUrl: row.source_url,
    userPrompt: row.user_prompt,
    resolvedPrompt: row.resolved_prompt,
    provider: row.provider,
    model: row.model,
    status: row.status ?? "pending",
    errorCode: row.error_code,
    errorMessage: row.error_message,
    errorMeta: mapOptionalObject(row.error_meta),
    options: cloneObject<Record<string, unknown>>(row.options, {}),
    responseMetadata: mapOptionalObject(row.response_metadata),
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    muxAssetId: row.mux_asset_id,
    muxPlaybackId: row.mux_playback_id,
    muxPosterUrl: row.mux_poster_url,
    durationSeconds:
      typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds)
        ? Number(row.duration_seconds)
        : null,
    sizeBytes:
      typeof row.size_bytes === "number" && Number.isFinite(row.size_bytes)
        ? Math.max(0, Number(row.size_bytes))
        : null,
    retryCount: row.retry_count ?? 0,
    attempts: sanitizeAttempts(row.attempts),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

const db = getDatabaseAdminClient();

export async function createAiVideoRun(input: CreateAiVideoRunInput): Promise<AiVideoRunRecord> {
  const payload = {
    owner_user_id: input.ownerUserId ?? null,
    capsule_id: input.capsuleId ?? null,
    mode: input.mode,
    source_url: input.sourceUrl ?? null,
    user_prompt: input.userPrompt,
    resolved_prompt: input.resolvedPrompt,
    provider: input.provider ?? "openai",
    model: input.model ?? null,
    status: input.status ?? "pending",
    options: input.options ?? {},
  };

  const result = await db
    .from(TABLE_NAME)
    .insert(payload, { returning: "representation" })
    .select<AiVideoRunRow>("*")
    .single();

  return mapRow(expectResult(result, "ai_video_runs.insert"));
}

export async function updateAiVideoRun(
  runId: string,
  patch: UpdateAiVideoRunInput,
): Promise<AiVideoRunRecord | null> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.status) updatePayload.status = patch.status;
  if (patch.retryCount !== undefined) updatePayload.retry_count = Math.max(0, patch.retryCount);
  if (patch.model !== undefined) updatePayload.model = patch.model;
  if (patch.provider !== undefined) updatePayload.provider = patch.provider ?? "openai";
  if (patch.errorCode !== undefined) updatePayload.error_code = patch.errorCode;
  if (patch.errorMessage !== undefined) updatePayload.error_message = patch.errorMessage;
  if (patch.errorMeta !== undefined) updatePayload.error_meta = patch.errorMeta ?? null;
  if (patch.videoUrl !== undefined) updatePayload.video_url = patch.videoUrl;
  if (patch.thumbnailUrl !== undefined) updatePayload.thumbnail_url = patch.thumbnailUrl;
  if (patch.muxAssetId !== undefined) updatePayload.mux_asset_id = patch.muxAssetId;
  if (patch.muxPlaybackId !== undefined) updatePayload.mux_playback_id = patch.muxPlaybackId;
  if (patch.muxPosterUrl !== undefined) updatePayload.mux_poster_url = patch.muxPosterUrl;
  if (patch.responseMetadata !== undefined)
    updatePayload.response_metadata = patch.responseMetadata ?? null;
  if (patch.durationSeconds !== undefined)
    updatePayload.duration_seconds =
      patch.durationSeconds === null ? null : Math.max(0, Number(patch.durationSeconds));
  if (patch.sizeBytes !== undefined)
    updatePayload.size_bytes =
      patch.sizeBytes === null ? null : Math.max(0, Math.floor(Number(patch.sizeBytes)));
  if (patch.attempts !== undefined) updatePayload.attempts = patch.attempts ?? [];
  if (patch.completedAt !== undefined) updatePayload.completed_at = patch.completedAt;
  if (patch.options !== undefined) updatePayload.options = patch.options ?? {};

  if (!Object.keys(updatePayload).length) {
    const existing = await db
      .from(TABLE_NAME)
      .select<AiVideoRunRow>("*")
      .eq("id", runId)
      .maybeSingle();
    const row = maybeResult<AiVideoRunRow | null>(existing, "ai_video_runs.select");
    return row ? mapRow(row) : null;
  }

  const result = await db
    .from(TABLE_NAME)
    .update(updatePayload)
    .eq("id", runId)
    .select<AiVideoRunRow>("*")
    .maybeSingle();

  const row = maybeResult<AiVideoRunRow | null>(result, "ai_video_runs.update");
  return row ? mapRow(row) : null;
}

export async function getAiVideoRun(runId: string): Promise<AiVideoRunRecord | null> {
  const result = await db
    .from(TABLE_NAME)
    .select<AiVideoRunRow>("*")
    .eq("id", runId)
    .maybeSingle();
  const row = maybeResult<AiVideoRunRow | null>(result, "ai_video_runs.select");
  return row ? mapRow(row) : null;
}

export async function listRecentAiVideoRuns(
  options: { limit?: number; status?: AiVideoRunStatus[] } = {},
): Promise<AiVideoRunRecord[]> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 12));
  let query = db
    .from(TABLE_NAME)
    .select<AiVideoRunRow>("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (options.status && options.status.length) {
    query = query.in("status", options.status);
  }

  const result = (await query) as unknown as DatabaseResult<AiVideoRunRow[]>;
  if (result.error) {
    throw decorateDatabaseError("ai_video_runs.list", result.error);
  }
  const rows = result.data ?? [];
  return rows.map(mapRow);
}
