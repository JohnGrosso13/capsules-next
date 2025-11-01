import "server-only";

import { getRealtimePublisher } from "@/config/realtime-server";
import { getChatDirectChannel } from "@/lib/chat/channels";
import {
  chatMessageEventSchema,
  chatReactionEventSchema,
  chatSessionEventSchema,
  chatMessageUpdatedEventSchema,
  chatMessageDeletedEventSchema,
} from "@/lib/chat/events";
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
  attachments?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url: string;
    thumbnailUrl: string | null;
    storageKey: string | null;
    sessionId: string | null;
  }>;
  sentAt: string;
  participants: ChatParticipantSummary[];
  reactions?: Array<{ emoji: string; users: ChatParticipantSummary[] }>;
  session?: DirectChatSessionMeta;
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

  const payload = chatMessageEventSchema.parse({
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
      attachments:
        Array.isArray(params.attachments) && params.attachments.length > 0
          ? params.attachments.map((attachment) => ({
              id: attachment.id,
              name: attachment.name,
              mimeType: attachment.mimeType,
              size: attachment.size,
              url: attachment.url,
              thumbnailUrl: attachment.thumbnailUrl ?? null,
              storageKey: attachment.storageKey ?? null,
              sessionId: attachment.sessionId ?? null,
            }))
          : [],
    },
  });

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

export async function publishMessageUpdateEvent(params: {
  conversationId: string;
  messageId: string;
  body: string;
  attachments: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url: string;
    thumbnailUrl: string | null;
    storageKey: string | null;
    sessionId: string | null;
  }>;
  participants: ChatParticipantSummary[];
  senderId: string;
  sentAt: string;
  session?: DirectChatSessionMeta;
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

  const payload = chatMessageUpdatedEventSchema.parse({
    type: "chat.message.update",
    conversationId: params.conversationId,
    messageId: params.messageId,
    body: params.body,
    attachments: params.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
      storageKey: attachment.storageKey ?? null,
      sessionId: attachment.sessionId ?? null,
    })),
    participants,
    senderId: params.senderId,
    sentAt: params.sentAt,
    session: {
      type: params.session?.type ?? "direct",
      title: params.session?.title ?? null,
      avatar: params.session?.avatar ?? null,
      createdBy: params.session?.createdBy ?? null,
    },
  });

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
    Array.from(channels).map((channel) => publisher.publish(channel, "chat.message.update", payload)),
  );
}

export async function publishMessageDeletedEvent(params: {
  conversationId: string;
  messageId: string;
  participants: ChatParticipantSummary[];
  session?: DirectChatSessionMeta;
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

  const payload = chatMessageDeletedEventSchema.parse({
    type: "chat.message.delete",
    conversationId: params.conversationId,
    messageId: params.messageId,
    participants,
    session: {
      type: params.session?.type ?? "direct",
      title: params.session?.title ?? null,
      avatar: params.session?.avatar ?? null,
      createdBy: params.session?.createdBy ?? null,
    },
  });

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
    Array.from(channels).map((channel) => publisher.publish(channel, "chat.message.delete", payload)),
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

  const payload = chatReactionEventSchema.parse({
    type: "chat.reaction",
    conversationId: params.conversationId,
    messageId: params.messageId,
    emoji: params.emoji,
    action: params.action,
    actor: normalizedActor,
    reactions: reactionPayload,
    participants,
  });

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

export async function publishSessionEvent(params: {
  conversationId: string;
  participants: ChatParticipantSummary[];
  session: { type: "direct" | "group"; title: string; avatar: string | null; createdBy: string | null };
}): Promise<void> {
  const publisher = getRealtimePublisher();
  if (!publisher) return;

  const participants = params.participants
    .map((participant) => ({ id: participant.id, name: participant.name, avatar: participant.avatar ?? null }))
    .filter((p) => Boolean(p.id));
  if (!participants.length) return;

  const payload = chatSessionEventSchema.parse({
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
  });

  const channels = new Set<string>();
  participants.forEach((participant) => {
    try {
      channels.add(getChatDirectChannel(participant.id));
    } catch {
      // ignore
    }
  });
  if (!channels.size) return;
  await Promise.all(
    Array.from(channels).map((channel) => publisher.publish(channel, "chat.session", payload)),
  );
}

export async function publishSessionDeletedEvent(params: {
  conversationId: string;
  participants: ChatParticipantSummary[];
}): Promise<void> {
  const publisher = getRealtimePublisher();
  if (!publisher) return;

  const participants = params.participants
    .map((participant) => ({ id: participant.id, name: participant.name, avatar: participant.avatar ?? null }))
    .filter((participant) => Boolean(participant.id));

  const payload = {
    type: "chat.session.deleted",
    conversationId: params.conversationId,
  };

  const channels = new Set<string>();
  participants.forEach((participant) => {
    try {
      channels.add(getChatDirectChannel(participant.id));
    } catch {
      // ignore invalid ids
    }
  });
  if (!channels.size) return;

  await Promise.all(
    Array.from(channels).map((channel) => publisher.publish(channel, "chat.session.deleted", payload)),
  );
}
