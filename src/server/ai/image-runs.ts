import "server-only";

import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError, expectResult, maybeResult } from "@/lib/database/utils";
import type { DatabaseResult } from "@/ports/database";

export type AiImageRunStatus = "pending" | "running" | "succeeded" | "failed";

export type AiImageRunAttempt = {
  attempt: number;
  model: string | null;
  startedAt: string;
  completedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown> | null;
};

export type AiImageRunRecord = {
  id: string;
  ownerUserId: string | null;
  capsuleId: string | null;
  mode: "generate" | "edit";
  assetKind: string;
  userPrompt: string;
  resolvedPrompt: string;
  stylePreset: string | null;
  provider: string;
  model: string | null;
  options: Record<string, unknown>;
  retryCount: number;
  status: AiImageRunStatus;
  errorCode: string | null;
  errorMessage: string | null;
  errorMeta: Record<string, unknown> | null;
  imageUrl: string | null;
  responseMetadata: Record<string, unknown> | null;
  attempts: AiImageRunAttempt[];
  startedAt: string;
  completedAt: string | null;
};

export type CreateAiImageRunInput = {
  ownerUserId?: string | null;
  capsuleId?: string | null;
  mode: "generate" | "edit";
  assetKind: string;
  userPrompt: string;
  resolvedPrompt: string;
  stylePreset?: string | null;
  provider?: string;
  model?: string | null;
  options?: Record<string, unknown>;
  status?: AiImageRunStatus;
};

export type UpdateAiImageRunInput = {
  status?: AiImageRunStatus;
  retryCount?: number;
  model?: string | null;
  provider?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorMeta?: Record<string, unknown> | null;
  imageUrl?: string | null;
  responseMetadata?: Record<string, unknown> | null;
  attempts?: AiImageRunAttempt[];
  completedAt?: string | null;
  options?: Record<string, unknown>;
};

const TABLE_NAME = "ai_image_runs";

type AiImageRunRow = {
  id: string;
  owner_user_id: string | null;
  capsule_id: string | null;
  mode: "generate" | "edit";
  asset_kind: string;
  user_prompt: string;
  resolved_prompt: string;
  style_preset: string | null;
  provider: string;
  model: string | null;
  options: Record<string, unknown> | null;
  retry_count: number;
  status: AiImageRunStatus;
  error_code: string | null;
  error_message: string | null;
  error_meta: Record<string, unknown> | null;
  image_url: string | null;
  response_metadata: Record<string, unknown> | null;
  attempts: AiImageRunAttempt[] | null;
  started_at: string;
  completed_at: string | null;
};

function sanitizeObject<T extends Record<string, unknown>>(
  input: unknown,
  fallback: T,
): T {
  if (!input || typeof input !== "object") return fallback;
  return { ...(input as Record<string, unknown>) } as T;
}

function mapOptionalObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  return { ...(input as Record<string, unknown>) };
}

function sanitizeAttempts(input: unknown): AiImageRunAttempt[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const source = entry as Record<string, unknown>;
      const attemptNumber = Number(source.attempt);
      const startedAtValue = typeof source.startedAt === "string" ? source.startedAt : null;
      if (!Number.isFinite(attemptNumber) || !startedAtValue) return null;
      const normalized: AiImageRunAttempt = {
        attempt: Math.max(0, Math.floor(attemptNumber)),
        model: typeof source.model === "string" ? source.model : null,
        startedAt: startedAtValue,
        completedAt:
          typeof source.completedAt === "string" && source.completedAt.length > 0
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
    .filter((entry): entry is AiImageRunAttempt => Boolean(entry));
}

function mapRow(row: AiImageRunRow): AiImageRunRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    capsuleId: row.capsule_id,
    mode: row.mode,
    assetKind: row.asset_kind,
    userPrompt: row.user_prompt,
    resolvedPrompt: row.resolved_prompt,
  stylePreset: row.style_preset,
  provider: row.provider,
  model: row.model,
  options: sanitizeObject<Record<string, unknown>>(row.options, {}),
  retryCount: row.retry_count ?? 0,
  status: row.status ?? "pending",
  errorCode: row.error_code,
  errorMessage: row.error_message,
  errorMeta: mapOptionalObject(row.error_meta),
  imageUrl: row.image_url,
  responseMetadata: mapOptionalObject(row.response_metadata),
  attempts: sanitizeAttempts(row.attempts),
  startedAt: row.started_at,
  completedAt: row.completed_at,
};
}

const db = getDatabaseAdminClient();

export async function createAiImageRun(
  input: CreateAiImageRunInput,
): Promise<AiImageRunRecord> {
  const payload = {
    owner_user_id: input.ownerUserId ?? null,
    capsule_id: input.capsuleId ?? null,
    mode: input.mode,
    asset_kind: input.assetKind,
    user_prompt: input.userPrompt,
    resolved_prompt: input.resolvedPrompt,
    style_preset: input.stylePreset ?? null,
    provider: input.provider ?? "openai",
    model: input.model ?? null,
    options: input.options ?? {},
    status: input.status ?? "pending",
  };

  const result = await db
    .from(TABLE_NAME)
    .insert(payload, { returning: "representation" })
    .select<AiImageRunRow>("*")
    .single();

  return mapRow(expectResult(result, "ai_image_runs.insert"));
}

export async function updateAiImageRun(
  runId: string,
  patch: UpdateAiImageRunInput,
): Promise<AiImageRunRecord | null> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.status) updatePayload.status = patch.status;
  if (patch.retryCount !== undefined) updatePayload.retry_count = Math.max(0, patch.retryCount);
  if (patch.model !== undefined) updatePayload.model = patch.model;
  if (patch.provider !== undefined) updatePayload.provider = patch.provider ?? "openai";
  if (patch.errorCode !== undefined) updatePayload.error_code = patch.errorCode;
  if (patch.errorMessage !== undefined) updatePayload.error_message = patch.errorMessage;
  if (patch.errorMeta !== undefined) updatePayload.error_meta = patch.errorMeta ?? null;
  if (patch.imageUrl !== undefined) updatePayload.image_url = patch.imageUrl;
  if (patch.responseMetadata !== undefined)
    updatePayload.response_metadata = patch.responseMetadata ?? null;
  if (patch.attempts !== undefined) updatePayload.attempts = patch.attempts ?? [];
  if (patch.completedAt !== undefined) updatePayload.completed_at = patch.completedAt;
  if (patch.options !== undefined) updatePayload.options = patch.options ?? {};

  if (!Object.keys(updatePayload).length) {
    const existing = await db
      .from(TABLE_NAME)
      .select<AiImageRunRow>("*")
      .eq("id", runId)
      .maybeSingle();
    const row = maybeResult<AiImageRunRow | null>(existing, "ai_image_runs.select");
    return row ? mapRow(row) : null;
  }

  const result = await db
    .from(TABLE_NAME)
    .update(updatePayload)
    .eq("id", runId)
    .select<AiImageRunRow>("*")
    .maybeSingle();

  const row = maybeResult<AiImageRunRow | null>(result, "ai_image_runs.update");
  return row ? mapRow(row) : null;
}

export async function listRecentAiImageRuns(
  options: { limit?: number; status?: AiImageRunStatus[] } = {},
): Promise<AiImageRunRecord[]> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 12));
  let query = db
    .from(TABLE_NAME)
    .select<AiImageRunRow>("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (options.status && options.status.length) {
    query = query.in("status", options.status);
  }

  const result = (await query) as unknown as DatabaseResult<AiImageRunRow[]>;
  if (result.error) {
    throw decorateDatabaseError("ai_image_runs.list", result.error);
  }
  const rows = result.data ?? [];
  return rows.map(mapRow);
}
