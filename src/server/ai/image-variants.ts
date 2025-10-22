import "server-only";

import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError, expectResult, maybeResult } from "@/lib/database/utils";
import type { DatabaseResult } from "@/ports/database";

const TABLE_NAME = "ai_image_variants";

type AiImageVariantRow = {
  id: string;
  run_id: string | null;
  owner_user_id: string | null;
  capsule_id: string | null;
  asset_kind: string;
  branch_key: string;
  version: number;
  image_url: string;
  thumb_url: string | null;
  metadata: Record<string, unknown> | null;
  parent_variant_id: string | null;
  created_at: string;
};

export type AiImageVariantRecord = {
  id: string;
  runId: string | null;
  ownerUserId: string | null;
  capsuleId: string | null;
  assetKind: string;
  branchKey: string;
  version: number;
  imageUrl: string;
  thumbUrl: string | null;
  metadata: Record<string, unknown>;
  parentVariantId: string | null;
  createdAt: string;
};

function mapRow(row: AiImageVariantRow): AiImageVariantRecord {
  return {
    id: row.id,
    runId: row.run_id,
    ownerUserId: row.owner_user_id,
    capsuleId: row.capsule_id,
    assetKind: row.asset_kind,
    branchKey: row.branch_key,
    version: row.version ?? 1,
    imageUrl: row.image_url,
    thumbUrl: row.thumb_url,
    metadata: row.metadata ?? {},
    parentVariantId: row.parent_variant_id,
    createdAt: row.created_at,
  };
}

function normalizeBranchKey(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length ? trimmed.toLowerCase() : "main";
}

export type CreateAiImageVariantInput = {
  ownerUserId?: string | null;
  capsuleId?: string | null;
  assetKind: string;
  imageUrl: string;
  thumbUrl?: string | null;
  metadata?: Record<string, unknown>;
  branchKey?: string | null;
  runId?: string | null;
  parentVariantId?: string | null;
};

export async function createAiImageVariant(
  input: CreateAiImageVariantInput,
): Promise<AiImageVariantRecord> {
  const db = getDatabaseAdminClient();
  const branchKey = normalizeBranchKey(input.branchKey);

  let latestQuery = db
    .from(TABLE_NAME)
    .select<AiImageVariantRow>("*")
    .eq("asset_kind", input.assetKind)
    .eq("branch_key", branchKey);

  latestQuery = input.ownerUserId
    ? latestQuery.eq("owner_user_id", input.ownerUserId)
    : latestQuery.is("owner_user_id", null);

  latestQuery = input.capsuleId
    ? latestQuery.eq("capsule_id", input.capsuleId)
    : latestQuery.is("capsule_id", null);

  const latestResult = await latestQuery.order("version", { ascending: false }).limit(1).maybeSingle();
  const latestRow = maybeResult<AiImageVariantRow | null>(latestResult, "ai_image_variants.latest");
  const nextVersion = latestRow && typeof latestRow.version === "number" ? latestRow.version + 1 : 1;

  const payload = {
    run_id: input.runId ?? null,
    owner_user_id: input.ownerUserId ?? null,
    capsule_id: input.capsuleId ?? null,
    asset_kind: input.assetKind,
    branch_key: branchKey,
    version: nextVersion,
    image_url: input.imageUrl,
    thumb_url: input.thumbUrl ?? null,
    metadata: input.metadata ?? {},
    parent_variant_id: input.parentVariantId ?? null,
  };

  const insertResult = await db
    .from(TABLE_NAME)
    .insert(payload, { returning: "representation" })
    .select<AiImageVariantRow>("*")
    .single();

  const insertedRow = expectResult(insertResult, "ai_image_variants.insert");
  return mapRow(insertedRow);
}

export type ListAiImageVariantsInput = {
  ownerUserId?: string | null;
  capsuleId?: string | null;
  assetKind: string;
  branchKey?: string | null;
  limit?: number;
};

export async function listAiImageVariants(
  input: ListAiImageVariantsInput,
): Promise<AiImageVariantRecord[]> {
  const db = getDatabaseAdminClient();
  const branchKey = normalizeBranchKey(input.branchKey);
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));

  let query = db
    .from(TABLE_NAME)
    .select<AiImageVariantRow>("*")
    .eq("asset_kind", input.assetKind)
    .eq("branch_key", branchKey);

  query = input.ownerUserId
    ? query.eq("owner_user_id", input.ownerUserId)
    : query.is("owner_user_id", null);

  query = input.capsuleId ? query.eq("capsule_id", input.capsuleId) : query.is("capsule_id", null);

  const result = (await query.order("version", { ascending: false }).limit(limit)) as unknown as DatabaseResult<AiImageVariantRow[]>;
  if (result.error) {
    throw decorateDatabaseError("ai_image_variants.list", result.error);
  }

  const rows = result.data ?? [];
  return rows.map(mapRow);
}
