import "server-only";

import { getRealtimePublisher } from "@/config/realtime-server";
import { getChatDirectChannel } from "@/lib/chat/channels";
import type { ChatMessageEventPayload } from "@/components/providers/chat-store";
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
