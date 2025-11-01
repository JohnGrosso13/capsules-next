import {
  getChatConversationId,
  isGroupConversationId,
  parseConversationId,
} from "@/lib/chat/channels";
import { publishReactionEvent } from "@/services/realtime/chat";

import {
  deleteChatMessageReaction,
  deleteGroupMessageReaction,
  fetchUsersByIds,
  findChatMessageById,
  findGroupMessageById,
  listChatMessageReactions,
  listGroupConversationsByIds,
  listGroupMessageReactions,
  listGroupParticipants,
  type ChatGroupMessageReactionRow,
  type ChatGroupMessageRow,
  type ChatMessageReactionRow,
  type ChatMessageRow,
  type ChatParticipantRow,
  upsertChatMessageReaction,
  upsertGroupMessageReaction,
} from "./repository";
import {
  ChatParticipantSummary,
  ChatReactionMutationResult,
  ChatServiceError,
} from "./types";
import {
  ResolvedIdentity,
  buildReactionSummaries,
  canonicalizeMessageId,
  mergeParticipantMaps,
  normalizeId,
  sanitizeReactionEmoji,
  toParticipantSummary,
} from "./utils";
import { resolveIdentity } from "./identity";

type ReactionContext = {
  messageRow: ChatMessageRow | ChatGroupMessageRow;
  participantMap: Map<string, ChatParticipantRow>;
  participantSummaries: ChatParticipantSummary[];
  actorSummary: ChatParticipantSummary;
  actorId: string;
  conversationType: "direct" | "group";
};

async function resolveDirectReactionContext(params: {
  conversationId: string;
  messageId: string;
  userId: string;
}): Promise<ReactionContext> {
  const trimmedConversationId =
    typeof params.conversationId === "string" ? params.conversationId.trim() : "";
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }

  let parsedConversation: { left: string; right: string };
  try {
    parsedConversation = parseConversationId(trimmedConversationId);
  } catch {
    throw new ChatServiceError("invalid_conversation", 400, "That message thread cannot be found.");
  }

  const canonicalLeft = normalizeId(parsedConversation.left);
  const canonicalRight = normalizeId(parsedConversation.right);
  if (!canonicalLeft || !canonicalRight) {
    throw new ChatServiceError("invalid_conversation", 400, "That message thread cannot be found.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const actorResolved = await resolveIdentity(identityCache, params.userId, params.userId);
  if (!actorResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to react to this message.");
  }
  const actorId = actorResolved.canonicalId;

  if (actorId !== canonicalLeft && actorId !== canonicalRight) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const canonicalConversationId = getChatConversationId(canonicalLeft, canonicalRight);
  const canonicalMessageId = canonicalizeMessageId(params.messageId, canonicalConversationId);

  const messageRow = await findChatMessageById(canonicalMessageId);
  if (!messageRow) {
    throw new ChatServiceError("message_not_found", 404, "That message no longer exists.");
  }

  let messageParticipants: { left: string; right: string };
  try {
    messageParticipants = parseConversationId(messageRow.conversation_id);
  } catch {
    throw new ChatServiceError("message_not_found", 404, "That message no longer exists.");
  }

  if (actorId !== messageParticipants.left && actorId !== messageParticipants.right) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this message.");
  }

  const otherParticipantId =
    actorId === messageParticipants.left ? messageParticipants.right : messageParticipants.left;

  const otherResolved =
    otherParticipantId && otherParticipantId !== actorId
      ? await resolveIdentity(identityCache, otherParticipantId, otherParticipantId)
      : null;

  const participantIds = Array.from(
    new Set([messageParticipants.left, messageParticipants.right].filter(Boolean)),
  );
  const participantRows = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantRows.map((row) => [row.id, row]));
  const fallbackProfiles: ResolvedIdentity[] = [actorResolved];
  if (otherResolved) fallbackProfiles.push(otherResolved);
  mergeParticipantMaps(participantMap, fallbackProfiles);

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id), id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

  const actorSummary = toParticipantSummary(participantMap.get(actorId), actorId);

  return {
    messageRow,
    participantMap,
    participantSummaries,
    actorSummary,
    actorId,
    conversationType: "direct",
  };
}

async function resolveGroupReactionContext(params: {
  conversationId: string;
  messageId: string;
  userId: string;
}): Promise<ReactionContext> {
  const trimmedConversationId =
    typeof params.conversationId === "string" ? params.conversationId.trim() : "";
  if (!trimmedConversationId) {
    throw new ChatServiceError("invalid_conversation", 400, "A conversation id is required.");
  }
  if (!isGroupConversationId(trimmedConversationId)) {
    throw new ChatServiceError("invalid_conversation", 400, "That group cannot be found.");
  }

  const [conversationRow] = await listGroupConversationsByIds([trimmedConversationId]);
  if (!conversationRow) {
    throw new ChatServiceError("invalid_conversation", 404, "That group cannot be found.");
  }

  const membershipRows = await listGroupParticipants(trimmedConversationId);
  if (!membershipRows.length) {
    throw new ChatServiceError("invalid_conversation", 404, "That group has no participants.");
  }

  const identityCache = new Map<string, ResolvedIdentity | null>();
  const actorResolved = await resolveIdentity(identityCache, params.userId, params.userId);
  if (!actorResolved) {
    throw new ChatServiceError("auth_required", 401, "Sign in to react to this message.");
  }
  const actorId = normalizeId(actorResolved.canonicalId);
  if (!actorId) {
    throw new ChatServiceError("auth_required", 401, "Sign in to react to this message.");
  }

  const membershipSet = new Set(
    membershipRows.map((row) => normalizeId(row.user_id)).filter((value): value is string => Boolean(value)),
  );
  if (!membershipSet.has(actorId)) {
    throw new ChatServiceError("forbidden", 403, "You do not have access to this conversation.");
  }

  const participantIds = Array.from(membershipSet);
  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(
    participantProfiles.map((row) => [normalizeId(row.id), row]),
  );
  mergeParticipantMaps(participantMap, [actorResolved]);

  const canonicalMessageId = canonicalizeMessageId(params.messageId, trimmedConversationId);
  let messageRow = await findGroupMessageById(canonicalMessageId);
  if (!messageRow && canonicalMessageId !== params.messageId.trim()) {
    messageRow = await findGroupMessageById(params.messageId.trim());
  }
  if (!messageRow || normalizeId(messageRow.conversation_id) !== trimmedConversationId) {
    throw new ChatServiceError("message_not_found", 404, "That message no longer exists.");
  }

  const participantSummaries = participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );

  const actorSummary = toParticipantSummary(participantMap.get(actorId) ?? undefined, actorId);

  return {
    messageRow,
    participantMap,
    participantSummaries,
    actorSummary,
    actorId,
    conversationType: "group",
  };
}

async function finalizeReactionMutation(
  context: ReactionContext,
  emoji: string,
  action: "added" | "removed",
  fetchReactions: (
    messageIds: string[],
  ) => Promise<Array<ChatMessageReactionRow | ChatGroupMessageReactionRow>>,
): Promise<ChatReactionMutationResult> {
  const reactionRows = await fetchReactions([context.messageRow.id]);
  if (reactionRows.length > 0) {
    const missingParticipantIds = Array.from(
      new Set(
        reactionRows
          .map((row) => row.user_id)
          .filter((userId) => !context.participantMap.has(userId)),
      ),
    );
    if (missingParticipantIds.length > 0) {
      const additionalParticipants = await fetchUsersByIds(missingParticipantIds);
      additionalParticipants.forEach((row) => context.participantMap.set(row.id, row));
    }
  }
  const reactionMap = buildReactionSummaries(reactionRows, context.participantMap);
  const reactions = reactionMap.get(context.messageRow.id) ?? [];

  return {
    conversationId: context.messageRow.conversation_id,
    messageId: context.messageRow.id,
    reactions,
    participants: context.participantSummaries,
    actor: context.actorSummary,
    emoji,
    action,
  };
}

export async function addMessageReaction(params: {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
}): Promise<ChatReactionMutationResult> {
  const emoji = sanitizeReactionEmoji(params.emoji);
  if (!emoji) {
    throw new ChatServiceError("invalid_reaction", 400, "Choose a reaction to send.");
  }
  const context = isGroupConversationId(params.conversationId)
    ? await resolveGroupReactionContext({
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
      })
    : await resolveDirectReactionContext({
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
      });

  if (context.conversationType === "group") {
    await upsertGroupMessageReaction({
      message_id: context.messageRow.id,
      user_id: context.actorId,
      emoji,
    });
  } else {
    await upsertChatMessageReaction({
      message_id: context.messageRow.id,
      user_id: context.actorId,
      emoji,
    });
  }

  const result = await finalizeReactionMutation(
    context,
    emoji,
    "added",
    context.conversationType === "group" ? listGroupMessageReactions : listChatMessageReactions,
  );
  await publishReactionEvent({
    conversationId: result.conversationId,
    messageId: result.messageId,
    emoji: result.emoji,
    action: result.action,
    reactions: result.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      users: reaction.users,
    })),
    participants: result.participants,
    actor: result.actor,
  });
  return result;
}

export async function removeMessageReaction(params: {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
}): Promise<ChatReactionMutationResult> {
  const emoji = sanitizeReactionEmoji(params.emoji);
  if (!emoji) {
    throw new ChatServiceError("invalid_reaction", 400, "Choose a reaction to remove.");
  }
  const context = isGroupConversationId(params.conversationId)
    ? await resolveGroupReactionContext({
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
      })
    : await resolveDirectReactionContext({
        conversationId: params.conversationId,
        messageId: params.messageId,
        userId: params.userId,
      });

  if (context.conversationType === "group") {
    await deleteGroupMessageReaction(context.messageRow.id, context.actorId, emoji);
  } else {
    await deleteChatMessageReaction({
      message_id: context.messageRow.id,
      user_id: context.actorId,
      emoji,
    });
  }

  const result = await finalizeReactionMutation(
    context,
    emoji,
    "removed",
    context.conversationType === "group" ? listGroupMessageReactions : listChatMessageReactions,
  );
  await publishReactionEvent({
    conversationId: result.conversationId,
    messageId: result.messageId,
    emoji: result.emoji,
    action: result.action,
    reactions: result.reactions.map((reaction) => ({
      emoji: reaction.emoji,
      users: reaction.users,
    })),
    participants: result.participants,
    actor: result.actor,
  });
  return result;
}
