import { decorateDatabaseError } from "@/lib/database/utils";
import type {
  CapsuleFollowerSummary,
  CapsuleMemberRequestSummary,
  CapsuleMemberSummary,
} from "@/types/capsules";
import { invalidateQuickSearchCache } from "@/server/search/quick";
import {
  db,
  mapFollowerRow,
  mapMemberRow,
  mapRequestRow,
  normalizeString,
  type CapsuleFollowerRow,
  type CapsuleMemberDetailsRow,
  type CapsuleMemberRecord,
  type CapsuleMemberRequestRow,
} from "./core";
import {
  isCapsuleMemberUiRole,
  uiRoleToDbRole,
  type CapsuleMemberDbRole,
} from "../roles";

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
      "id, capsule_id, requester_id, status, role, message, origin, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key), initiator_id, initiator:initiator_id(id, full_name, avatar_url, user_key), capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url)",
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

export async function listCapsuleInvites(
  capsuleId: string,
): Promise<CapsuleMemberRequestSummary[]> {
  const normalizedId = normalizeString(capsuleId);
  if (!normalizedId) return [];
  const result = await db
    .from("capsule_member_requests")
    .select<CapsuleMemberRequestRow>(
      "id, capsule_id, requester_id, status, role, message, origin, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key), initiator_id, initiator:initiator_id(id, full_name, avatar_url, user_key), capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url)",
    )
    .eq("capsule_id", normalizedId)
    .eq("origin", "owner_invite")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.memberInvites.list", result.error);
  }

  return (result.data ?? [])
    .map((row) => mapRequestRow(row))
    .filter((entry): entry is CapsuleMemberRequestSummary => entry !== null);
}

export async function listViewerCapsuleInvites(
  viewerId: string,
): Promise<CapsuleMemberRequestSummary[]> {
  const normalizedViewerId = normalizeString(viewerId);
  if (!normalizedViewerId) return [];

  const result = await db
    .from("capsule_member_requests")
    .select<CapsuleMemberRequestRow>(
      "id, capsule_id, requester_id, status, role, message, origin, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key), initiator_id, initiator:initiator_id(id, full_name, avatar_url, user_key), capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url)",
    )
    .eq("requester_id", normalizedViewerId)
    .eq("origin", "owner_invite")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.memberInvites.viewerList", result.error);
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
      "id, capsule_id, requester_id, status, role, message, origin, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key), initiator_id, initiator:initiator_id(id, full_name, avatar_url, user_key), capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url)",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .eq("requester_id", normalizedRequesterId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.memberRequests.get", result.error);
  }

  const mapped = result.data ? mapRequestRow(result.data) : null;
  return mapped ?? null;
}

export async function getCapsuleMemberRequestById(
  requestId: string,
): Promise<CapsuleMemberRequestSummary | null> {
  const normalizedRequestId = normalizeString(requestId);
  if (!normalizedRequestId) return null;

  const result = await db
    .from("capsule_member_requests")
    .select<CapsuleMemberRequestRow>(
      "id, capsule_id, requester_id, status, role, message, origin, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key), initiator_id, initiator:initiator_id(id, full_name, avatar_url, user_key), capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url)",
    )
    .eq("id", normalizedRequestId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.memberRequests.getById", result.error);
  }

  const mapped = result.data ? mapRequestRow(result.data) : null;
  return mapped ?? null;
}

export async function upsertCapsuleMemberRequest(
  capsuleId: string,
  requesterId: string,
  params: {
    role?: string | null;
    message?: string | null;
    origin?: CapsuleMemberRequestSummary["origin"];
    initiatorId?: string | null;
  } = {},
): Promise<CapsuleMemberRequestSummary> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedRequesterId = normalizeString(requesterId);
  if (!normalizedCapsuleId || !normalizedRequesterId) {
    throw new Error("capsules.memberRequests.upsert: capsuleId and requesterId are required");
  }

  const normalizedRoleInput = normalizeString(params.role ?? null);
  let roleValue: CapsuleMemberDbRole = "member";
  if (normalizedRoleInput) {
    const lowerRole = normalizedRoleInput.toLowerCase();
    if (isCapsuleMemberUiRole(lowerRole)) {
      roleValue = uiRoleToDbRole(lowerRole);
    } else if (
      lowerRole === "owner" ||
      lowerRole === "admin" ||
      lowerRole === "moderator" ||
      lowerRole === "member" ||
      lowerRole === "guest"
    ) {
      roleValue = lowerRole as CapsuleMemberDbRole;
    }
  }

  const now = new Date().toISOString();
  const origin: CapsuleMemberRequestSummary["origin"] =
    params.origin === "owner_invite" ? "owner_invite" : "viewer_request";
  const providedInitiator = normalizeString(params.initiatorId);
  const initiatorId =
    providedInitiator ?? (origin === "viewer_request" ? normalizedRequesterId : null);
  const payload = {
    capsule_id: normalizedCapsuleId,
    requester_id: normalizedRequesterId,
    status: "pending",
    role: roleValue,
    message: params.message ?? null,
    origin,
    initiator_id: initiatorId ?? normalizedRequesterId,
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
      "id, capsule_id, requester_id, status, role, message, origin, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key), initiator_id, initiator:initiator_id(id, full_name, avatar_url, user_key), capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url)",
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

export async function setCapsuleMemberRequestStatus(params: {
  capsuleId: string;
  requestId: string;
  status: CapsuleMemberRequestSummary["status"];
  responderId?: string | null;
}): Promise<CapsuleMemberRequestSummary | null> {
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
      "id, capsule_id, requester_id, status, role, message, origin, responded_by, created_at, responded_at, approved_at, declined_at, cancelled_at, requester:requester_id(id, full_name, avatar_url, user_key), initiator_id, initiator:initiator_id(id, full_name, avatar_url, user_key), capsule:capsule_id!inner(id,name,slug,banner_url,store_banner_url,promo_tile_url,logo_url)",
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
    .select<CapsuleMemberRecord>("capsule_id")
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.members.delete", result.error);
  }

  const removed = (result.data ?? []).length > 0;
  if (removed) {
    invalidateQuickSearchCache(normalizedMemberId);
  }
  return removed;
}

export async function listCapsuleFollowers(
  capsuleId: string,
): Promise<CapsuleFollowerSummary[]> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  if (!normalizedCapsuleId) return [];

  const result = await db
    .from("capsule_followers")
    .select<CapsuleFollowerRow>(
      "capsule_id, user_id, created_at, user:user_id(id, full_name, avatar_url, user_key)",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .order("created_at", { ascending: true })
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.followers.list", result.error);
  }

  return (result.data ?? [])
    .map((row) => mapFollowerRow(row))
    .filter((entry): entry is CapsuleFollowerSummary => entry !== null);
}

export async function getCapsuleFollowerRecord(
  capsuleId: string,
  userId: string,
): Promise<CapsuleFollowerRow | null> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedUserId = normalizeString(userId);
  if (!normalizedCapsuleId || !normalizedUserId) return null;

  const result = await db
    .from("capsule_followers")
    .select<CapsuleFollowerRow>(
      "capsule_id, user_id, created_at, user:user_id(id, full_name, avatar_url, user_key)",
    )
    .eq("capsule_id", normalizedCapsuleId)
    .eq("user_id", normalizedUserId)
    .maybeSingle();

  if (result.error) {
    throw decorateDatabaseError("capsules.followers.get", result.error);
  }

  return result.data ?? null;
}

export async function upsertCapsuleFollower(params: {
  capsuleId: string;
  userId: string;
}): Promise<void> {
  const normalizedCapsuleId = normalizeString(params.capsuleId);
  const normalizedUserId = normalizeString(params.userId);
  if (!normalizedCapsuleId || !normalizedUserId) {
    throw new Error("capsules.followers.upsert: capsuleId and userId are required");
  }

  const result = await db
    .from("capsule_followers")
    .upsert(
      {
        capsule_id: normalizedCapsuleId,
        user_id: normalizedUserId,
      },
      { onConflict: "capsule_id,user_id" },
    )
    .select("id")
    .maybeSingle();

  if (result?.error) {
    throw decorateDatabaseError("capsules.followers.upsert", result.error);
  }

  invalidateQuickSearchCache(normalizedUserId);
}

export async function deleteCapsuleFollower(
  capsuleId: string,
  userId: string,
): Promise<boolean> {
  const normalizedCapsuleId = normalizeString(capsuleId);
  const normalizedUserId = normalizeString(userId);
  if (!normalizedCapsuleId || !normalizedUserId) return false;

  const result = await db
    .from("capsule_followers")
    .delete({ count: "exact" })
    .eq("capsule_id", normalizedCapsuleId)
    .eq("user_id", normalizedUserId)
    .select("id")
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.followers.delete", result.error);
  }
  const removed = (result.data ?? []).length > 0;
  if (removed) {
    invalidateQuickSearchCache(normalizedUserId);
  }
  return removed;
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

  invalidateQuickSearchCache(normalizedUserId);
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

  const updated = Boolean(result.data?.user_id);
  if (updated) {
    invalidateQuickSearchCache(normalizedMemberId);
  }
  return updated;
}
