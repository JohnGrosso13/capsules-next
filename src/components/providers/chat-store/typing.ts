import type { ChatParticipant } from "@/lib/chat/events";

import { typingKey } from "@/components/providers/chat-store/helpers";

export type TypingEntry = {
  participant: ChatParticipant;
  expiresAt: number;
};

export type TypingState = Record<string, TypingEntry>;

export type TypingSnapshot = {
  participants: ChatParticipant[];
  typing: TypingState;
  changed: boolean;
};

export const TYPING_TTL_MS = 6000;
export const TYPING_MIN_DURATION_MS = 1500;

export function pruneTypingEntries(state: TypingState, now: number): TypingSnapshot {
  let changed = false;
  const nextState: TypingState = {};

  Object.entries(state).forEach(([key, entry]) => {
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
      changed = true;
      return;
    }
    nextState[key] = entry;
  });

  if (!changed) {
    return {
      participants: collectTypingParticipants(nextState),
      typing: state,
      changed: false,
    };
  }

  return {
    participants: collectTypingParticipants(nextState),
    typing: nextState,
    changed: true,
  };
}

export function collectTypingParticipants(state: TypingState): ChatParticipant[] {
  const participants = Object.values(state)
    .map((entry) => entry?.participant)
    .filter((participant): participant is ChatParticipant => Boolean(participant));

  const unique = new Map<string, ChatParticipant>();
  participants.forEach((participant) => {
    const key = typingKey(participant.id) ?? participant.id;
    if (!key) return;
    if (!unique.has(key)) {
      unique.set(key, { ...participant });
    }
  });

  return Array.from(unique.values());
}

export function collectTypingSnapshot(
  state: TypingState,
  now: number,
  options: { selfIds: Set<string> },
): TypingSnapshot {
  const seen = new Set<string>();
  const selfKeys = new Set(
    Array.from(options.selfIds, (id) => typingKey(id)).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  );

  const nextState: TypingState = {};
  const participants: ChatParticipant[] = [];
  let changed = false;

  Object.entries(state).forEach(([key, entry]) => {
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
      changed = true;
      return;
    }
    const participantKey = typingKey(entry.participant?.id ?? key);
    if (!participantKey) {
      changed = true;
      return;
    }
    if (selfKeys.has(participantKey)) {
      changed = true;
      return;
    }
    if (seen.has(participantKey)) {
      return;
    }
    seen.add(participantKey);
    participants.push({ ...entry.participant });
    nextState[participantKey] = {
      participant: { ...entry.participant },
      expiresAt: entry.expiresAt,
    };
  });

  if (!changed && participants.length === Object.keys(state).length) {
    return {
      participants,
      typing: state,
      changed: false,
    };
  }

  return {
    participants,
    typing: nextState,
    changed: true,
  };
}

