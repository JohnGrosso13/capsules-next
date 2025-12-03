import { decorateDatabaseError } from "@/lib/database/utils";
import type { DatabaseError } from "@/ports/database";

import {
  buildSlugCandidate,
  db,
  normalizeName,
  normalizeString,
  resolveOwnership,
  upsertSummary,
} from "./shared";
import type {
  CapsuleFollowerRow,
  CapsuleMemberRow,
  CapsuleRow,
  CapsuleSummary,
  DiscoverCapsuleSummary,
} from "./types";
import { SLUG_MAX_ATTEMPTS } from "./shared";

export async function listCapsulesForUser(userId: string): Promise<CapsuleSummary[]> {
  const summaries = new Map<string, CapsuleSummary>();
  const order: string[] = [];

  const membershipQuery = db
    .from("capsule_members")
    .select<CapsuleMemberRow>(
      "capsule_id, role, joined_at, capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url,membership_policy,created_by_id)",
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .fetch();

  const ownedQuery = db
    .from("capsules")
    .select<CapsuleRow>(
      "id, name, slug, banner_url, store_banner_url, promo_tile_url, logo_url, membership_policy, created_by_id, created_at",
    )
    .eq("created_by_id", userId)
    .order("created_at", { ascending: true })
    .fetch();

  const followersQuery = db
    .from("capsule_followers")
    .select<CapsuleFollowerRow>(
      "capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url,created_by_id), capsule_id, user_id, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .fetch();

  const [membershipResult, ownedResult, followersResult] = await Promise.all([
    membershipQuery,
    ownedQuery,
    followersQuery,
  ]);

  if (membershipResult.error)
    throw decorateDatabaseError("capsules.memberships", membershipResult.error);

  for (const row of membershipResult.data ?? []) {
    if (!row?.capsule) continue;
    const ownership = row.capsule.created_by_id === userId ? "owner" : "member";
    upsertSummary(summaries, order, row.capsule, { role: row.role, ownership });
  }

  if (ownedResult.error) throw decorateDatabaseError("capsules.owned", ownedResult.error);

  for (const row of ownedResult.data ?? []) {
    if (!row) continue;
    upsertSummary(summaries, order, row, { ownership: "owner" });
  }

  if (followersResult.error) {
    throw decorateDatabaseError("capsules.followers.list", followersResult.error);
  }

  for (const row of followersResult.data ?? []) {
    if (!row?.capsule) continue;
    upsertSummary(summaries, order, row.capsule, { ownership: "follower" });
  }

  return order
    .map((id) => summaries.get(id) ?? null)
    .filter((entry): entry is CapsuleSummary => entry !== null);
}

export async function listCapsulesByOwnerIds(
  ownerIds: string[],
  options: { limit?: number } = {},
): Promise<CapsuleSummary[]> {
  const normalizedOwners = Array.from(
    new Set(
      ownerIds
        .map((id) => normalizeString(id))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (!normalizedOwners.length) {
    return [];
  }

  const requestedLimit = typeof options.limit === "number" ? Math.floor(options.limit) : 24;
  const limit = Math.min(Math.max(requestedLimit, 1), 64);

  const result = await db
    .from("capsules")
    .select<CapsuleRow>(
      "id, name, slug, banner_url, store_banner_url, promo_tile_url, logo_url, membership_policy, created_by_id, created_at",
    )
    .in("created_by_id", normalizedOwners)
    .order("created_at", { ascending: false })
    .limit(limit)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.listByOwners", result.error);
  }

  const summaries: CapsuleSummary[] = [];
  for (const row of result.data ?? []) {
    if (!row?.id) continue;
    summaries.push({
      id: String(row.id),
      name: normalizeName(row.name),
      slug: normalizeString(row.slug),
      bannerUrl: normalizeString(row.banner_url),
      storeBannerUrl: normalizeString(row.store_banner_url),
      promoTileUrl: normalizeString(row.promo_tile_url),
      logoUrl: normalizeString(row.logo_url),
      role: null,
      ownership: "owner",
    });
  }
  return summaries;
}

export async function listAllCapsules(): Promise<Array<{ id: string; name: string | null }>> {
  const result = await db
    .from("capsules")
    .select<CapsuleRow>("id, name, membership_policy, created_at")
    .order("created_at", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.listAll", result.error);
  }

  const entries: Array<{ id: string; name: string | null }> = [];
  for (const row of result.data ?? []) {
    const id = normalizeString(row?.id);
    if (!id) continue;
    entries.push({
      id,
      name: normalizeString(row?.name ?? null),
    });
  }
  return entries;
}

export async function listRecentPublicCapsules(
  options: {
    excludeCreatorId?: string | null;
    limit?: number;
  } = {},
): Promise<DiscoverCapsuleSummary[]> {
  const normalizedExclude = normalizeString(options.excludeCreatorId ?? null);
  const requestedLimit = typeof options.limit === "number" ? Math.floor(options.limit) : 16;
  const normalizedLimit = Math.min(Math.max(requestedLimit, 1), 48);
  const queryLimit = normalizedExclude ? Math.min(normalizedLimit * 2, 64) : normalizedLimit;

  let query = db
    .from("capsules")
    .select<CapsuleRow>(
      "id, name, slug, banner_url, store_banner_url, promo_tile_url, logo_url, membership_policy, created_by_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(queryLimit);

  if (normalizedExclude) {
    query = query.neq("created_by_id", normalizedExclude);
  }

  const result = await query.fetch();
  if (result.error) throw decorateDatabaseError("capsules.recent", result.error);

  const rows = result.data ?? [];
  const seen = new Set<string>();
  const discovered: DiscoverCapsuleSummary[] = [];

  for (const row of rows) {
    const id = normalizeString(row?.id);
    if (!id || seen.has(id)) continue;
    const creatorId = normalizeString(row?.created_by_id);
    if (normalizedExclude && creatorId === normalizedExclude) continue;
    seen.add(id);

    discovered.push({
      id,
      name: normalizeName(row?.name ?? null),
      slug: normalizeString(row?.slug ?? null),
      bannerUrl: normalizeString(row?.banner_url ?? null),
      storeBannerUrl: normalizeString(row?.store_banner_url ?? null),
      promoTileUrl: normalizeString(row?.promo_tile_url ?? null),
      logoUrl: normalizeString(row?.logo_url ?? null),
      createdAt: normalizeString(row?.created_at ?? null),
      membershipPolicy: normalizeString(row?.membership_policy ?? null),
    });

    if (discovered.length >= normalizedLimit) break;
  }

  return discovered;
}

export async function getCapsuleSummaryForViewer(
  capsuleId: string,
  viewerId?: string | null,
): Promise<CapsuleSummary | null> {
  const capsule = await findCapsuleById(capsuleId);
  if (!capsule?.id) return null;

  return {
    id: String(capsule.id),
    name: normalizeName(capsule.name),
    slug: normalizeString(capsule.slug),
    bannerUrl: normalizeString(capsule.banner_url),
    storeBannerUrl: normalizeString(capsule.store_banner_url),
    promoTileUrl: normalizeString(capsule.promo_tile_url),
    logoUrl: normalizeString(capsule.logo_url),
    role: null,
    ownership: resolveOwnership(capsule, viewerId),
    membershipPolicy: normalizeString(capsule.membership_policy ?? null),
  };
}

type CapsuleInsert = {
  name: string;
  slug?: string | null;
  created_by_id: string;
};

function makeSummary(row: CapsuleRow, role: "owner" | string | null): CapsuleSummary {
  return {
    id: String(row.id),
    name: normalizeName(row.name),
    slug: normalizeString(row.slug),
    bannerUrl: normalizeString(row.banner_url),
    storeBannerUrl: normalizeString(row.store_banner_url),
    promoTileUrl: normalizeString(row.promo_tile_url),
    logoUrl: normalizeString(row.logo_url),
    role: role ?? null,
    ownership: "owner",
    membershipPolicy: normalizeString(row.membership_policy ?? null),
  };
}

export async function createCapsuleForUser(
  userId: string,
  params: { name: string },
): Promise<CapsuleSummary> {
  const name = normalizeName(params.name);
  const attempts = SLUG_MAX_ATTEMPTS + 1;
  let lastError: DatabaseError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidateSlug = buildSlugCandidate(name, attempt);
    const payload: CapsuleInsert = {
      name,
      created_by_id: userId,
      ...(candidateSlug ? { slug: candidateSlug } : {}),
    };

    const inserted = await db
      .from("capsules")
      .insert<CapsuleInsert>(payload)
      .select<CapsuleRow>(
        "id, name, slug, banner_url, store_banner_url, promo_tile_url, logo_url, created_by_id",
      )
      .single();

    if (inserted.error) {
      // 23505 => unique violation (likely slug). Retry with a new slug candidate.
      if (inserted.error.code === "23505") {
        lastError = inserted.error;
        continue;
      }
      throw decorateDatabaseError("capsules.create", inserted.error);
    }

    const row = inserted.data;
    if (!row?.id) {
      throw new Error("capsules.create: insert returned invalid row");
    }

    const membership = await db
      .from("capsule_members")
      .upsert(
        { capsule_id: row.id, user_id: userId, role: "owner" },
        { onConflict: "capsule_id,user_id" },
      )
      .fetch();

    if (membership.error) {
      throw decorateDatabaseError("capsules.createMembership", membership.error);
    }

    return makeSummary(row, "owner");
  }

  if (lastError) {
    throw decorateDatabaseError("capsules.create", lastError);
  }
  throw new Error("capsules.create: failed to create capsule");
}

export async function deleteCapsuleOwnedByUser(
  userId: string,
  capsuleId: string,
): Promise<boolean> {
  const normalizedId = normalizeString(capsuleId);
  if (!normalizedId) {
    throw new Error("capsules.delete: capsuleId is required");
  }

  const result = await db
    .from("capsules")
    .delete({ count: "exact" })
    .eq("id", normalizedId)
    .eq("created_by_id", userId)
    .select("id")
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.delete", result.error);
  }

  const deleted = (result.data ?? []).length;
  return deleted > 0;
}

export async function updateCapsuleBanner(params: {
  capsuleId: string;
  ownerId: string;
  bannerUrl: string | null;
}): Promise<boolean> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedOwnerId = normalizeString(params.ownerId);
  if (!normalizedCapsuleId || !normalizedOwnerId) {
    return false;
  }

  const normalizedBannerUrl = normalizeString(params.bannerUrl ?? null);

  const result = await db
    .from("capsules")
    .update({ banner_url: normalizedBannerUrl })
    .eq("id", normalizedCapsuleId)
    .eq("created_by_id", normalizedOwnerId)
    .select<{ id: string | null }>("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.updateBanner", result.error);
  }

  return Boolean(result.data?.id);
}

export async function updateCapsuleStoreBanner(params: {
  capsuleId: string;
  ownerId: string;
  storeBannerUrl: string | null;
}): Promise<boolean> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedOwnerId = normalizeString(params.ownerId);
  if (!normalizedCapsuleId || !normalizedOwnerId) {
    return false;
  }

  const normalizedStoreBannerUrl = normalizeString(params.storeBannerUrl ?? null);

  const result = await db
    .from("capsules")
    .update({ store_banner_url: normalizedStoreBannerUrl })
    .eq("id", normalizedCapsuleId)
    .eq("created_by_id", normalizedOwnerId)
    .select<{ id: string | null }>("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.updateStoreBanner", result.error);
  }

  return Boolean(result.data?.id);
}

export async function updateCapsulePromoTile(params: {
  capsuleId: string;
  ownerId: string;
  promoTileUrl: string | null;
}): Promise<boolean> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedOwnerId = normalizeString(params.ownerId);
  if (!normalizedCapsuleId || !normalizedOwnerId) {
    return false;
  }

  const normalizedPromoUrl = normalizeString(params.promoTileUrl ?? null);

  const result = await db
    .from("capsules")
    .update({ promo_tile_url: normalizedPromoUrl })
    .eq("id", normalizedCapsuleId)
    .eq("created_by_id", normalizedOwnerId)
    .select<{ id: string | null }>("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.updatePromoTile", result.error);
  }

  return Boolean(result.data?.id);
}

export async function updateCapsuleLogo(params: {
  capsuleId: string;
  ownerId: string;
  logoUrl: string | null;
}): Promise<boolean> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedOwnerId = normalizeString(params.ownerId);
  if (!normalizedCapsuleId || !normalizedOwnerId) {
    return false;
  }

  const normalizedLogoUrl = normalizeString(params.logoUrl ?? null);

  const result = await db
    .from("capsules")
    .update({ logo_url: normalizedLogoUrl })
    .eq("id", normalizedCapsuleId)
    .eq("created_by_id", normalizedOwnerId)
    .select<{ id: string | null }>("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.updateLogo", result.error);
  }

  return Boolean(result.data?.id);
}

export async function updateCapsuleMembershipPolicy(params: {
  capsuleId: string;
  policy: string;
}): Promise<boolean> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedPolicy = normalizeString(params.policy);
  if (!normalizedCapsuleId || !normalizedPolicy) {
    return false;
  }

  const result = await db
    .from("capsules")
    .update({ membership_policy: normalizedPolicy })
    .eq("id", normalizedCapsuleId)
    .select<{ id: string | null }>("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.updateMembershipPolicy", result.error);
  }

  return Boolean(result.data?.id);
}

export async function findCapsuleById(capsuleId: string): Promise<CapsuleRow | null> {
  const normalizedId = normalizeString(capsuleId);
  if (!normalizedId) return null;

  const result = await db
    .from("capsules")
    .select<CapsuleRow>(
      "id, name, slug, banner_url, store_banner_url, promo_tile_url, logo_url, membership_policy, created_by_id, created_at",
    )
    .eq("id", normalizedId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.findById", result.error);
  }

  return result.data ?? null;
}
