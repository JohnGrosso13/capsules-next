import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError } from "@/lib/database/utils";
import type { DatabaseError } from "@/ports/database";
import type {
  CapsuleMemberProfile,
  CapsuleMemberRequestSummary,
  CapsuleMemberSummary,
} from "@/types/capsules";

const db = getDatabaseAdminClient();

type CapsuleRow = {
  id: string | null;
  name: string | null;
  slug: string | null;
  banner_url: string | null;
  logo_url: string | null;
  created_by_id: string | null;
  created_at?: string | null;
};

type CapsuleMemberRow = {
  capsule_id: string | null;
  role: string | null;
  joined_at: string | null;
  capsule: CapsuleRow | null;
};

type MemberProfileRow = {
  id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  user_key: string | null;
};

type CapsuleMemberRecord = {
  capsule_id: string | null;
  user_id: string | null;
  role: string | null;
  joined_at: string | null;
};

type CapsuleMemberDetailsRow = {
  capsule_id: string | null;
  user_id: string | null;
  role: string | null;
  joined_at: string | null;
  user: MemberProfileRow | null;
};

type CapsuleMemberRequestRow = {
  id: string | null;
  capsule_id: string | null;
  requester_id: string | null;
  status: string | null;
  role: string | null;
  message: string | null;
  responded_by: string | null;
  created_at: string | null;
  responded_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  requester: MemberProfileRow | null;
};

export type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  role: string | null;
  ownership: "owner" | "member";
};

export type DiscoverCapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  createdAt: string | null;
};

function resolveOwnership(
  capsule: CapsuleRow,
  viewerId?: string | null,
): "owner" | "member" {
  const ownerId = normalizeString(capsule?.created_by_id ?? null);
  const normalizedViewer = normalizeString(viewerId ?? null);
  if (ownerId && normalizedViewer && ownerId === normalizedViewer) return "owner";
  return "member";
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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

function mapProfile(row: MemberProfileRow | null): CapsuleMemberProfile | null {
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

function mapMemberRow(row: CapsuleMemberDetailsRow, ownerId: string | null): CapsuleMemberSummary | null {
  const userId = normalizeString(row.user_id);
  if (!userId) return null;
  const profile = mapProfile(row.user);
  const baseRole = normalizeString(row.role);
  return {
    userId,
    role: baseRole,
    joinedAt: normalizeString(row.joined_at),
    name: profile?.name ?? normalizeString(row.user?.full_name ?? null),
    avatarUrl: profile?.avatarUrl ?? normalizeString(row.user?.avatar_url ?? null),
    userKey: profile?.userKey ?? normalizeString(row.user?.user_key ?? null),
    isOwner: ownerId === userId || baseRole === "owner",
  };
}

function mapRequestRow(row: CapsuleMemberRequestRow): CapsuleMemberRequestSummary | null {
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
  return {
    id,
    capsuleId,
    requesterId,
    responderId: normalizeString(row.responded_by),
    status,
    role: normalizeString(row.role),
    message: normalizeString(row.message),
    createdAt: normalizeString(row.created_at),
    respondedAt: normalizeString(row.responded_at),
    approvedAt: normalizeString(row.approved_at),
    declinedAt: normalizeString(row.declined_at),
    cancelledAt: normalizeString(row.cancelled_at),
    requester: requesterProfile,
  };
}

function upsertSummary(
  map: Map<string, CapsuleSummary>,
  order: string[],
  capsule: CapsuleRow,
  meta: { role?: string | null; ownership: "owner" | "member" },
): void {
  const rawId = capsule?.id;
  if (!rawId) return;
  const id = String(rawId);
  const existing = map.get(id) ?? null;

  const baseSummary: CapsuleSummary = {
    id,
    name: normalizeName(capsule?.name ?? null),
    slug: normalizeString(capsule?.slug ?? null),
    bannerUrl: normalizeString(capsule?.banner_url ?? null),
    logoUrl: normalizeString(capsule?.logo_url ?? null),
    role: normalizeString(meta.role ?? existing?.role ?? null),
    ownership:
      meta.ownership === "owner" || existing?.ownership === "owner" ? "owner" : "member",
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
      "capsule_id, role, joined_at, capsule:capsule_id!inner(id,name,slug,banner_url,logo_url,created_by_id)",
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
    .select<CapsuleRow>("id, name, slug, banner_url, logo_url, created_by_id, created_at")
    .eq("created_by_id", userId)
    .order("created_at", { ascending: true })
    .fetch();

  if (ownedResult.error) throw decorateDatabaseError("capsules.owned", ownedResult.error);

  for (const row of ownedResult.data ?? []) {
    if (!row) continue;
    upsertSummary(summaries, order, row, { ownership: "owner" });
  }

  return order
    .map((id) => summaries.get(id) ?? null)
    .filter((entry): entry is CapsuleSummary => entry !== null);
}

export async function listRecentPublicCapsules(options: {
  excludeCreatorId?: string | null;
  limit?: number;
} = {}): Promise<DiscoverCapsuleSummary[]> {
  const normalizedExclude = normalizeString(options.excludeCreatorId ?? null);
  const requestedLimit = typeof options.limit === "number" ? Math.floor(options.limit) : 16;
  const normalizedLimit = Math.min(Math.max(requestedLimit, 1), 48);
  const queryLimit = normalizedExclude ? Math.min(normalizedLimit * 2, 64) : normalizedLimit;

  let query = db
    .from("capsules")
    .select<CapsuleRow>("id, name, slug, banner_url, logo_url, created_by_id, created_at")
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
      logoUrl: normalizeString(row?.logo_url ?? null),
      createdAt: normalizeString(row?.created_at ?? null),
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
    logoUrl: normalizeString(capsule.logo_url),
    role: null,
    ownership: resolveOwnership(capsule, viewerId),
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
    logoUrl: normalizeString(row.logo_url),
    role: role ?? null,
    ownership: "owner",
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
      .select<CapsuleRow>("id, name, slug, banner_url, logo_url, created_by_id")
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
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.updateBanner", result.error);
  }

  return Boolean(result.data?.id);
}

export async function findCapsuleById(capsuleId: string): Promise<CapsuleRow | null> {
  const normalizedId = normalizeString(capsuleId);
  if (!normalizedId) return null;

  const result = await db
    .from("capsules")
    .select<CapsuleRow>("id, name, slug, banner_url, logo_url, created_by_id, created_at")
    .eq("id", normalizedId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.findById", result.error);
  }

  return result.data ?? null;
}

export async function getCapsuleMemberRecord(
  capsuleId: string,
  userId: string,
): Promise<CapsuleMemberRecord | null> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedUserId = normalizeString(userId);
  if (!normalizedCapsuleId || !normalizedUserId) return null;

  const result = await db
    .from("capsule_members")
    .select<CapsuleMemberRecord>("capsule_id, user_id, role, joined_at")
    .eq("capsule_id", normalizedCapsuleId)
    .eq("user_id", normalizedUserId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.members.get", result.error);
  }

  return result.data ?? null;
}

export async function listCapsuleMembers(
  capsuleId: string,
  ownerId?: string | null,
): Promise<CapsuleMemberSummary[]> {
  const normalizedId = normalizeString(capsuleId);
  if (!normalizedId) return [];

  const result = await db
    .from("capsule_members")
    .select<CapsuleMemberDetailsRow>(
      "capsule_id, user_id, role, joined_at, user:user_id(id, full_name, avatar_url, user_key)",
    )
    .eq("capsule_id", normalizedId)
    .order("joined_at", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.members.list", result.error);
  }

  const normalizedOwnerId = normalizeString(ownerId ?? null);
  return (result.data ?? [])
    .map((row) => mapMemberRow(row, normalizedOwnerId))
    .filter((member): member is CapsuleMemberSummary => member !== null);
}

export async function listCapsuleMemberRequests(
  capsuleId: string,
  status: CapsuleMemberRequestSummary["status"] | null = null,
): Promise<CapsuleMemberRequestSummary[]> {
  const normalizedId = normalizeString(capsuleId);
  if (!normalizedId) return [];

  let query = db
    .from("capsule_member_requests")
    .select<CapsuleMemberRequestRow>(
      "id, capsule_id, requester_id, status, role, message, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key)",
    )
    .eq("capsule_id", normalizedId);

  if (status) {
    query = query.eq("status", status);
  }

  query = query.order("created_at", { ascending: true });

  const result = await query.fetch();
  if (result.error) {
    throw decorateDatabaseError("capsules.memberRequests.list", result.error);
  }

  return (result.data ?? [])
    .map((row) => mapRequestRow(row))
    .filter((entry): entry is CapsuleMemberRequestSummary => entry !== null);
}

export async function getCapsuleMemberRequest(
  capsuleId: string,
  requesterId: string,
): Promise<CapsuleMemberRequestSummary | null> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedRequesterId = normalizeString(requesterId);
  if (!normalizedCapsuleId || !normalizedRequesterId) return null;

  const result = await db
    .from("capsule_member_requests")
    .select<CapsuleMemberRequestRow>(
      "id, capsule_id, requester_id, status, role, message, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key)",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .eq("requester_id", normalizedRequesterId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.memberRequests.get", result.error);
  }

  const mapped = result.data ? mapRequestRow(result.data) : null;
  return mapped ?? null;
}

export async function upsertCapsuleMemberRequest(
  capsuleId: string,
  requesterId: string,
  params: { role?: string | null; message?: string | null } = {},
): Promise<CapsuleMemberRequestSummary> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedRequesterId = normalizeString(requesterId);
  if (!normalizedCapsuleId || !normalizedRequesterId) {
    throw new Error("capsules.memberRequests.upsert: capsuleId and requesterId are required");
  }

  const now = new Date().toISOString();
  const payload = {
    capsule_id: normalizedCapsuleId,
    requester_id: normalizedRequesterId,
    status: "pending",
    role: params.role ?? "member",
    message: params.message ?? null,
    responded_by: null,
    responded_at: null,
    approved_at: null,
    declined_at: null,
    cancelled_at: null,
    created_at: now,
    updated_at: now,
  };

  const result = await db
    .from("capsule_member_requests")
    .upsert(payload, { onConflict: "capsule_id,requester_id" })
    .select<CapsuleMemberRequestRow>(
      "id, capsule_id, requester_id, status, role, message, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key)",
    )
    .single();

  if (result.error) {
    throw decorateDatabaseError("capsules.memberRequests.upsert", result.error);
  }

  const record = result.data;
  if (!record) {
    throw new Error("capsules.memberRequests.upsert: missing request data");
  }
  const mapped = mapRequestRow(record);
  if (!mapped) {
    throw new Error("capsules.memberRequests.upsert: failed to normalize request");
  }
  return mapped;
}

export async function setCapsuleMemberRequestStatus(
  params: {
    capsuleId: string;
    requestId: string;
    status: CapsuleMemberRequestSummary["status"];
    responderId?: string | null;
  },
): Promise<CapsuleMemberRequestSummary | null> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedRequestId = normalizeString(params.requestId);
  if (!normalizedCapsuleId || !normalizedRequestId) return null;

  const now = new Date().toISOString();
  const status = params.status;
  const updates: Record<string, unknown> = {
    status,
    responded_by: params.responderId ?? null,
    responded_at: now,
    approved_at: status === "approved" ? now : null,
    declined_at: status === "declined" ? now : null,
    cancelled_at: status === "cancelled" ? now : null,
    updated_at: now,
  };

  const result = await db
    .from("capsule_member_requests")
    .update(updates)
    .eq("id", normalizedRequestId)
    .eq("capsule_id", normalizedCapsuleId)
    .eq("status", "pending")
    .select<CapsuleMemberRequestRow>(
      "id, capsule_id, requester_id, status, role, message, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key)",
    )
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.memberRequests.setStatus", result.error);
  }

  const mapped = result.data ? mapRequestRow(result.data) : null;
  return mapped ?? null;
}

export async function deleteCapsuleMember(
  capsuleId: string,
  memberId: string,
): Promise<boolean> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedMemberId = normalizeString(memberId);
  if (!normalizedCapsuleId || !normalizedMemberId) return false;

  const result = await db
    .from("capsule_members")
    .delete({ count: "exact" })
    .eq("capsule_id", normalizedCapsuleId)
    .eq("user_id", normalizedMemberId)
    .select("user_id")
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.members.delete", result.error);
  }

  return (result.data ?? []).length > 0;
}

export async function upsertCapsuleMember(params: {
  capsuleId: string;
  userId: string;
  role?: string | null;
}): Promise<void> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedUserId = normalizeString(params.userId);
  if (!normalizedCapsuleId || !normalizedUserId) {
    throw new Error("capsules.members.upsert: capsuleId and userId are required");
  }

  const result = await db
    .from("capsule_members")
    .upsert(
      {
        capsule_id: normalizedCapsuleId,
        user_id: normalizedUserId,
        role: params.role ?? "member",
      },
      { onConflict: "capsule_id,user_id" },
    )
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.members.upsert", result.error);
  }
}

export async function updateCapsuleMemberRole(params: {
  capsuleId: string;
  memberId: string;
  role: string;
}): Promise<boolean> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedMemberId = normalizeString(params.memberId);
  const normalizedRoleSource = normalizeString(params.role);
  const normalizedRole = normalizedRoleSource ? normalizedRoleSource.toLowerCase() : null;
  if (!normalizedCapsuleId || !normalizedMemberId || !normalizedRole) {
    return false;
  }

  const result = await db
    .from("capsule_members")
    .update({ role: normalizedRole })
    .eq("capsule_id", normalizedCapsuleId)
    .eq("user_id", normalizedMemberId)
    .select<CapsuleMemberRecord>("user_id")
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.members.updateRole", result.error);
  }

  return Boolean(result.data?.user_id);
}
