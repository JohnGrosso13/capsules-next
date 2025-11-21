"use client";

import * as React from "react";

import type { ChatParticipant, ChatSession } from "@/components/providers/ChatProvider";
import type { AuthClientUser } from "@/ports/auth-client";
import { formatPresence } from "@/components/chat/conversation/utils";

type FriendProfile = {
  name: string;
  avatar: string | null;
};

type ConversationMetadataInput = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  user: Pick<AuthClientUser, "name" | "email" | "avatarUrl"> | null;
  friendLookup?: Map<string, FriendProfile>;
};

function looksLikeIdentifier(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.length >= 24 && /^[0-9a-f-]+$/i.test(trimmed);
}

function formatIdentifierForDisplay(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "Unknown user";
  if (!looksLikeIdentifier(trimmed)) return trimmed;
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `User ${prefix}...${suffix}`;
}

function resolveDisplayName({
  participantName,
  fallback,
  friendName,
}: {
  participantName?: string | null;
  fallback: string;
  friendName?: string | null;
}): string {
  const friendCandidate = friendName?.trim();
  if (friendCandidate) {
    return friendCandidate;
  }
  const participantCandidate = participantName?.trim();
  if (participantCandidate && !looksLikeIdentifier(participantCandidate)) {
    return participantCandidate;
  }
  return formatIdentifierForDisplay(fallback);
}

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
      const friendProfile = friendLookup?.get(participant.id);
      const normalized: ChatParticipant = {
        ...participant,
        name: resolveDisplayName({
          participantName: participant.name,
          friendName: friendProfile?.name ?? null,
          fallback: participant.id,
        }),
        avatar: participant.avatar ?? friendProfile?.avatar ?? null,
      };
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
  const resolvedTitle = session.title?.trim() || remoteParticipants[0]?.name || null;
  const title = resolvedTitle
    ? formatIdentifierForDisplay(resolvedTitle)
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
