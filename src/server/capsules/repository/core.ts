import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError } from "@/lib/database/utils";
import type { DatabaseError } from "@/ports/database";
import type {
  CapsuleFollowerSummary,
  CapsuleMemberProfile,
  CapsuleMemberRequestSummary,
  CapsuleMemberSummary,
  CapsuleHistoryPeriod,
} from "@/types/capsules";
import { dbRoleToUiRole, resolveMemberUiRole } from "../roles";

export const db = getDatabaseAdminClient();

export type CapsuleRow = {
  id: string | null;
  name: string | null;
  slug: string | null;
  banner_url: string | null;
  store_banner_url: string | null;
  promo_tile_url: string | null;
  logo_url: string | null;
  membership_policy?: string | null;
  created_by_id: string | null;
  created_at?: string | null;
};

export type CapsuleMemberRow = {
  capsule_id: string | null;
  role: string | null;
  joined_at: string | null;
  capsule: CapsuleRow | null;
};

export type MemberProfileRow = {
  id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  user_key: string | null;
};

export type CapsuleMemberRecord = {
  capsule_id: string | null;
  user_id: string | null;
  role: string | null;
  joined_at: string | null;
};

export type CapsuleMemberDetailsRow = {
  capsule_id: string | null;
  user_id: string | null;
  role: string | null;
  joined_at: string | null;
  user: MemberProfileRow | null;
};

export type CapsuleMemberRequestRow = {
  id: string | null;
  capsule_id: string | null;
  requester_id: string | null;
  status: string | null;
  role: string | null;
  message: string | null;
  origin: string | null;
  responded_by: string | null;
  created_at: string | null;
  responded_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  requester: MemberProfileRow | null;
  initiator_id: string | null;
  initiator: MemberProfileRow | null;
  capsule: CapsuleRow | null;
};

export type CapsuleFollowerRow = {
  capsule_id: string | null;
  user_id: string | null;
  created_at: string | null;
  user: MemberProfileRow | null;
  capsule?: CapsuleRow | null;
};

export type CapsuleAssetRow = {
  id: string | null;
  owner_user_id: string | null;
  media_url: string | null;
  media_type: string | null;
  title: string | null;
  description: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  post_id: string | null;
  kind: string | null;
  view_count: number | null;
  uploaded_by: string | null;
};

type PostCapsuleRow = {
  client_id: string | null;
  capsule_id: string | null;
};

export type CapsuleHistorySnapshotRow = {
  capsule_id: string | null;
  suggested_generated_at: string | null;
  suggested_latest_post_at: string | null;
  post_count: number | null;
  suggested_snapshot: Record<string, unknown> | null;
  updated_at: string | null;
  suggested_period_hashes: Record<string, unknown> | null;
  published_snapshot: Record<string, unknown> | null;
  published_generated_at: string | null;
  published_latest_post_at: string | null;
  published_period_hashes: Record<string, unknown> | null;
  published_editor_id: string | null;
  published_editor_reason: string | null;
  prompt_memory: Record<string, unknown> | null;
  template_presets: Record<string, unknown> | null;
  coverage_meta: Record<string, unknown> | null;
};

export type CapsuleHistoryActivityRow = {
  id: string | null;
  created_at: string | null;
};

export type CapsuleHistoryRefreshCandidateRow = {
  capsule_id: string | null;
  owner_user_id: string | null;
  snapshot_generated_at: string | null;
  snapshot_latest_post: string | null;
  latest_post: string | null;
};

export type CapsuleHistorySectionSettingsRow = {
  capsule_id: string | null;
  period: string | null;
  editor_notes: string | null;
  excluded_post_ids: unknown;
  template_id: string | null;
  tone_recipe_id: string | null;
  prompt_overrides: Record<string, unknown> | null;
  coverage_snapshot: Record<string, unknown> | null;
  discussion_thread_id: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type CapsuleHistoryPinRow = {
  id: string | null;
  capsule_id: string | null;
  period: string | null;
  pin_type: string | null;
  post_id: string | null;
  quote: string | null;
  source: Record<string, unknown> | null;
  rank: number | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CapsuleHistoryExclusionRow = {
  capsule_id: string | null;
  period: string | null;
  post_id: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type CapsuleHistoryEditRow = {
  id: string | null;
  capsule_id: string | null;
  period: string | null;
  editor_id: string | null;
  change_type: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  created_at: string | null;
};

export type CapsuleTopicPageRow = {
  id: string | null;
  capsule_id: string | null;
  slug: string | null;
  title: string | null;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CapsuleTopicPageBacklinkRow = {
  id: string | null;
  topic_page_id: string | null;
  capsule_id: string | null;
  source_type: string | null;
  source_id: string | null;
  period: string | null;
  created_at: string | null;
};

export type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  storeBannerUrl: string | null;
  promoTileUrl: string | null;
  logoUrl: string | null;
  role: string | null;
  ownership: "owner" | "member" | "follower";
  membershipPolicy?: string | null;
};

export type DiscoverCapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  storeBannerUrl: string | null;
  promoTileUrl: string | null;
  logoUrl: string | null;
  createdAt: string | null;
  membershipPolicy?: string | null;
};

function resolveOwnership(capsule: CapsuleRow, viewerId?: string | null): "owner" | "member" {
  const ownerId = normalizeString(capsule?.created_by_id ?? null);
  const normalizedViewer = normalizeString(viewerId ?? null);
  if (ownerId && normalizedViewer && ownerId === normalizedViewer) return "owner";
  return "member";
}

export function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeHistoryPeriodValue(value: unknown): CapsuleHistoryPeriod | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  if (normalized === "weekly" || normalized === "monthly" || normalized === "all_time") {
    return normalized;
  }
  return null;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  value.forEach((entry) => {
    if (typeof entry === "string") {
      const normalized = entry.trim();
      if (normalized.length) {
        result.push(normalized);
      }
    }
  });
  return result;
}

const NAME_LIMIT = 80;
const SLUG_LIMIT = 50;
const SLUG_MAX_ATTEMPTS = 4;

function normalizeName(value: unknown): string {
  const normalized = normalizeString(value);
  if (!normalized) return "Untitled Capsule";
  if (normalized.length <= NAME_LIMIT) return normalized;
  return normalized.slice(0, NAME_LIMIT).trim();
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSlugCandidate(source: string, attempt: number): string | null {
  const base = slugify(source).slice(0, SLUG_LIMIT);
  if (!base) return null;
  if (attempt === 0) return base;
  const suffix =
    attempt === 1
      ? Math.random().toString(36).slice(-4)
      : `${attempt}-${Math.random().toString(36).slice(-3)}`;
  const candidate = `${base}-${suffix}`.slice(0, SLUG_LIMIT);
  return candidate.length ? candidate : null;
}

export function mapProfile(row: MemberProfileRow | null): CapsuleMemberProfile | null {
  if (!row) return null;
  const id = normalizeString(row.id);
  if (!id) return null;
  return {
    id,
    name: normalizeString(row.full_name),
    avatarUrl: normalizeString(row.avatar_url),
    userKey: normalizeString(row.user_key),
  };
}

export function mapMemberRow(
  row: CapsuleMemberDetailsRow,
  ownerId: string | null,
): CapsuleMemberSummary | null {
  const userId = normalizeString(row.user_id);
  if (!userId) return null;
  const profile = mapProfile(row.user);
  const baseRole = normalizeString(row.role);
  const isOwner = ownerId === userId || baseRole === "owner";
  return {
    userId,
    role: resolveMemberUiRole(baseRole, isOwner),
    joinedAt: normalizeString(row.joined_at),
    name: profile?.name ?? normalizeString(row.user?.full_name ?? null),
    avatarUrl: profile?.avatarUrl ?? normalizeString(row.user?.avatar_url ?? null),
    userKey: profile?.userKey ?? normalizeString(row.user?.user_key ?? null),
    isOwner,
  };
}

export function mapFollowerRow(row: CapsuleFollowerRow): CapsuleFollowerSummary | null {
  const userId = normalizeString(row.user_id);
  if (!userId) return null;
  const profile = mapProfile(row.user);
  return {
    userId,
    followedAt: normalizeString(row.created_at),
    name: profile?.name ?? normalizeString(row.user?.full_name ?? null),
    avatarUrl: profile?.avatarUrl ?? normalizeString(row.user?.avatar_url ?? null),
    userKey: profile?.userKey ?? normalizeString(row.user?.user_key ?? null),
  };
}

export function mapRequestRow(
  row: CapsuleMemberRequestRow,
): CapsuleMemberRequestSummary | null {
  const id = normalizeString(row.id);
  const capsuleId = normalizeString(row.capsule_id);
  const requesterId = normalizeString(row.requester_id);
  if (!id || !capsuleId || !requesterId) return null;
  const statusRaw = normalizeString(row.status);
  const status =
    statusRaw === "approved" ||
    statusRaw === "declined" ||
    statusRaw === "cancelled" ||
    statusRaw === "pending"
      ? statusRaw
      : "pending";
  const requesterProfile = mapProfile(row.requester);
  const initiatorProfile = mapProfile(row.initiator);
  const capsuleData = row.capsule ?? null;
  const originRaw = normalizeString(row.origin);
  const origin = originRaw === "owner_invite" ? "owner_invite" : "viewer_request";
  return {
    id,
    capsuleId,
    requesterId,
    responderId: normalizeString(row.responded_by),
    status,
    role: dbRoleToUiRole(row.role),
    message: normalizeString(row.message),
    createdAt: normalizeString(row.created_at),
    respondedAt: normalizeString(row.responded_at),
    approvedAt: normalizeString(row.approved_at),
    declinedAt: normalizeString(row.declined_at),
    cancelledAt: normalizeString(row.cancelled_at),
    requester: requesterProfile,
    initiatorId: normalizeString(row.initiator_id),
    initiator: initiatorProfile,
    origin,
    capsuleName: capsuleData ? normalizeName(capsuleData.name ?? null) : null,
    capsuleSlug: capsuleData ? normalizeString(capsuleData.slug ?? null) : null,
    capsuleLogoUrl: capsuleData ? normalizeString(capsuleData.logo_url ?? null) : null,
  };
}

function upsertSummary(
  map: Map<string, CapsuleSummary>,
  order: string[],
  capsule: CapsuleRow,
  meta: { role?: string | null; ownership: CapsuleSummary["ownership"] },
): void {
  const rawId = capsule?.id;
  if (!rawId) return;
  const id = String(rawId);
  const existing = map.get(id) ?? null;
  const resolvedOwnership = (() => {
    if (meta.ownership === "owner" || existing?.ownership === "owner") return "owner";
    if (meta.ownership === "member" || existing?.ownership === "member") return "member";
    return "follower";
  })();
  const sourceRole = meta.role ?? existing?.role ?? null;
  const normalizedSourceRole = normalizeString(sourceRole);
  const resolvedRole =
    resolvedOwnership === "owner"
      ? "founder"
      : resolvedOwnership === "member" && normalizedSourceRole
        ? dbRoleToUiRole(normalizedSourceRole) ?? normalizedSourceRole
        : null;

  const baseSummary: CapsuleSummary = {
    id,
    name: normalizeName(capsule?.name ?? null),
    slug: normalizeString(capsule?.slug ?? null),
    bannerUrl: normalizeString(capsule?.banner_url ?? null),
    storeBannerUrl: normalizeString(capsule?.store_banner_url ?? null),
    promoTileUrl: normalizeString(capsule?.promo_tile_url ?? null),
    logoUrl: normalizeString(capsule?.logo_url ?? null),
    role: resolvedRole,
    ownership: resolvedOwnership,
    membershipPolicy: normalizeString(capsule?.membership_policy ?? null),
  };

  if (!existing) {
    map.set(id, baseSummary);
    order.push(id);
    return;
  }

  map.set(id, {
    ...existing,
    ...baseSummary,
    role: baseSummary.role ?? existing.role,
    ownership: baseSummary.ownership,
  });
}

export async function listCapsulesForUser(userId: string): Promise<CapsuleSummary[]> {
  const summaries = new Map<string, CapsuleSummary>();
  const order: string[] = [];

  const membershipResult = await db
    .from("capsule_members")
    .select<CapsuleMemberRow>(
      "capsule_id, role, joined_at, capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url,membership_policy,created_by_id)",
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .fetch();

  if (membershipResult.error)
    throw decorateDatabaseError("capsules.memberships", membershipResult.error);

  for (const row of membershipResult.data ?? []) {
    if (!row?.capsule) continue;
    const ownership = row.capsule.created_by_id === userId ? "owner" : "member";
    upsertSummary(summaries, order, row.capsule, { role: row.role, ownership });
  }

  const ownedResult = await db
    .from("capsules")
    .select<CapsuleRow>(
      "id, name, slug, banner_url, store_banner_url, promo_tile_url, logo_url, membership_policy, created_by_id, created_at",
    )
    .eq("created_by_id", userId)
    .order("created_at", { ascending: true })
    .fetch();

  if (ownedResult.error) throw decorateDatabaseError("capsules.owned", ownedResult.error);

  for (const row of ownedResult.data ?? []) {
    if (!row) continue;
    upsertSummary(summaries, order, row, { ownership: "owner" });
  }

  const followersResult = await db
    .from("capsule_followers")
    .select<CapsuleFollowerRow>(
      "capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url,created_by_id), capsule_id, user_id, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .fetch();

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

async function fetchPostCapsuleMap(
  postClientIds: string[],
): Promise<Map<string, string | null>> {
  if (!postClientIds.length) return new Map();
  const uniqueIds = Array.from(
    new Set(postClientIds.map((id) => normalizeString(id)).filter(Boolean)),
  ) as string[];
  if (!uniqueIds.length) return new Map();

  const result = await db
    .from("posts")
    .select<PostCapsuleRow>("client_id, capsule_id")
    .in("client_id", uniqueIds)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.assets.postMap", result.error);
  }

  const map = new Map<string, string | null>();
  (result.data ?? []).forEach((row) => {
    const key = normalizeString(row?.client_id);
    if (!key) return;
    map.set(key, normalizeString(row?.capsule_id));
  });
  return map;
}

export async function listCapsuleAssets(params: {
  capsuleId: string;
  limit?: number;
  offset?: number;
  includeInternal?: boolean;
}): Promise<CapsuleAssetRow[]> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  if (!normalizedCapsuleId) return [];
  const limit =
    typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 500) : 200;
  const offset = Math.max(0, Math.trunc(params.offset ?? 0));
  const includeInternal = Boolean(params.includeInternal);

  let query = db
    .from("memories")
    .select<CapsuleAssetRow>(
      "id, owner_user_id, media_url, media_type, title, description, meta, created_at, post_id, kind, view_count, uploaded_by",
    )
    .eq("is_latest", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (includeInternal) {
    const attachmentCondition = `and(meta->>source.eq.post_attachment,or(meta->>capsule_id.eq.${normalizedCapsuleId},meta->>capsule_id.is.null))`;
    const directCondition = `meta->>capsule_id.eq.${normalizedCapsuleId}`;
    query = query.or(`${attachmentCondition},${directCondition}`);
  } else {
    query = query
      .filter("meta->>source", "eq", "post_attachment")
      .or(`meta->>capsule_id.eq.${normalizedCapsuleId},meta->>capsule_id.is.null`);
  }

  const result = await query.fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.assets.list", result.error);
  }

  const rows = result.data ?? [];
  const matched: CapsuleAssetRow[] = [];
  const orphanedPostIds: string[] = [];

  rows.forEach((row) => {
    const meta = (row?.meta ?? null) as Record<string, unknown> | null;
    const capsuleFromMeta = normalizeString(
      meta && typeof meta === "object"
        ? ((meta as { capsule_id?: unknown }).capsule_id as string | undefined)
        : null,
    );
    if (capsuleFromMeta) {
      if (capsuleFromMeta === normalizedCapsuleId) {
        matched.push(row);
      }
      return;
    }
    const postId = normalizeString(row?.post_id ?? null);
    if (postId) {
      orphanedPostIds.push(postId);
    }
  });

  if (orphanedPostIds.length) {
    const postMap = await fetchPostCapsuleMap(orphanedPostIds);
    rows.forEach((row) => {
      if (matched.includes(row)) return;
      const postId = normalizeString(row?.post_id ?? null);
      if (!postId) return;
      const target = normalizeString(postMap.get(postId) ?? null);
      if (target === normalizedCapsuleId) {
        matched.push(row);
      }
    });
  }

  return matched;
}

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

  const row = result.data ?? null;
  if (!row) return null;

  const suggestedSnapshot =
    row.suggested_snapshot && typeof row.suggested_snapshot === "object"
      ? (row.suggested_snapshot as Record<string, unknown>)
      : null;
  const suggestedGeneratedAt = normalizeString(row.suggested_generated_at);
  if (!suggestedSnapshot || !suggestedGeneratedAt) return null;

  const suggestedPeriodHashesRaw =
    row.suggested_period_hashes && typeof row.suggested_period_hashes === "object"
      ? (row.suggested_period_hashes as Record<string, unknown>)
      : {};
  const publishedPeriodHashesRaw =
    row.published_period_hashes && typeof row.published_period_hashes === "object"
      ? (row.published_period_hashes as Record<string, unknown>)
      : {};

  return {
    capsuleId: normalizedCapsuleId,
    suggestedGeneratedAt,
    suggestedLatestPostAt: normalizeString(row.suggested_latest_post_at),
    postCount: typeof row.post_count === "number" && Number.isFinite(row.post_count) ? row.post_count : 0,
    suggestedSnapshot,
    suggestedPeriodHashes: Object.fromEntries(
      Object.entries(suggestedPeriodHashesRaw).map(([key, value]) => [key, String(value ?? "")]),
    ),
    publishedSnapshot:
      row.published_snapshot && typeof row.published_snapshot === "object"
        ? (row.published_snapshot as Record<string, unknown>)
        : null,
    publishedGeneratedAt: normalizeString(row.published_generated_at),
    publishedLatestPostAt: normalizeString(row.published_latest_post_at),
    publishedPeriodHashes: Object.fromEntries(
      Object.entries(publishedPeriodHashesRaw).map(([key, value]) => [key, String(value ?? "")]),
    ),
    publishedEditorId: normalizeString(row.published_editor_id),
    publishedEditorReason: normalizeString(row.published_editor_reason),
    promptMemory:
      row.prompt_memory && typeof row.prompt_memory === "object"
        ? (row.prompt_memory as Record<string, unknown>)
        : {},
    templatePresets: Array.isArray(row.template_presets)
      ? (row.template_presets as Array<Record<string, unknown>>)
      : [],
    coverageMeta:
      row.coverage_meta && typeof row.coverage_meta === "object"
        ? (row.coverage_meta as Record<string, unknown>)
        : {},
    updatedAt: normalizeString(row.updated_at),
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
    throw decorateDatabaseError("capsules.historySections.settings.list", result.error);
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  return rows
    .map((row) => {
      const period = normalizeHistoryPeriodValue(row.period);
      if (!period) return null;
      return {
        capsuleId: normalizedCapsuleId,
        period,
        editorNotes: typeof row.editor_notes === "string" ? row.editor_notes : null,
        excludedPostIds: coerceStringArray(row.excluded_post_ids),
        templateId: normalizeString(row.template_id),
        toneRecipeId: normalizeString(row.tone_recipe_id),
        promptOverrides:
          row.prompt_overrides && typeof row.prompt_overrides === "object"
            ? (row.prompt_overrides as Record<string, unknown>)
            : {},
        coverageSnapshot:
          row.coverage_snapshot && typeof row.coverage_snapshot === "object"
            ? (row.coverage_snapshot as Record<string, unknown>)
            : {},
        discussionThreadId: normalizeString(row.discussion_thread_id),
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {},
        updatedAt: normalizeString(row.updated_at),
        updatedBy: normalizeString(row.updated_by),
      } satisfies CapsuleHistorySectionSettings;
    })
    .filter((entry): entry is CapsuleHistorySectionSettings => Boolean(entry));
}

export async function listCapsuleHistoryPins(capsuleId: string): Promise<CapsuleHistoryPin[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const result = await db
    .from("capsule_history_pins")
    .select<CapsuleHistoryPinRow>(
      "id, capsule_id, period, pin_type, post_id, quote, source, rank, created_by, created_at, updated_at",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .order("period", { ascending: true })
    .order("pin_type", { ascending: true })
    .order("rank", { ascending: true })
    .order("created_at", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.historyPins.list", result.error);
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  return rows
    .map((row) => {
      const id = normalizeString(row.id);
      const period = normalizeHistoryPeriodValue(row.period);
      const type = normalizeString(row.pin_type);
      if (!id || !period || !type) return null;
      const source =
        row.source && typeof row.source === "object"
          ? (row.source as Record<string, unknown>)
          : {};
      const rank =
        typeof row.rank === "number" && Number.isFinite(row.rank) ? Math.max(0, row.rank) : 0;

      return {
        id,
        capsuleId: normalizedCapsuleId,
        period,
        type,
        postId: normalizeString(row.post_id),
        quote: typeof row.quote === "string" ? row.quote : null,
        source,
        rank,
        createdBy: normalizeString(row.created_by),
        createdAt: normalizeString(row.created_at),
        updatedAt: normalizeString(row.updated_at),
      } satisfies CapsuleHistoryPin;
    })
    .filter((entry): entry is CapsuleHistoryPin => Boolean(entry));
}

export async function listCapsuleHistoryExclusions(
  capsuleId: string,
): Promise<CapsuleHistoryExclusion[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const result = await db
    .from("capsule_history_exclusions")
    .select<CapsuleHistoryExclusionRow>(
      "capsule_id, period, post_id, created_by, created_at",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.historyExclusions.list", result.error);
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  return rows
    .map((row) => {
      const period = normalizeHistoryPeriodValue(row.period);
      const postId = normalizeString(row.post_id);
      const createdBy = normalizeString(row.created_by);
      if (!period || !postId || !createdBy) return null;

      return {
        capsuleId: normalizedCapsuleId,
        period,
        postId,
        createdBy,
        createdAt: normalizeString(row.created_at),
      } satisfies CapsuleHistoryExclusion;
    })
    .filter((entry): entry is CapsuleHistoryExclusion => Boolean(entry));
}

export async function listCapsuleHistoryEdits(
  capsuleId: string,
  options: { limit?: number } = {},
): Promise<CapsuleHistoryEdit[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const limit = Math.max(1, Math.trunc(options.limit ?? 100));

  const result = await db
    .from("capsule_history_edits")
    .select<CapsuleHistoryEditRow>(
      "id, capsule_id, period, editor_id, change_type, reason, payload, snapshot, created_at",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.historyEdits.list", result.error);
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  return rows
    .map((row) => {
      const id = normalizeString(row.id);
      const period = normalizeHistoryPeriodValue(row.period);
      const editorId = normalizeString(row.editor_id);
      const changeType = normalizeString(row.change_type);
      if (!id || !period || !editorId || !changeType) return null;

      return {
        id,
        capsuleId: normalizedCapsuleId,
        period,
        editorId,
        changeType,
        reason: typeof row.reason === "string" ? row.reason : null,
        payload:
          row.payload && typeof row.payload === "object"
            ? (row.payload as Record<string, unknown>)
            : {},
        snapshot:
          row.snapshot && typeof row.snapshot === "object"
            ? (row.snapshot as Record<string, unknown>)
            : null,
        createdAt: normalizeString(row.created_at),
      } satisfies CapsuleHistoryEdit;
    })
    .filter((entry): entry is CapsuleHistoryEdit => Boolean(entry));
}

export async function listCapsuleTopicPages(
  capsuleId: string,
): Promise<CapsuleTopicPage[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const result = await db
    .from("capsule_topic_pages")
    .select<CapsuleTopicPageRow>(
      "id, capsule_id, slug, title, description, created_by, updated_by, created_at, updated_at",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .order("title", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.topicPages.list", result.error);
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  return rows
    .map((row) => {
      const id = normalizeString(row.id);
      const slug = normalizeString(row.slug);
      const title = normalizeString(row.title);
      if (!id || !slug || !title) return null;

      return {
        id,
        capsuleId: normalizedCapsuleId,
        slug,
        title,
        description: typeof row.description === "string" ? row.description : null,
        createdBy: normalizeString(row.created_by),
        updatedBy: normalizeString(row.updated_by),
        createdAt: normalizeString(row.created_at),
        updatedAt: normalizeString(row.updated_at),
      } satisfies CapsuleTopicPage;
    })
    .filter((entry): entry is CapsuleTopicPage => Boolean(entry));
}

export async function listCapsuleTopicPageBacklinks(
  capsuleId: string,
): Promise<CapsuleTopicPageBacklink[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const result = await db
    .from("capsule_topic_page_backlinks")
    .select<CapsuleTopicPageBacklinkRow>(
      "id, topic_page_id, capsule_id, source_type, source_id, period, created_at",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .order("created_at", { ascending: false })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.topicPages.backlinks.list", result.error);
  }

  const rows = Array.isArray(result.data) ? result.data : [];

  return rows
    .map((row) => {
      const id = normalizeString(row.id);
      const topicPageId = normalizeString(row.topic_page_id);
      const sourceType = normalizeString(row.source_type);
      const sourceId = normalizeString(row.source_id);
      if (!id || !topicPageId || !sourceType || !sourceId) return null;

      return {
        id,
        topicPageId,
        capsuleId: normalizedCapsuleId,
        sourceType,
        sourceId,
        period: normalizeString(row.period),
        createdAt: normalizeString(row.created_at),
      } satisfies CapsuleTopicPageBacklink;
    })
    .filter((entry): entry is CapsuleTopicPageBacklink => Boolean(entry));
}

export async function upsertCapsuleHistorySectionSettingsRecord(params: {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  editorNotes?: string | null;
  excludedPostIds?: string[];
  templateId?: string | null;
  toneRecipeId?: string | null;
  promptOverrides?: Record<string, unknown> | null;
  coverageSnapshot?: Record<string, unknown> | null;
  discussionThreadId?: string | null;
  metadata?: Record<string, unknown> | null;
  updatedBy: string;
}): Promise<CapsuleHistorySectionSettings> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const period = normalizeHistoryPeriodValue(params.period);
  const updaterId = normalizeString(params.updatedBy);
  if (!normalizedCapsuleId || !period || !updaterId) {
    throw new Error("capsules.history.sectionSettings.upsert: invalid parameters");
  }

  const payload = {
    capsule_id: normalizedCapsuleId,
    period,
    editor_notes: params.editorNotes ?? null,
    excluded_post_ids: params.excludedPostIds ?? [],
    template_id: normalizeString(params.templateId ?? null),
    tone_recipe_id: normalizeString(params.toneRecipeId ?? null),
    prompt_overrides: params.promptOverrides ?? {},
    coverage_snapshot: params.coverageSnapshot ?? {},
    discussion_thread_id: normalizeString(params.discussionThreadId ?? null),
    metadata: params.metadata ?? {},
    updated_by: updaterId,
    updated_at: new Date().toISOString(),
  };

  const result = await db
    .from("capsule_history_section_settings")
    .upsert(payload, { onConflict: "capsule_id,period" })
    .select<CapsuleHistorySectionSettingsRow>(
      "capsule_id, period, editor_notes, excluded_post_ids, template_id, tone_recipe_id, prompt_overrides, coverage_snapshot, discussion_thread_id, metadata, updated_at, updated_by",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .eq("period", period)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.sectionSettings.upsert", result.error);
  }

  const row = result.data;
  if (!row) {
    throw new Error("capsules.history.sectionSettings.upsert: upsert failed");
  }

  return {
    capsuleId: normalizedCapsuleId,
    period,
    editorNotes: typeof row.editor_notes === "string" ? row.editor_notes : null,
    excludedPostIds: coerceStringArray(row.excluded_post_ids),
    templateId: normalizeString(row.template_id),
    toneRecipeId: normalizeString(row.tone_recipe_id),
    promptOverrides: row.prompt_overrides ?? {},
    coverageSnapshot: row.coverage_snapshot ?? {},
    discussionThreadId: normalizeString(row.discussion_thread_id),
    metadata: row.metadata ?? {},
    updatedAt: normalizeString(row.updated_at),
    updatedBy: normalizeString(row.updated_by),
  };
}

export async function insertCapsuleHistoryEdit(params: {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  editorId: string;
  changeType: string;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
}): Promise<CapsuleHistoryEdit> {
  const capsuleId = normalizeString(params.capsuleId);
  const period = normalizeHistoryPeriodValue(params.period);
  const editorId = normalizeString(params.editorId);
  const changeType = normalizeString(params.changeType);
  if (!capsuleId || !period || !editorId || !changeType) {
    throw new Error("capsules.history.edits.insert: invalid parameters");
  }

  const result = await db
    .from("capsule_history_edits")
    .insert({
      capsule_id: capsuleId,
      period,
      editor_id: editorId,
      change_type: changeType,
      reason: params.reason ?? null,
      payload: params.payload ?? {},
      snapshot: params.snapshot ?? null,
    })
    .select<CapsuleHistoryEditRow>("id, capsule_id, period, editor_id, change_type, reason, payload, snapshot, created_at")
    .single();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.edits.insert", result.error);
  }

  const row = result.data;
  if (!row) {
    throw new Error("capsules.history.edits.insert: insert failed");
  }
  return {
    id: row.id ?? "",
    capsuleId,
    period,
    editorId,
    changeType,
    reason: typeof row.reason === "string" ? row.reason : null,
    payload: row.payload ?? {},
    snapshot: row.snapshot ?? null,
    createdAt: normalizeString(row.created_at),
  };
}

export async function insertCapsuleHistoryPin(params: {
  capsuleId: string;
  period: CapsuleHistoryPeriod;
  type: string;
  postId?: string | null;
  quote?: string | null;
  source?: Record<string, unknown> | null;
  rank?: number | null;
  createdBy: string;
}): Promise<CapsuleHistoryPin> {
  const capsuleId = normalizeString(params.capsuleId);
  const period = normalizeHistoryPeriodValue(params.period);
  const type = normalizeString(params.type);
  const createdBy = normalizeString(params.createdBy);
  if (!capsuleId || !period || !type || !createdBy) {
    throw new Error("capsules.history.pins.insert: invalid parameters");
  }

  const payload = {
    capsule_id: capsuleId,
    period,
    pin_type: type,
    post_id: normalizeString(params.postId ?? null),
    quote: typeof params.quote === "string" ? params.quote : null,
    source: params.source ?? {},
    rank:
      typeof params.rank === "number" && Number.isFinite(params.rank)
        ? Math.max(0, Math.trunc(params.rank))
        : 0,
    created_by: createdBy,
  };

  const result = await db
    .from("capsule_history_pins")
    .insert(payload)
    .select<CapsuleHistoryPinRow>(
      "id, capsule_id, period, pin_type, post_id, quote, source, rank, created_by, created_at, updated_at",
    )
    .single();

  if (result.error) {
    throw decorateDatabaseError("capsules.history.pins.insert", result.error);
  }

  const row = result.data;
  if (!row) {
    throw new Error("capsules.history.pins.insert: insert failed");
  }
  return {
    id: row.id ?? "",
    capsuleId,
    period,
    type,
    postId: normalizeString(row.post_id),
    quote: typeof row.quote === "string" ? row.quote : null,
    source: row.source ?? {},
    rank: typeof row.rank === "number" ? row.rank : 0,
    createdBy,
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  };
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
