import type { ChatParticipant } from "@/components/providers/ChatProvider";

export type ParticipantProfile = {
  name?: string | null;
  avatar?: string | null;
};

export function looksLikeIdentifier(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.length >= 24 && /^[0-9a-f-]+$/i.test(trimmed);
}

export function formatIdentifierForDisplay(
  value: string | null | undefined,
  fallbackLabel = "Unknown user",
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return fallbackLabel;
  if (!looksLikeIdentifier(trimmed)) return trimmed;
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `User ${prefix}...${suffix}`;
}

export function resolveDisplayName({
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

export function applyParticipantDisplay(
  participant: ChatParticipant,
  profile?: ParticipantProfile | null,
): ChatParticipant {
  const name = resolveDisplayName({
    participantName: participant.name,
    friendName: profile?.name ?? null,
    fallback: participant.id,
  });
  const avatar = participant.avatar ?? profile?.avatar ?? null;
  if (name === participant.name && avatar === participant.avatar) {
    return participant;
  }
  return {
    ...participant,
    name,
    avatar,
  };
}
