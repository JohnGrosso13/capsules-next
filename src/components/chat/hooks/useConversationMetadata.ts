"use client";

import * as React from "react";

import type { ChatParticipant, ChatSession } from "@/components/providers/ChatProvider";
import type { AuthClientUser } from "@/ports/auth-client";
import { formatPresence } from "@/components/chat/conversation/utils";

type ConversationMetadataInput = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  user: Pick<AuthClientUser, "name" | "email" | "avatarUrl"> | null;
};

export function useConversationMetadata({
  session,
  currentUserId,
  selfClientId,
  user,
}: ConversationMetadataInput) {
  const selfIdentifiers = React.useMemo(() => {
    const identifiers = new Set<string>();
    if (currentUserId) identifiers.add(currentUserId);
    if (selfClientId) identifiers.add(selfClientId);
    return identifiers;
  }, [currentUserId, selfClientId]);

  const participantMap = React.useMemo(() => {
    const map = new Map<string, ChatParticipant>();
    session.participants.forEach((participant) => {
      map.set(participant.id, participant);
    });
    return map;
  }, [session.participants]);

  const remoteParticipants = React.useMemo(() => {
    return session.participants.filter((participant) => !selfIdentifiers.has(participant.id));
  }, [selfIdentifiers, session.participants]);

  const selfName = user?.name || user?.email || "You";
  const selfAvatar = user?.avatarUrl || null;

  const lastPresenceSource = session.lastMessageAt ?? session.messages.at(-1)?.sentAt ?? null;
  const presence =
    session.type === "group"
      ? `${session.participants.length} member${session.participants.length === 1 ? "" : "s"}`
      : formatPresence(lastPresenceSource);
  const title = session.title?.trim() || (remoteParticipants[0]?.name ?? "Chat");

  return {
    selfIdentifiers,
    participantMap,
    remoteParticipants,
    selfName,
    selfAvatar,
    presence,
    title,
  };
}
