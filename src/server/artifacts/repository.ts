import { getDatabaseAdminClient } from "@/config/database";
import { expectResult, maybeResult } from "@/lib/database/utils";
import type {
  ArtifactAssetInput,
  ArtifactAssetRecord,
  ArtifactEventInput,
  ArtifactEventRecord,
  ArtifactRecord,
  ArtifactWithAssets,
  CreateArtifactInput,
  ArtifactPatchInput,
} from "./types";
import type {
  Artifact,
  ArtifactBlock,
  ArtifactStatus,
  ArtifactType,
} from "@/shared/types/artifacts";

const db = getDatabaseAdminClient();

type ArtifactRow = {
  id: string;
  owner_user_id: string;
  artifact_type: string;
  status: string;
  title: string;
  description: string | null;
  version: number;
  metadata: unknown;
  blocks: unknown;
  context: unknown;
  created_at: string;
  updated_at: string;
  committed_at: string | null;
};

type ArtifactAssetRow = {
  id: string;
  artifact_id: string;
  block_id: string;
  slot_id: string;
  r2_bucket: string;
  r2_key: string;
  content_type: string | null;
  descriptor: unknown;
  created_at: string;
};

type ArtifactEventRow = {
  id: string;
  artifact_id: string;
  event_type: string;
  origin: string;
  payload: unknown;
  emitted_at: string;
};

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof value === "object") {
    return value as T;
  }
  return fallback;
}

function mapArtifactRow(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    artifactType: row.artifact_type as ArtifactType,
    status: row.status as ArtifactStatus,
    title: row.title,
    description: row.description,
    version: row.version,
    metadata: parseJsonValue<Record<string, unknown>>(row.metadata, {}),
    blocks: parseJsonValue<ArtifactBlock[]>(row.blocks, []),
    context: parseJsonValue<Artifact["context"]>(row.context, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    committedAt: row.committed_at,
  };
}

function mapArtifactAssetRow(row: ArtifactAssetRow): ArtifactAssetRecord {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    blockId: row.block_id,
    slotId: row.slot_id,
    r2Bucket: row.r2_bucket,
    r2Key: row.r2_key,
    contentType: row.content_type,
    descriptor: parseJsonValue<Record<string, unknown> | null>(row.descriptor, null),
    createdAt: row.created_at,
  };
}

function mapArtifactEventRow(row: ArtifactEventRow): ArtifactEventRecord {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    eventType: row.event_type,
    origin: (row.origin ?? "system") as ArtifactEventRecord["origin"],
    payload: parseJsonValue<Record<string, unknown>>(row.payload, {}),
    emittedAt: row.emitted_at,
  };
}

export async function insertArtifactRow(input: CreateArtifactInput): Promise<ArtifactRecord> {
  const payload = {
    owner_user_id: input.ownerUserId,
    artifact_type: input.artifactType,
    status: "draft",
    title: input.title,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
    blocks: input.blocks ?? [],
    context: input.context ?? null,
  };
  const result = await db
    .from("artifact_artifacts")
    .insert(payload, { returning: "representation" })
    .select<ArtifactRow>("*")
    .single();
  const row = expectResult<ArtifactRow>(result, "insert artifact");
  return mapArtifactRow(row);
}

export async function updateArtifactRow(
  artifactId: string,
  patch: ArtifactPatchInput,
): Promise<ArtifactRecord | null> {
  const updatePayload: Record<string, unknown> = {
    version: patch.expectedVersion + 1,
  };
  if (patch.title !== undefined) updatePayload.title = patch.title;
  if (patch.description !== undefined) updatePayload.description = patch.description;
  if (patch.status !== undefined) updatePayload.status = patch.status;
  if (patch.metadata !== undefined) updatePayload.metadata = patch.metadata ?? {};
  if (patch.blocks !== undefined) updatePayload.blocks = patch.blocks;
  if (patch.context !== undefined) updatePayload.context = patch.context ?? null;

  const result = await db
    .from("artifact_artifacts")
    .update(updatePayload)
    .eq("id", artifactId)
    .eq("version", patch.expectedVersion)
    .select<ArtifactRow>("*")
    .maybeSingle();

  const row = maybeResult<ArtifactRow | null>(result, "update artifact");
  return row ? mapArtifactRow(row) : null;
}

export async function markArtifactCommitted(
  artifactId: string,
  expectedVersion: number,
): Promise<ArtifactRecord | null> {
  const payload = {
    committed_at: new Date().toISOString(),
  };
  const result = await db
    .from("artifact_artifacts")
    .update(payload)
    .eq("id", artifactId)
    .eq("version", expectedVersion)
    .select<ArtifactRow>("*")
    .maybeSingle();
  const row = maybeResult<ArtifactRow | null>(result, "mark artifact committed");
  return row ? mapArtifactRow(row) : null;
}


export async function selectArtifactById(artifactId: string): Promise<ArtifactRecord | null> {
  const result = await db
    .from("artifact_artifacts")
    .select<ArtifactRow>("*")
    .eq("id", artifactId)
    .maybeSingle();
  const row = maybeResult<ArtifactRow | null>(result, "select artifact by id");
  return row ? mapArtifactRow(row) : null;
}

export async function selectArtifactsByOwner(ownerUserId: string): Promise<ArtifactRecord[]> {
  const result = await db
    .from("artifact_artifacts")
    .select<ArtifactRow>("*")
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(200)
    .fetch();
  const rows = expectResult<ArtifactRow[]>(result, "select artifacts by owner");
  return rows.map(mapArtifactRow);
}

export async function upsertArtifactAssets(assets: ArtifactAssetInput[]): Promise<ArtifactAssetRecord[]> {
  if (!assets.length) return [];
  const payload = assets.map((asset) => ({
    artifact_id: asset.artifactId,
    block_id: asset.blockId,
    slot_id: asset.slotId,
    r2_bucket: asset.r2Bucket,
    r2_key: asset.r2Key,
    content_type: asset.contentType ?? null,
    descriptor: asset.descriptor ?? null,
  }));
  const result = await db
    .from("artifact_assets")
    .upsert(payload, { onConflict: "artifact_id,block_id,slot_id", returning: "representation" })
    .select<ArtifactAssetRow>("*")
    .fetch();
  const rows = expectResult<ArtifactAssetRow[]>(result, "upsert artifact assets");
  return rows.map(mapArtifactAssetRow);
}

export async function selectArtifactAssets(artifactId: string): Promise<ArtifactAssetRecord[]> {
  const result = await db
    .from("artifact_assets")
    .select<ArtifactAssetRow>("*")
    .eq("artifact_id", artifactId)
    .order("created_at", { ascending: false })
    .fetch();
  const rows = expectResult<ArtifactAssetRow[]>(result, "select artifact assets");
  return rows.map(mapArtifactAssetRow);
}

export async function insertArtifactEvent(
  event: ArtifactEventInput,
): Promise<ArtifactEventRecord> {
  const payload = {
    artifact_id: event.artifactId,
    event_type: event.eventType,
    origin: event.origin,
    payload: event.payload,
  };
  const result = await db
    .from("artifact_events")
    .insert(payload, { returning: "representation" })
    .select<ArtifactEventRow>("*")
    .single();
  const row = expectResult<ArtifactEventRow>(result, "insert artifact event");
  return mapArtifactEventRow(row);
}

export async function selectArtifactWithAssets(artifactId: string): Promise<ArtifactWithAssets | null> {
  const artifact = await selectArtifactById(artifactId);
  if (!artifact) return null;
  const assets = await selectArtifactAssets(artifactId);
  return { ...artifact, assets };
}




