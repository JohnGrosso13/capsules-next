"use client";

import * as React from "react";

import type { ChatParticipant, ChatSession } from "@/components/providers/ChatProvider";
import type { AuthClientUser } from "@/ports/auth-client";
import { formatPresence } from "@/components/chat/conversation/utils";
import {
  applyParticipantDisplay,
  formatIdentifierForDisplay,
  looksLikeIdentifier,
  type ParticipantProfile,
} from "../display";

type ConversationMetadataInput = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  user: Pick<AuthClientUser, "name" | "email" | "avatarUrl"> | null;
  friendLookup?: Map<string, ParticipantProfile>;
};

export function useConversationMetadata({
  session,
  currentUserId,
  selfClientId,
  user,
  friendLookup,
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
      if (!participant?.id) return;
      const friendProfile = friendLookup?.get(participant.id) ?? null;
      const normalized = applyParticipantDisplay(participant, friendProfile);
      map.set(participant.id, normalized);
    });
    return map;
  }, [session.participants, friendLookup]);

  const remoteParticipants = React.useMemo(() => {
    return session.participants
      .filter((participant) => !selfIdentifiers.has(participant.id))
      .map((participant) => participantMap.get(participant.id) ?? participant);
  }, [participantMap, selfIdentifiers, session.participants]);

  const selfName = user?.name || user?.email || "You";
  const selfAvatar = user?.avatarUrl || null;

  const lastPresenceSource = session.lastMessageAt ?? session.messages.at(-1)?.sentAt ?? null;
  const presence =
    session.type === "group"
      ? `${session.participants.length} member${session.participants.length === 1 ? "" : "s"}`
      : formatPresence(lastPresenceSource);
  const rawTitle = session.title?.trim() ?? "";
  const titleSource =
    rawTitle && !looksLikeIdentifier(rawTitle) ? rawTitle : remoteParticipants[0]?.name ?? null;
  const title = titleSource
    ? formatIdentifierForDisplay(titleSource)
    : formatIdentifierForDisplay(session.id);

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
