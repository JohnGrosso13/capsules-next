import type {
  CapsuleMemberRequestSummary,
  CapsuleMembershipState,
  CapsuleMembershipViewer,
} from "@/types/capsules";
import {
  deleteCapsuleMember as deleteCapsuleMemberRecord,
  deleteCapsuleFollower,
  getCapsuleFollowerRecord,
  getCapsuleMemberRecord,
  getCapsuleMemberRequest,
  getCapsuleMemberRequestById,
  listCapsuleFollowers,
  listCapsuleInvites,
  listCapsuleMemberRequests,
  listCapsuleMembers,
  setCapsuleMemberRequestStatus,
  upsertCapsuleFollower,
  upsertCapsuleMember,
  upsertCapsuleMemberRequest,
  updateCapsuleMemberRole,
} from "../repository";
import {
  isCapsuleMemberUiRole,
  resolveViewerUiRole,
  uiRoleToDbRole,
  type CapsuleMemberUiRole,
} from "../roles";
import { enqueueCapsuleKnowledgeRefresh } from "../knowledge";
import {
  CapsuleMembershipError,
  normalizeId,
  normalizeMemberRole,
  normalizeOptionalString,
  normalizeRequestMessage,
  requireCapsule,
  requireCapsuleOwnership,
  resolveCapsuleMediaUrl,
} from "./common";
import { notifyCapsuleInvite } from "@/server/notifications/triggers";

export async function getCapsuleMembership(
  capsuleId: string,
  viewerId: string | null | undefined,
  options: { origin?: string | null } = {},
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

  let followerRecord: { created_at: string | null } | null = null;
  if (normalizedViewerId && !isOwner && !membershipRecord) {
    followerRecord = await getCapsuleFollowerRecord(capsuleIdValue, normalizedViewerId);
  }

  let viewerRequest: CapsuleMemberRequestSummary | null = null;
  if (normalizedViewerId && !isOwner && !membershipRecord) {
    viewerRequest = await getCapsuleMemberRequest(capsuleIdValue, normalizedViewerId);
  }

  const members = await listCapsuleMembers(capsuleIdValue, ownerId);
  const followers = await listCapsuleFollowers(capsuleIdValue);
  const rawRequests = isOwner ? await listCapsuleMemberRequests(capsuleIdValue, "pending") : [];
  const requests = rawRequests.filter((request) => request.origin === "viewer_request");
  const invites = isOwner ? await listCapsuleInvites(capsuleIdValue) : [];

  const isFollower = Boolean(followerRecord);
  const viewer: CapsuleMembershipViewer = {
    userId: normalizedViewerId,
    isOwner,
    isMember: isOwner || Boolean(membershipRecord),
    isFollower,
    canManage: isOwner,
    canRequest:
      Boolean(normalizedViewerId) &&
      !isOwner &&
      !membershipRecord &&
      viewerRequest?.status !== "pending",
    canFollow:
      Boolean(normalizedViewerId) && !isOwner && !membershipRecord && !isFollower,
    role: resolveViewerUiRole(membershipRecord?.role ?? null, isOwner),
    memberSince: membershipRecord?.joined_at ?? null,
    followedAt: followerRecord ? normalizeOptionalString(followerRecord.created_at ?? null) : null,
    requestStatus: viewerRequest?.status ?? "none",
    requestId: viewerRequest?.id ?? null,
  };

  return {
    capsule: {
      id: capsuleIdValue,
      name: normalizeOptionalString(capsule.name ?? null),
      slug: normalizeOptionalString(capsule.slug ?? null),
      ownerId,
      bannerUrl: resolveCapsuleMediaUrl(capsule.banner_url ?? null, options.origin ?? null),
      storeBannerUrl: resolveCapsuleMediaUrl(capsule.store_banner_url ?? null, options.origin ?? null),
      promoTileUrl: resolveCapsuleMediaUrl(capsule.promo_tile_url ?? null, options.origin ?? null),
      logoUrl: resolveCapsuleMediaUrl(capsule.logo_url ?? null, options.origin ?? null),
    },
    viewer,
    counts: {
      members: members.length,
      pendingRequests: requests.length,
      followers: followers.length,
    },
    members,
    followers,
    requests,
    invites: isOwner ? invites : [],
    viewerRequest,
  };
}

export async function requestCapsuleMembership(
  userId: string,
  capsuleId: string,
  params: { message?: string } = {},
  options: { origin?: string | null } = {},
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

  return getCapsuleMembership(capsuleIdValue, normalizedUserId, options);
}

export async function followCapsule(
  userId: string,
  capsuleId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  const { capsule } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.follow: capsule has invalid identifier");
  }
  const membership = await getCapsuleMemberRecord(capsuleIdValue, normalizedUserId);
  if (membership) {
    return getCapsuleMembership(capsuleIdValue, normalizedUserId, options);
  }
  await upsertCapsuleFollower({ capsuleId: capsuleIdValue, userId: normalizedUserId });
  return getCapsuleMembership(capsuleIdValue, normalizedUserId, options);
}

export async function unfollowCapsule(
  userId: string,
  capsuleId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  const { capsule } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.unfollow: capsule has invalid identifier");
  }
  await deleteCapsuleFollower(capsuleIdValue, normalizedUserId);
  return getCapsuleMembership(capsuleIdValue, normalizedUserId, options);
}

export async function leaveCapsule(
  userId: string,
  capsuleId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }

  const { capsule, ownerId } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.leave: capsule has invalid identifier");
  }

  if (normalizedUserId === ownerId) {
    throw new CapsuleMembershipError("conflict", "Owners cannot leave their own capsule.", 409);
  }

  const membership = await getCapsuleMemberRecord(capsuleIdValue, normalizedUserId);
  if (!membership) {
    throw new CapsuleMembershipError("not_found", "You are not a member of this capsule.", 404);
  }

  await deleteCapsuleMemberRecord(capsuleIdValue, normalizedUserId);
  return getCapsuleMembership(capsuleIdValue, normalizedUserId, options);
}

export async function inviteCapsuleMember(
  ownerId: string,
  capsuleId: string,
  targetUserId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedTargetId = normalizeId(targetUserId);
  if (!normalizedTargetId) {
    throw new CapsuleMembershipError("invalid", "A valid user id is required to invite.", 400);
  }
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.invite: capsule has invalid identifier");
  }
  if (normalizedTargetId === capsuleOwnerId) {
    throw new CapsuleMembershipError("conflict", "You already own this capsule.", 409);
  }
  const membership = await getCapsuleMemberRecord(capsuleIdValue, normalizedTargetId);
  if (membership) {
    throw new CapsuleMembershipError("conflict", "That user is already a member.", 409);
  }
  const existingRequest = await getCapsuleMemberRequest(capsuleIdValue, normalizedTargetId);
  if (existingRequest && existingRequest.status === "pending" && existingRequest.origin === "viewer_request") {
    throw new CapsuleMembershipError("conflict", "That user already has a pending request.", 409);
  }
  const invite = await upsertCapsuleMemberRequest(capsuleIdValue, normalizedTargetId, {
    origin: "owner_invite",
    initiatorId: capsuleOwnerId,
  });
  void notifyCapsuleInvite(invite);
  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
}

export async function acceptCapsuleInvite(
  userId: string,
  requestId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  const normalizedRequestId = normalizeId(requestId);
  if (!normalizedRequestId) {
    throw new CapsuleMembershipError("invalid", "A valid request id is required.", 400);
  }
  const request = await getCapsuleMemberRequestById(normalizedRequestId);
  if (!request || request.requesterId !== normalizedUserId) {
    throw new CapsuleMembershipError("not_found", "Invitation not found.", 404);
  }
  if (request.origin !== "owner_invite" || request.status !== "pending") {
    throw new CapsuleMembershipError("conflict", "This invitation is not available anymore.", 409);
  }
  const capsuleIdValue = normalizeId(request.capsuleId);
  if (!capsuleIdValue) {
    throw new CapsuleMembershipError("invalid", "Invitation capsule is invalid.", 400);
  }
  await upsertCapsuleMember({
    capsuleId: capsuleIdValue,
    userId: normalizedUserId,
    role: uiRoleToDbRole("member"),
  });
  await setCapsuleMemberRequestStatus({
    capsuleId: capsuleIdValue,
    requestId: normalizedRequestId,
    status: "approved",
    responderId: normalizedUserId,
  });
  enqueueCapsuleKnowledgeRefresh(
    capsuleIdValue,
    normalizeOptionalString(request.capsuleName ?? null),
  );
  return getCapsuleMembership(capsuleIdValue, normalizedUserId, options);
}

export async function declineCapsuleInvite(
  userId: string,
  requestId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  const normalizedRequestId = normalizeId(requestId);
  if (!normalizedRequestId) {
    throw new CapsuleMembershipError("invalid", "A valid request id is required.", 400);
  }
  const request = await getCapsuleMemberRequestById(normalizedRequestId);
  if (!request || request.requesterId !== normalizedUserId) {
    throw new CapsuleMembershipError("not_found", "Invitation not found.", 404);
  }
  if (request.origin !== "owner_invite" || request.status !== "pending") {
    throw new CapsuleMembershipError("conflict", "This invitation is not available anymore.", 409);
  }
  const capsuleIdValue = normalizeId(request.capsuleId);
  if (!capsuleIdValue) {
    throw new CapsuleMembershipError("invalid", "Invitation capsule is invalid.", 400);
  }
  await setCapsuleMemberRequestStatus({
    capsuleId: capsuleIdValue,
    requestId: normalizedRequestId,
    status: "declined",
    responderId: normalizedUserId,
  });
  return getCapsuleMembership(capsuleIdValue, normalizedUserId, options);
}

export async function approveCapsuleMemberRequest(
  ownerId: string,
  capsuleId: string,
  requestId: string,
  options: { origin?: string | null } = {},
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

  const uiRole: CapsuleMemberUiRole =
    updated.role && isCapsuleMemberUiRole(updated.role) ? updated.role : "member";
  const dbRole = uiRoleToDbRole(uiRole);

  await upsertCapsuleMember({
    capsuleId: capsuleIdValue,
    userId: updated.requesterId,
    role: dbRole,
  });

  const membershipState = await getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
  enqueueCapsuleKnowledgeRefresh(capsuleIdValue, normalizeOptionalString(capsule.name ?? null));
  return membershipState;
}

export async function declineCapsuleMemberRequest(
  ownerId: string,
  capsuleId: string,
  requestId: string,
  options: { origin?: string | null } = {},
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

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
}

export async function removeCapsuleMember(
  ownerId: string,
  capsuleId: string,
  memberId: string,
  options: { origin?: string | null } = {},
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

  const membershipState = await getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
  enqueueCapsuleKnowledgeRefresh(capsuleIdValue, normalizeOptionalString(capsule.name ?? null));
  return membershipState;
}

export async function setCapsuleMemberRole(
  ownerId: string,
  capsuleId: string,
  memberId: string,
  role: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedMemberId = normalizeId(memberId);
  if (!normalizedMemberId) {
    throw new CapsuleMembershipError("invalid", "A valid member id is required.", 400);
  }

  const normalizedRole = normalizeMemberRole(role);

  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.role: capsule has invalid identifier");
  }

  if (normalizedMemberId === capsuleOwnerId && normalizedRole !== "founder") {
    throw new CapsuleMembershipError("conflict", "The capsule owner must remain a founder.", 409);
  }

  const updated = await updateCapsuleMemberRole({
    capsuleId: capsuleIdValue,
    memberId: normalizedMemberId,
    role: uiRoleToDbRole(normalizedRole),
  });

  if (!updated) {
    throw new CapsuleMembershipError("not_found", "Member not found in this capsule.", 404);
  }

  const membershipState = await getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
  enqueueCapsuleKnowledgeRefresh(capsuleIdValue, normalizeOptionalString(capsule.name ?? null));
  return membershipState;
}
