import { isGroupConversationId } from "@/lib/chat/channels";
import {
  publishSessionDeletedEvent,
  publishSessionEvent,
} from "@/services/realtime/chat";

import {
  addGroupParticipants,
  createGroupConversation,
  deleteGroupConversation,
  listGroupConversationsByIds,
  listGroupParticipants,
  removeGroupParticipant,
  updateGroupConversation,
  fetchUsersByIds,
} from "../repository";
import {
  type ChatParticipantSummary,
  ChatServiceError,
} from "../types";
import {
  buildGroupConversationTitle,
  mergeParticipantMaps,
  normalizeId,
  toParticipantSummary,
  type ResolvedIdentity,
} from "../utils";
import { resolveIdentity } from "../identity";
import {
  assertGroupParticipantLimit,
  buildGroupParticipantSummaries,
} from "./participants";

export { assertGroupParticipantLimit };

export async function createGroupConversationSession(params: {
  conversationId: string;
  creatorId: string;
  participantIds: string[];
  title?: string | null;
  avatarUrl?: string | null;
}): Promise<{
  conversationId: string;
  participants: ChatParticipantSummary[];
  session: { type: "group"; title: string; avatar: string | null; createdBy: string | null };
}> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group id is invalid.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const creatorResolved = await resolveIdentity(identityCache, params.creatorId, params.creatorId);
  if (!creatorResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to create a group.");
  }
  const creatorId = normalizeId(creatorResolved.canonicalId);
  if (!creatorId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to create a group.");
  }

  const participantSet = new Map<string, ResolvedIdentity>();
  participantSet.set(creatorId, creatorResolved);

  for (const rawId of params.participantIds ?? []) {
    if (typeof rawId !== "string" || !rawId.trim()) continue;
    const resolved = await resolveIdentity(identityCache, rawId, rawId);
    if (!resolved) continue;
    const normalized = normalizeId(resolved.canonicalId);
    if (!normalized || participantSet.has(normalized)) continue;
    participantSet.set(normalized, resolved);
  }

  if (participantSet.size < 2) {
    throw new ChatServiceError(
      "invalid_participants",
      400,
      "Add at least one other participant to create a group chat.",
    );
  }
  assertGroupParticipantLimit(participantSet.size);

  const explicitTitle =
    typeof params.title === "string" && params.title.trim().length ? params.title.trim() : null;
  const avatarUrl =
    typeof params.avatarUrl === "string" && params.avatarUrl.trim().length
      ? params.avatarUrl.trim()
      : null;

  await createGroupConversation({
    id: trimmedConversationId,
    created_by: creatorResolved.canonicalId,
    title: explicitTitle,
    avatar_url: avatarUrl,
  });

  await addGroupParticipants(
    Array.from(participantSet.values()).map((resolved) => ({
      conversation_id: trimmedConversationId,
      user_id: resolved.canonicalId,
      joined_at: new Date().toISOString(),
    })),
  );

  const participantIds = Array.from(participantSet.keys());
  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
  mergeParticipantMaps(participantMap, participantSet.values());

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

  const sessionTitle = buildGroupConversationTitle(participantSummaries, explicitTitle);
  await publishSessionEvent({
    conversationId: trimmedConversationId,
    participants: participantSummaries,
    session: {
      type: "group",
      title: sessionTitle,
      avatar: avatarUrl,
      createdBy: creatorResolved.canonicalId,
    },
  });
  return {
    conversationId: trimmedConversationId,
    participants: participantSummaries,
    session: {
      type: "group",
      title: sessionTitle,
      avatar: avatarUrl,
      createdBy: creatorResolved.canonicalId ?? null,
    },
  };
}

export async function addParticipantsToGroupConversation(params: {
  conversationId: string;
  requesterId: string;
  participantIds: string[];
}): Promise<ChatParticipantSummary[]> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }
  if (!Array.isArray(params.participantIds) || params.participantIds.length === 0) {
    throw new ChatServiceError("invalid_participants", 400, "Select members to invite.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(
    identityCache,
    params.requesterId,
    params.requesterId,
  );
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to invite participants.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  if (!requesterId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to invite participants.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  const memberSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );

  if (!memberSet.has(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const toAdd = new Set<string>();
  for (const rawId of params.participantIds) {
    if (typeof rawId !== "string" || !rawId.trim()) continue;
    const resolved = await resolveIdentity(identityCache, rawId, rawId);
    if (!resolved) continue;
    const normalized = normalizeId(resolved.canonicalId);
    if (!normalized || memberSet.has(normalized)) continue;
    memberSet.add(normalized);
    toAdd.add(resolved.canonicalId);
  }

  assertGroupParticipantLimit(memberSet.size);
  if (!toAdd.size) {
    return buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  }

  await addGroupParticipants(
    Array.from(toAdd).map((userId) => ({
      conversation_id: trimmedConversationId,
      user_id: userId,
      joined_at: new Date().toISOString(),
    })),
  );
  const updatedParticipants = await buildGroupParticipantSummaries(memberSet, [
    requesterResolved,
  ]);
  await publishSessionEvent({
    conversationId: trimmedConversationId,
    participants: updatedParticipants,
    session: {
      type: "group",
      title: conversationRow.title ?? "",
      avatar: conversationRow.avatar_url ?? null,
      createdBy: conversationRow.created_by ?? null,
    },
  });
  return updatedParticipants;
}

export async function removeParticipantFromGroupConversation(params: {
  conversationId: string;
  requesterId: string;
  targetUserId: string;
  allowSelf?: boolean;
}): Promise<ChatParticipantSummary[]> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(
    identityCache,
    params.requesterId,
    params.requesterId,
  );
  const targetResolved = await resolveIdentity(identityCache, params.targetUserId, params.targetUserId);
  if (!requesterResolved || !targetResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to manage participants.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  const targetId = normalizeId(targetResolved.canonicalId);
  if (!requesterId || !targetId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to manage participants.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  const memberSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );

  if (!memberSet.has(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }
  if (!memberSet.has(targetId)) {
    return buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  }
  const isCreator = conversationRow.created_by
    ? normalizeId(conversationRow.created_by) === requesterId
    : false;
  const removingSelf = requesterId === targetId;
  const allowSelf = Boolean(params.allowSelf);
  if (!isCreator && !(allowSelf && removingSelf)) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "Only the conversation owner can remove other participants.",
    );
  }

  await removeGroupParticipant(trimmedConversationId, targetResolved.canonicalId);
  memberSet.delete(targetId);
  const updated = await buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  await publishSessionEvent({
    conversationId: trimmedConversationId,
    participants: updated,
    session: {
      type: "group",
      title: conversationRow.title ?? "",
      avatar: conversationRow.avatar_url ?? null,
      createdBy: conversationRow.created_by ?? null,
    },
  });
  return updated;
}

export async function renameGroupConversation(params: {
  conversationId: string;
  requesterId: string;
  title: string;
}): Promise<{ conversationId: string; title: string }> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }
  const requesterTrimmed = params.requesterId?.trim();
  if (!requesterTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to rename this conversation.");
  }
  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, requesterTrimmed, requesterTrimmed);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to rename this conversation.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  if (!requesterId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to rename this conversation.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  const memberSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );
  if (!memberSet.has(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const normalizedTitle =
    typeof params.title === "string" && params.title.trim().length ? params.title.trim() : "";

  const updated = await updateGroupConversation(trimmedConversationId, {
    title: normalizedTitle,
  });
  const participants = await buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  await publishSessionEvent({
    conversationId: trimmedConversationId,
    participants,
    session: {
      type: "group",
      title: updated?.title ?? normalizedTitle ?? "",
      avatar: updated?.avatar_url ?? null,
      createdBy: updated?.created_by ?? null,
    },
  });
  return {
    conversationId: trimmedConversationId,
    title: updated?.title ?? normalizedTitle ?? "",
  };
}

export async function deleteGroupConversationSession(params: {
  conversationId: string;
  requesterId: string;
}): Promise<void> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, params.requesterId, params.requesterId);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to manage this conversation.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  if (!requesterId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to manage this conversation.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }
  const membershipRows = await listGroupParticipants(trimmedConversationId);
  const memberSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );
  if (!memberSet.has(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }
  const isCreator = conversationRow.created_by
    ? normalizeId(conversationRow.created_by) === requesterId
    : false;
  if (!isCreator) {
    throw new ChatServiceError("forbidden", 403, "Only the group owner can delete this conversation.");
  }

  const participants = await buildGroupParticipantSummaries(memberSet, [requesterResolved]);
  await deleteGroupConversation(trimmedConversationId);
  await publishSessionDeletedEvent({
    conversationId: trimmedConversationId,
    participants,
  });
}
