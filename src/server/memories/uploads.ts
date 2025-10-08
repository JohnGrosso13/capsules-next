import "server-only";

import { getDatabaseAdminClient } from "@/config/database";

const db = getDatabaseAdminClient();

export type UploadSessionStatus =
  | "initialized"
  | "uploading"
  | "uploaded"
  | "processing"
  | "completed"
  | "failed";

export type UploadSessionRecord = {
  id: string;
  owner_user_id: string;
  upload_id: string;
  r2_key: string;
  r2_bucket: string;
  absolute_url: string | null;
  content_type: string | null;
  content_length: number | null;
  part_size: number | null;
  total_parts: number | null;
  checksum: string | null;
  metadata: Record<string, unknown> | null;
  derived_assets: Array<Record<string, unknown>> | null;
  status: UploadSessionStatus;
  client_ip: string | null;
  turnstile_action: string | null;
  turnstile_cdata: string | null;
  created_at: string;
  updated_at: string;
  uploaded_at: string | null;
  completed_at: string | null;
  error_reason: string | null;
  memory_id: string | null;
  parts: Array<{ partNumber: number; etag: string }> | null;
};

function mapRow(row: Record<string, unknown>): UploadSessionRecord | null {
  if (!row || typeof row !== "object") return null;
  try {
    const metadataValue = (row as { metadata?: unknown }).metadata;
    const derivedValue = (row as { derived_assets?: unknown }).derived_assets;
    const partsValue = (row as { parts?: unknown }).parts;
    const toNumber = (value: unknown) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "number") return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return {
      id: String(row.id),
      owner_user_id: String(row.owner_user_id),
      upload_id: String(row.upload_id),
      r2_key: String(row.r2_key),
      r2_bucket: String(row.r2_bucket),
      absolute_url: typeof row.absolute_url === "string" ? row.absolute_url : null,
      content_type: typeof row.content_type === "string" ? row.content_type : null,
      content_length: toNumber(row.content_length),
      part_size: toNumber(row.part_size),
      total_parts: toNumber(row.total_parts),
      checksum: typeof row.checksum === "string" ? row.checksum : null,
      metadata:
        metadataValue && typeof metadataValue === "object"
          ? (metadataValue as Record<string, unknown>)
          : null,
      derived_assets:
        Array.isArray(derivedValue)
          ? (derivedValue as Array<Record<string, unknown>>)
          : null,
      status: String(row.status) as UploadSessionStatus,
      client_ip: typeof row.client_ip === "string" ? row.client_ip : null,
      turnstile_action: typeof row.turnstile_action === "string" ? row.turnstile_action : null,
      turnstile_cdata: typeof row.turnstile_cdata === "string" ? row.turnstile_cdata : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      uploaded_at: row.uploaded_at ? String(row.uploaded_at) : null,
      completed_at: row.completed_at ? String(row.completed_at) : null,
      error_reason: typeof row.error_reason === "string" ? row.error_reason : null,
      memory_id: row.memory_id ? String(row.memory_id) : null,
      parts:
        Array.isArray(partsValue)
          ? (partsValue as Array<Record<string, unknown>>)
              .map((entry) => {
                const partNumber = toNumber(entry.partNumber ?? entry.part_number);
                const etagRaw = entry.etag ?? entry.ETag ?? null;
                if (!partNumber || typeof etagRaw !== "string") {
                  return null;
                }
                return { partNumber, etag: etagRaw };
              })
              .filter((entry): entry is { partNumber: number; etag: string } => Boolean(entry))
          : null,
    };
  } catch (error) {
    console.warn("map upload session failed", error);
    return null;
  }
}

export async function createUploadSessionRecord(options: {
  ownerId: string;
  uploadId: string;
  key: string;
  bucket: string;
  absoluteUrl?: string | null;
  contentType?: string | null;
  contentLength?: number | null;
  partSize?: number | null;
  totalParts?: number | null;
  checksum?: string | null;
  metadata?: Record<string, unknown> | null;
  turnstileAction?: string | null;
  turnstileCdata?: string | null;
  clientIp?: string | null;
}): Promise<UploadSessionRecord | null> {
  const result = await db
    .from("media_upload_sessions")
    .insert({
      owner_user_id: options.ownerId,
      upload_id: options.uploadId,
      r2_key: options.key,
      r2_bucket: options.bucket,
      absolute_url: options.absoluteUrl ?? null,
      content_type: options.contentType ?? null,
      content_length: options.contentLength ?? null,
      part_size: options.partSize ?? null,
      total_parts: options.totalParts ?? null,
      checksum: options.checksum ?? null,
      metadata: options.metadata ?? null,
      turnstile_action: options.turnstileAction ?? null,
      turnstile_cdata: options.turnstileCdata ?? null,
      client_ip: options.clientIp ?? null,
      status: "initialized",
    })
    .select<Record<string, unknown>>("*")
    .single();

  if (result.error) {
    console.warn("create upload session failed", result.error);
    return null;
  }

  const row = result.data;
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function markUploadSessionUploaded(options: {
  sessionId: string;
  uploadId: string;
  key: string;
  parts: Array<{ partNumber: number; etag: string }>;
  metadata?: Record<string, unknown> | null;
}): Promise<UploadSessionRecord | null> {
  const result = await db
    .from("media_upload_sessions")
    .update({
      upload_id: options.uploadId,
      r2_key: options.key,
      uploaded_at: new Date().toISOString(),
      status: "uploaded",
      parts: options.parts,
      metadata: options.metadata ?? null,
    })
    .eq("id", options.sessionId)
    .select<Record<string, unknown>>("*")
    .single();

  if (result.error) {
    console.warn("mark upload session uploaded failed", result.error);
    return null;
  }

  const row = result.data;
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function getUploadSessionById(sessionId: string): Promise<UploadSessionRecord | null> {
  const result = await db
    .from("media_upload_sessions")
    .select<Record<string, unknown>>("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (result.error) {
    console.warn("get upload session failed", result.error);
    return null;
  }

  const row = result.data;
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function getUploadSessionByUploadId(
  uploadId: string,
  ownerId?: string | null,
): Promise<UploadSessionRecord | null> {
  let builder = db
    .from("media_upload_sessions")
    .select<Record<string, unknown>>("*")
    .eq("upload_id", uploadId);

  if (ownerId) {
    builder = builder.eq("owner_user_id", ownerId);
  }

  const result = await builder.maybeSingle();

  if (result.error) {
    console.warn("get upload session by upload id failed", result.error);
    return null;
  }

  const row = result.data;
  return row ? mapRow(row as Record<string, unknown>) : null;
}


export async function listUploadSessionsByIds(sessionIds: string[]): Promise<UploadSessionRecord[]> {
  if (!sessionIds.length) return [];
  const result = await db
    .from("media_upload_sessions")
    .select<Record<string, unknown>>("*")
    .in("id", sessionIds)
    .fetch();
  if (result.error) {
    console.warn("list upload sessions failed", result.error);
    return [];
  }
  const rows = result.data ?? [];
  return rows
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((entry): entry is UploadSessionRecord => Boolean(entry));
}
export async function updateUploadSessionStatus(
  sessionId: string,
  patch: Partial<{
    status: UploadSessionStatus;
    error_reason: string | null;
    metadata: Record<string, unknown> | null;
    memory_id: string | null;
    completed_at: string | null;
  }>,
): Promise<void> {
  const result = await db
    .from("media_upload_sessions")
    .update(patch)
    .eq("id", sessionId)
    .fetch();

  if (result.error) {
    console.warn("update upload session status failed", result.error);
  }
}


