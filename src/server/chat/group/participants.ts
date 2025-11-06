import {
  mergeParticipantMaps,
  normalizeId,
  toParticipantSummary,
  type ResolvedIdentity,
} from "../utils";
import { fetchUsersByIds } from "../repository";
import type { ChatParticipantSummary } from "../types";
import { ChatServiceError } from "../types";

const DEFAULT_MAX_GROUP_PARTICIPANTS = 50;
const MAX_GROUP_PARTICIPANTS = (() => {
  const raw = process.env.CHAT_GROUP_MAX_PARTICIPANTS;
  if (!raw) return DEFAULT_MAX_GROUP_PARTICIPANTS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 2) return DEFAULT_MAX_GROUP_PARTICIPANTS;
  return Math.floor(parsed);
})();

export function assertGroupParticipantLimit(nextCount: number): void {
  if (nextCount > MAX_GROUP_PARTICIPANTS) {
    throw new ChatServiceError(
      "group_too_large",
      400,
      `Group chats can include at most ${MAX_GROUP_PARTICIPANTS} participants.`,
    );
  }
}

export async function buildGroupParticipantSummaries(
  memberSet: Set<string>,
  fallbackIdentities: Iterable<ResolvedIdentity>,
): Promise<ChatParticipantSummary[]> {
  if (!memberSet.size) return [];
  const participantIds = Array.from(memberSet).filter((id) => Boolean(id?.trim?.()));
  if (!participantIds.length) return [];

  const participantProfiles = await fetchUsersByIds(participantIds);
  const participantMap = new Map(participantProfiles.map((row) => [normalizeId(row.id), row]));
  const fallbackList = Array.from(fallbackIdentities).filter(
    (entry): entry is ResolvedIdentity => Boolean(entry),
  );
  mergeParticipantMaps(participantMap, fallbackList);
  return participantIds
    .map((id) => toParticipantSummary(participantMap.get(id) ?? undefined, id))
    .filter(
      (participant, index, list) =>
        list.findIndex((item) => item.id === participant.id) === index,
    );
}
