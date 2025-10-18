import "server-only";

import { getRealtimePublisher } from "@/config/realtime-server";
import { getChatDirectChannel } from "@/lib/chat/channels";
import type {
  ChatMessageEventPayload,
  ChatReactionEventPayload,
  ChatSessionEventPayload,
} from "@/components/providers/chat-store";
import type { ChatParticipantSummary } from "@/server/chat/service";

type DirectChatSessionMeta = {
  type?: "direct" | "group";
  title?: string | null;
  avatar?: string | null;
  createdBy?: string | null;
};

export async function publishDirectMessageEvent(params: {
  conversationId: string;
  messageId: string;
  senderId: string;
  body: string;
  sentAt: string;
  participants: ChatParticipantSummary[];
  reactions?: Array<{ emoji: string; users: ChatParticipantSummary[] }>;
  session?: DirectChatSessionMeta;
}): Promise<void> {
  const publisher = getRealtimePublisher();
  if (!publisher) return;
  const participants = params.participants.map((participant) => ({
    id: participant.id,
    name: participant.name,
    avatar: participant.avatar ?? null,
  }));
  if (!participants.length) return;

  const reactionEntries =
    Array.isArray(params.reactions) && params.reactions.length > 0
      ? params.reactions.map((reaction) => ({
          emoji: reaction.emoji,
          users: reaction.users.map((user) => ({
            id: user.id,
            name: user.name,
            avatar: user.avatar ?? null,
          })),
        }))
      : [];

  const payload: ChatMessageEventPayload = {
    type: "chat.message",
    conversationId: params.conversationId,
    senderId: params.senderId,
    participants,
    session: {
      type: params.session?.type ?? "direct",
      title: params.session?.title ?? "",
      avatar: params.session?.avatar ?? null,
      createdBy: params.session?.createdBy ?? null,
    },
    message: {
      id: params.messageId,
      body: params.body,
      sentAt: params.sentAt,
      reactions: reactionEntries,
    },
  };

  const channels = new Set<string>();
  participants.forEach((participant) => {
    try {
      channels.add(getChatDirectChannel(participant.id));
    } catch {
      // ignore invalid participant id
    }
  });

  if (!channels.size) return;

  await Promise.all(
    Array.from(channels).map((channel) => publisher.publish(channel, "chat.message", payload)),
  );
}

export async function publishSessionEvent(params: {
  conversationId: string;
  participants: ChatParticipantSummary[];
  session: {
    type: "direct" | "group";
    title: string;
    avatar: string | null;
    createdBy: string | null;
  };
}): Promise<void> {
  const publisher = getRealtimePublisher();
  if (!publisher) return;

  const participants = params.participants
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      avatar: participant.avatar ?? null,
    }))
    .filter((participant) => Boolean(participant.id));
  if (!participants.length) return;

  const payload: ChatSessionEventPayload = {
    type: "chat.session",
    conversationId: params.conversationId,
    session: {
      id: params.conversationId,
      type: params.session.type,
      title: params.session.title,
      avatar: params.session.avatar,
      createdBy: params.session.createdBy,
      participants,
    },
  };

  const channels = new Set<string>();
  participants.forEach((participant) => {
    try {
      channels.add(getChatDirectChannel(participant.id));
    } catch {
      // ignore invalid participant id
    }
  });

  if (!channels.size) return;

  await Promise.all(
    Array.from(channels).map((channel) => publisher.publish(channel, "chat.session", payload)),
  );
}

export async function publishReactionEvent(params: {
  conversationId: string;
  messageId: string;
  emoji: string;
  action: "added" | "removed";
  reactions: Array<{ emoji: string; users: ChatParticipantSummary[] }>;
  participants: ChatParticipantSummary[];
  actor: ChatParticipantSummary;
}): Promise<void> {
  const publisher = getRealtimePublisher();
  if (!publisher) return;

  const baseParticipants = params.participants
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      avatar: participant.avatar ?? null,
    }))
    .filter((participant) => Boolean(participant.id));

  const normalizedActor = {
    id: params.actor.id,
    name: params.actor.name,
    avatar: params.actor.avatar ?? null,
  };

  const participantMap = new Map<string, { id: string; name: string; avatar: string | null }>();
  baseParticipants.forEach((participant) => {
    participantMap.set(participant.id, participant);
  });
  if (normalizedActor.id && !participantMap.has(normalizedActor.id)) {
    participantMap.set(normalizedActor.id, normalizedActor);
  }

  const participants = Array.from(participantMap.values());
  if (!participants.length) return;

  const reactionPayload = params.reactions.map((reaction) => ({
    emoji: reaction.emoji,
    users: reaction.users
      .map((user) => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar ?? null,
      }))
      .filter((user) => Boolean(user.id)),
  }));

  const payload: ChatReactionEventPayload = {
    type: "chat.reaction",
    conversationId: params.conversationId,
    messageId: params.messageId,
    emoji: params.emoji,
    action: params.action,
    actor: normalizedActor,
    reactions: reactionPayload,
    participants,
  };

  const channels = new Set<string>();
  participants.forEach((participant) => {
    try {
      channels.add(getChatDirectChannel(participant.id));
    } catch {
      // ignore invalid participant id
    }
  });

  if (!channels.size) return;

  await Promise.all(
    Array.from(channels).map((channel) => publisher.publish(channel, "chat.reaction", payload)),
  );
}
