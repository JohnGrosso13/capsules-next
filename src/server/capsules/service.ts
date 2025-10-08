import type {
  CapsuleMemberRequestSummary,
  CapsuleMembershipState,
  CapsuleMembershipViewer,
} from "@/types/capsules";
import {
  createCapsuleForUser,
  deleteCapsuleMember as deleteCapsuleMemberRecord,
  deleteCapsuleOwnedByUser,
  findCapsuleById,
  getCapsuleMemberRecord,
  getCapsuleMemberRequest,
  listCapsuleMemberRequests,
  listCapsuleMembers,
  setCapsuleMemberRequestStatus,
  upsertCapsuleMember,
  upsertCapsuleMemberRequest,
  listCapsulesForUser,
  listRecentPublicCapsules,
  getCapsuleSummaryForViewer as repoGetCapsuleSummaryForViewer,
  type CapsuleSummary,
  type DiscoverCapsuleSummary,
} from "./repository";

export type { CapsuleSummary, DiscoverCapsuleSummary } from "./repository";
export type {
  CapsuleMemberSummary,
  CapsuleMemberRequestSummary,
  CapsuleMembershipViewer,
  CapsuleMembershipState,
} from "@/types/capsules";

const REQUEST_MESSAGE_MAX_LENGTH = 500;

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeRequestMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  return trimmed.slice(0, REQUEST_MESSAGE_MAX_LENGTH);
}

export class CapsuleMembershipError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict" | "invalid",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function requireCapsule(capsuleId: string) {
  const capsule = await findCapsuleById(capsuleId);
  if (!capsule?.id) {
    throw new CapsuleMembershipError("not_found", "Capsule not found.", 404);
  }
  const ownerId = normalizeId(capsule.created_by_id);
  if (!ownerId) {
    throw new Error("capsules.membership: capsule missing owner identifier");
  }
  return { capsule, ownerId };
}

async function requireCapsuleOwnership(capsuleId: string, ownerId: string) {
  const normalizedOwnerId = normalizeId(ownerId);
  if (!normalizedOwnerId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsule(capsuleId);
  if (capsuleOwnerId !== normalizedOwnerId) {
    throw new CapsuleMembershipError("forbidden", "You do not have permission to manage this capsule.", 403);
  }
  return { capsule, ownerId: capsuleOwnerId };
}

export type CapsuleGatePayload = {
  capsules: CapsuleSummary[];
  defaultCapsuleId: string | null;
};

export async function resolveCapsuleGate(
  supabaseUserId: string | null | undefined,
): Promise<CapsuleGatePayload> {
  if (!supabaseUserId) {
    return { capsules: [], defaultCapsuleId: null };
  }

  const capsules = await listCapsulesForUser(supabaseUserId);
  const defaultCapsuleId = capsules.length === 1 ? capsules[0].id : null;

  return { capsules, defaultCapsuleId };
}

export async function getUserCapsules(
  supabaseUserId: string | null | undefined,
): Promise<CapsuleSummary[]> {
  if (!supabaseUserId) return [];
  return listCapsulesForUser(supabaseUserId);
}

export async function getRecentCapsules(options: {
  viewerId?: string | null | undefined;
  limit?: number;
} = {}): Promise<DiscoverCapsuleSummary[]> {
  const normalizedViewer = normalizeId(options.viewerId ?? null);
  return listRecentPublicCapsules({
    excludeCreatorId: normalizedViewer,
    limit: options.limit,
  });
}

export async function getCapsuleSummaryForViewer(
  capsuleId: string,
  viewerId?: string | null | undefined,
): Promise<CapsuleSummary | null> {
  return repoGetCapsuleSummaryForViewer(capsuleId, viewerId ?? null);
}

export async function createCapsule(
  ownerId: string,
  params: { name: string },
): Promise<CapsuleSummary> {
  return createCapsuleForUser(ownerId, params);
}

export async function deleteCapsule(
  ownerId: string,
  capsuleId: string,
): Promise<boolean> {
  return deleteCapsuleOwnedByUser(ownerId, capsuleId);
}

export async function getCapsuleMembership(
  capsuleId: string,
  viewerId: string | null | undefined,
): Promise<CapsuleMembershipState> {
  const { capsule, ownerId } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership: capsule has invalid identifier");
  }

  const normalizedViewerId = normalizeId(viewerId ?? null);
  const isOwner = normalizedViewerId === ownerId;

  let membershipRecord = null;
  if (normalizedViewerId && !isOwner) {
    membershipRecord = await getCapsuleMemberRecord(capsuleIdValue, normalizedViewerId);
  }

  let viewerRequest: CapsuleMemberRequestSummary | null = null;
  if (normalizedViewerId && !isOwner && !membershipRecord) {
    viewerRequest = await getCapsuleMemberRequest(capsuleIdValue, normalizedViewerId);
  }

  const members = await listCapsuleMembers(capsuleIdValue, ownerId);
  const requests = isOwner
    ? await listCapsuleMemberRequests(capsuleIdValue, "pending")
    : [];

  const pendingCount = isOwner
    ? requests.length
    : viewerRequest?.status === "pending"
      ? 1
      : 0;

  const viewer: CapsuleMembershipViewer = {
    userId: normalizedViewerId,
    isOwner,
    isMember: isOwner || Boolean(membershipRecord),
    canManage: isOwner,
    canRequest:
      Boolean(normalizedViewerId) &&
      !isOwner &&
      !membershipRecord &&
      viewerRequest?.status !== "pending",
    role: isOwner ? "owner" : normalizeOptionalString(membershipRecord?.role ?? null),
    memberSince: membershipRecord?.joined_at ?? null,
    requestStatus: viewerRequest?.status ?? "none",
    requestId: viewerRequest?.id ?? null,
  };

  return {
    capsule: {
      id: capsuleIdValue,
      name: normalizeOptionalString(capsule.name ?? null),
      slug: normalizeOptionalString(capsule.slug ?? null),
      ownerId,
    },
    viewer,
    counts: {
      members: members.length,
      pendingRequests: pendingCount,
    },
    members,
    requests,
    viewerRequest,
  };
}

export async function requestCapsuleMembership(
  userId: string,
  capsuleId: string,
  params: { message?: string } = {},
): Promise<CapsuleMembershipState> {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }

  const { capsule, ownerId } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.request: capsule has invalid identifier");
  }

  if (ownerId === normalizedUserId) {
    throw new CapsuleMembershipError("conflict", "You already own this capsule.", 409);
  }

  const membership = await getCapsuleMemberRecord(capsuleIdValue, normalizedUserId);
  if (membership) {
    throw new CapsuleMembershipError("conflict", "You are already a member of this capsule.", 409);
  }

  const message = normalizeRequestMessage(params.message ?? null);
  await upsertCapsuleMemberRequest(capsuleIdValue, normalizedUserId, { message });

  return getCapsuleMembership(capsuleIdValue, normalizedUserId);
}

export async function approveCapsuleMemberRequest(
  ownerId: string,
  capsuleId: string,
  requestId: string,
): Promise<CapsuleMembershipState> {
  const normalizedRequestId = normalizeId(requestId);
  if (!normalizedRequestId) {
    throw new CapsuleMembershipError("invalid", "A valid request id is required.", 400);
  }

  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.approve: capsule has invalid identifier");
  }

  const updated = await setCapsuleMemberRequestStatus({
    capsuleId: capsuleIdValue,
    requestId: normalizedRequestId,
    status: "approved",
    responderId: capsuleOwnerId,
  });

  if (!updated) {
    throw new CapsuleMembershipError(
      "not_found",
      "Pending membership request not found or already processed.",
      404,
    );
  }

  await upsertCapsuleMember({
    capsuleId: capsuleIdValue,
    userId: updated.requesterId,
    role: updated.role ?? "member",
  });

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId);
}

export async function declineCapsuleMemberRequest(
  ownerId: string,
  capsuleId: string,
  requestId: string,
): Promise<CapsuleMembershipState> {
  const normalizedRequestId = normalizeId(requestId);
  if (!normalizedRequestId) {
    throw new CapsuleMembershipError("invalid", "A valid request id is required.", 400);
  }

  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.decline: capsule has invalid identifier");
  }

  const updated = await setCapsuleMemberRequestStatus({
    capsuleId: capsuleIdValue,
    requestId: normalizedRequestId,
    status: "declined",
    responderId: capsuleOwnerId,
  });

  if (!updated) {
    throw new CapsuleMembershipError(
      "not_found",
      "Pending membership request not found or already processed.",
      404,
    );
  }

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId);
}

export async function removeCapsuleMember(
  ownerId: string,
  capsuleId: string,
  memberId: string,
): Promise<CapsuleMembershipState> {
  const normalizedMemberId = normalizeId(memberId);
  if (!normalizedMemberId) {
    throw new CapsuleMembershipError("invalid", "A valid member id is required.", 400);
  }

  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.remove: capsule has invalid identifier");
  }

  if (normalizedMemberId === capsuleOwnerId) {
    throw new CapsuleMembershipError("conflict", "You cannot remove the capsule owner.", 409);
  }

  const removed = await deleteCapsuleMemberRecord(capsuleIdValue, normalizedMemberId);
  if (!removed) {
    throw new CapsuleMembershipError("not_found", "Member not found in this capsule.", 404);
  }

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId);
}
