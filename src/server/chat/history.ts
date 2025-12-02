import {
  getChatConversationId,
  isGroupConversationId,
  parseConversationId,
} from "@/lib/chat/channels";

import {
  fetchUsersByIds,
  listChatMessageReactions,
  listChatMessages,
  listGroupConversationsByIds,
  listGroupMessageReactions,
  listGroupMessages,
  listGroupParticipants,
  listGroupMembershipsForUser,
  listRecentGroupMessagesForUser,
  listRecentMessagesForUser,
  type ChatGroupMessageRow,
  type ChatMessageRow,
} from "./repository";
import {
  type ChatConversationSummary,
  type ChatMessageRecord,
  type ChatParticipantSummary,
  ChatServiceError,
  type ChatMessageReactionRecord,
} from "./types";
import {
  buildConversationTitle,
  buildGroupConversationTitle,
  buildReactionSummaries,
  mergeParticipantMaps,
  normalizeId,
  resolveSentAt,
  toMessageRecord,
  toParticipantSummary,
  type ResolvedIdentity,
} from "./utils";
import { resolveIdentity } from "./identity";

export async function getDirectConversationHistory(params: {
  conversationId: string;
  requesterId: string;
  before?: string | null;
  limit?: number;
}): Promise<{
  conversationId: string;
  participants: ChatParticipantSummary[];
  messages: ChatMessageRecord[];
}> {
  if (!params.conversationId.trim()) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (isGroupConversationId(params.conversationId)) {
    return getGroupConversationHistory(params);
  }
  let parsedConversation: { left: string; right: string };
  try {
    parsedConversation = parseConversationId(params.conversationId);
  } catch {
    throw new ChatServiceError(
      "invalid_conversation",
      400,
      "That conversation could not be found.",
    );
  }
  const { left, right } = parsedConversation;
  const requesterTrimmed = params.requesterId?.trim();
  if (!requesterTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view this conversation.");
  }
  const requesterNormalized = normalizeId(requesterTrimmed);
  const identityCache = new Map<string, ResolvedIdentity | null>();
  const leftResolved = await resolveIdentity(identityCache, left);
  const rightResolved = await resolveIdentity(identityCache, right);
  const requesterResolved = await resolveIdentity(identityCache, requesterNormalized, requesterTrimmed);

  if (!leftResolved || !rightResolved) {
    throw new ChatServiceError(
      "invalid_conversation",
      404,
      "That conversation could not be found.",
    );
  }

  const canonicalRequester =
    requesterResolved?.canonicalId ?? requesterNormalized;
  const canonicalLeft = leftResolved.canonicalId;
  const canonicalRight = rightResolved.canonicalId;
  const isParticipant =
    canonicalRequester === canonicalLeft ||
    canonicalRequester === canonicalRight ||
    requesterNormalized === left ||
    requesterNormalized === right;

  if (!isParticipant) {
    throw new ChatServiceError(
      "forbidden",
      403,
      "You do not have access to this conversation.",
    );
  }

  const canonicalConversationId = getChatConversationId(canonicalLeft, canonicalRight);

  const participantRows = await fetchUsersByIds([canonicalLeft, canonicalRight]);
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));
  mergeParticipantMaps(participantMap, [leftResolved, rightResolved]);
  const participantSummaries: ChatParticipantSummary[] = [left, right]
    .map((id, index) => {
      const resolved = index === 0 ? leftResolved : rightResolved;
      const canonical = resolved?.canonicalId ?? id;
      const row = resolved ? participantMap.get(resolved.canonicalId) : participantMap.get(canonical);
      return toParticipantSummary(row, canonical);
    })
    .filter((participant, index, list) => list.findIndex((item) => item.id === participant.id) === index);

  let messages = await listChatMessages(canonicalConversationId, {
    limit: params.limit ?? 50,
    before: params.before ?? null,
  });
  if (
    messages.length === 0 &&
    canonicalConversationId !== params.conversationId
  ) {
    messages = await listChatMessages(params.conversationId, {
      limit: params.limit ?? 50,
      before: params.before ?? null,
    });
  }

  let messageReactionMap = new Map<string, ChatMessageReactionRecord[]>();
  if (messages.length > 0) {
    const reactionRows = await listChatMessageReactions(messages.map((message) => message.id));
    if (reactionRows.length > 0) {
      const missingParticipantIds = Array.from(
        new Set(
          reactionRows
            .map((row) => row.user_id)
            .filter((userId) => !participantMap.has(userId)),
        ),
      );
      if (missingParticipantIds.length > 0) {
        const additionalParticipants = await fetchUsersByIds(missingParticipantIds);
        additionalParticipants.forEach((row) => participantMap.set(row.id, row));
      }
      messageReactionMap = buildReactionSummaries(reactionRows, participantMap);
    }
  }

  return {
    conversationId: messages.length ? canonicalConversationId : params.conversationId,
    participants: participantSummaries,
    messages: messages.map((message) =>
      toMessageRecord(message, messageReactionMap.get(message.id) ?? []),
    ),
  };
}

export async function getGroupConversationHistory(params: {
  conversationId: string;
  requesterId: string;
  before?: string | null;
  limit?: number;
}): Promise<{
  conversationId: string;
  participants: ChatParticipantSummary[];
  messages: ChatMessageRecord[];
}> {
  const trimmedConversationId = params.conversationId?.trim();
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }
  const requesterTrimmed = params.requesterId?.trim();
  if (!requesterTrimmed) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view this conversation.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, requesterTrimmed, requesterTrimmed);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view this conversation.");
  }
  const requesterId = normalizeId(requesterResolved.canonicalId);
  if (!requesterId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view this conversation.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group could not be found.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  if (!membershipRows.length) {
    throw new ChatServiceError("invalid_conversation", 404, "That group has no participants.");
  }

  const participantIds = Array.from(
    new Set(
      membershipRows
        .map((row) => normalizeId(row.user_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!participantIds.includes(requesterId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
  mergeParticipantMaps(participantMap, [requesterResolved]);

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
      );

  const messages = await listGroupMessages(trimmedConversationId, {
    limit: params.limit ?? 50,
    before: params.before ?? null,
  });

  let messageReactionMap = new Map<string, ChatMessageReactionRecord[]>();
  if (messages.length > 0) {
    const reactionRows = await listGroupMessageReactions(messages.map((message) => message.id));
    if (reactionRows.length > 0) {
      const missingParticipantIds = Array.from(
        new Set(
          reactionRows
            .map((row) => normalizeId(row.user_id))
            .filter((userId) => userId && !participantMap.has(userId)),
        ),
      );
      if (missingParticipantIds.length > 0) {
        const additionalProfiles = await fetchUsersByIds(missingParticipantIds);
        additionalProfiles.forEach((row) => participantMap.set(normalizeId(row.id), row));
      }
      messageReactionMap = buildReactionSummaries(reactionRows, participantMap);
    }
  }

  return {
    conversationId: trimmedConversationId,
    participants: participantSummaries,
    messages: messages.map((message) =>
      toMessageRecord(message, messageReactionMap.get(message.id) ?? []),
    ),
  };
}

export async function listRecentDirectConversations(params: {
  userId: string;
  limit?: number;
}): Promise<ChatConversationSummary[]> {
  const trimmedUser = params.userId?.trim();
  if (!trimmedUser) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }
  const normalizedUser = normalizeId(trimmedUser);
  if (!normalizedUser) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, normalizedUser, trimmedUser);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const canonicalUserId = requesterResolved.canonicalId;
  const normalizedCanonicalUserId = normalizeId(canonicalUserId);
  if (!normalizedCanonicalUserId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const requestedLimit = Number.isFinite(params.limit) ? Number(params.limit) : 25;
  const conversationLimit = Math.max(1, Math.min(100, requestedLimit));
  const fetchLimit = Math.min(500, conversationLimit * 15);

  const recentRows = await listRecentMessagesForUser(normalizedCanonicalUserId, {
    limit: fetchLimit,
  });

  if (!recentRows.length) return [];

  const latestByConversation = new Map<string, ChatMessageRow>();
  recentRows.forEach((row) => {
    if (!row?.conversation_id) return;
    if (!latestByConversation.has(row.conversation_id)) {
      latestByConversation.set(row.conversation_id, row);
    }
  });

  if (!latestByConversation.size) return [];

  const conversationEntries = Array.from(latestByConversation.values())
    .sort((a, b) => Date.parse(resolveSentAt(b)) - Date.parse(resolveSentAt(a)))
    .slice(0, conversationLimit)
    .map((row) => {
      try {
        const { left, right } = parseConversationId(row.conversation_id);
        if (left !== normalizedCanonicalUserId && right !== normalizedCanonicalUserId) {
          return null;
        }
        return { row, left, right };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { row: ChatMessageRow; left: string; right: string } =>
      entry !== null,
    );

  const participantIdSet = new Set<string>();
  conversationEntries.forEach(({ left, right }) => {
    if (left) participantIdSet.add(left);
    if (right) participantIdSet.add(right);
  });

  const participantRows = await fetchUsersByIds(Array.from(participantIdSet));
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));

  const lastMessageRows = conversationEntries.map(({ row }) => row);
  let lastMessageReactionMap = new Map<string, ChatMessageReactionRecord[]>();
  if (lastMessageRows.length > 0) {
    const reactionRows = await listChatMessageReactions(lastMessageRows.map((row) => row.id));
    if (reactionRows.length > 0) {
      const missingIds = Array.from(
        new Set(
          reactionRows
            .map((row) => row.user_id)
            .filter((userId) => !participantMap.has(userId)),
        ),
      );
      if (missingIds.length > 0) {
        const additional = await fetchUsersByIds(missingIds);
        additional.forEach((row) => participantMap.set(row.id, row));
      }
      lastMessageReactionMap = buildReactionSummaries(reactionRows, participantMap);
    }
  }

  const summaries: ChatConversationSummary[] = [];

  conversationEntries.forEach(({ row, left, right }) => {
    const resolvedLeft = participantMap.get(left) ?? null;
    const resolvedRight = participantMap.get(right) ?? null;

    const participants = [
      toParticipantSummary(resolvedLeft ?? undefined, left),
      toParticipantSummary(resolvedRight ?? undefined, right),
    ].filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

    if (!participants.some((participant) => participant.id === canonicalUserId)) {
      participants.push(toParticipantSummary(participantMap.get(canonicalUserId), canonicalUserId));
    }

    const messageRecord = toMessageRecord(row, lastMessageReactionMap.get(row.id) ?? []);
    const sessionTitle = buildConversationTitle(participants, canonicalUserId);
    const remoteParticipant =
      participants.find((participant) => participant.id !== canonicalUserId) ?? null;

    summaries.push({
      conversationId: row.conversation_id,
      participants,
      lastMessage: messageRecord,
      session: {
        type: "direct",
        title: sessionTitle,
        avatar: remoteParticipant?.avatar ?? null,
        createdBy: null,
      },
    });
  });

  return summaries;
}

export async function listRecentGroupConversations(params: {
  userId: string;
  limit?: number;
}): Promise<ChatConversationSummary[]> {
  const trimmedUser = params.userId?.trim();
  if (!trimmedUser) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const requesterResolved = await resolveIdentity(identityCache, trimmedUser, trimmedUser);
  if (!requesterResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }
  const canonicalUserId = normalizeId(requesterResolved.canonicalId);
  if (!canonicalUserId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to view messages.");
  }

  const membershipRows = await listGroupMembershipsForUser(canonicalUserId);
  if (!membershipRows.length) return [];

  const membershipMap = new Map(
    membershipRows.map((row) => [row.conversation_id, row] as const),
  );
  const conversationIds = Array.from(
    new Set(membershipRows.map((row) => row.conversation_id).filter(Boolean)),
  );
  if (!conversationIds.length) return [];

  const requestedLimit = Number.isFinite(params.limit) ? Number(params.limit) : 25;
  const conversationLimit = Math.max(1, Math.min(100, requestedLimit));
  const fetchLimit = Math.min(500, conversationLimit * 15);

  const recentMessages = await listRecentGroupMessagesForUser(canonicalUserId, {
    limit: fetchLimit,
  });

  const latestByConversation = new Map<string, ChatGroupMessageRow>();
  recentMessages.forEach((row) => {
    if (!row?.conversation_id) return;
    const existing = latestByConversation.get(row.conversation_id);
    if (!existing || Date.parse(resolveSentAt(row)) > Date.parse(resolveSentAt(existing))) {
      latestByConversation.set(row.conversation_id, row);
    }
  });

  const activityEntries = conversationIds.map((id) => {
    const latest = latestByConversation.get(id) ?? null;
    const membership = membershipMap.get(id) ?? null;
    const activityTimestamp = latest
      ? Date.parse(resolveSentAt(latest))
      : membership?.joined_at
        ? Date.parse(membership.joined_at)
        : 0;
    return { id, latest, activityTimestamp };
  });

  activityEntries.sort((a, b) => b.activityTimestamp - a.activityTimestamp);

  const selectedEntries = activityEntries.slice(0, conversationLimit);
  if (!selectedEntries.length) return [];

  const conversationRows = await listGroupConversationsByIds(selectedEntries.map((entry) => entry.id));
  const conversationMap = new Map(conversationRows.map((row) => [row.id, row]));

  const summaries: ChatConversationSummary[] = [];

  for (const entry of selectedEntries) {
    const conversation = conversationMap.get(entry.id) ?? null;
    const participantRows = await listGroupParticipants(entry.id);
    const participantIds = Array.from(
      new Set(
        participantRows
          .map((row) => normalizeId(row.user_id))
          .concat([canonicalUserId])
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const participantProfiles = await fetchUsersByIds(participantIds);
    const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
    mergeParticipantMaps(participantMap, [requesterResolved]);

    const participantSummaries = participantIds
      .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
      .filter(
        (participant, index, list) =>
          list.findIndex((item) => item.id === participant.id) === index,
      );

    let messageRecord: ChatMessageRecord | null = null;
    if (entry.latest) {
      const reactionRows = await listGroupMessageReactions([entry.latest.id]);
      let reactionMap = new Map<string, ChatMessageReactionRecord[]>();
      if (reactionRows.length > 0) {
        const missingParticipantIds = Array.from(
          new Set(
            reactionRows
              .map((row) => normalizeId(row.user_id))
              .filter((userId) => userId && !participantMap.has(userId)),
          ),
        );
        if (missingParticipantIds.length > 0) {
          const additionalProfiles = await fetchUsersByIds(missingParticipantIds);
          additionalProfiles.forEach((row) => participantMap.set(normalizeId(row.id), row));
        }
        reactionMap = buildReactionSummaries(reactionRows, participantMap);
      }
      messageRecord = toMessageRecord(entry.latest, reactionMap.get(entry.latest.id) ?? []);
    }

    const sessionTitle = buildGroupConversationTitle(participantSummaries, conversation?.title ?? null);
    summaries.push({
      conversationId: entry.id,
      participants: participantSummaries,
      lastMessage: messageRecord,
      session: {
        type: "group",
        title: sessionTitle,
        avatar: conversation?.avatar_url ?? null,
        createdBy: conversation?.created_by ?? null,
      },
    });
  }

  return summaries;
}
