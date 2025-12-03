import { randomUUID } from "crypto";

import { notifyLadderChallenge } from "@/server/notifications/triggers";
import type {
  CapsuleLadderDetail,
  CapsuleLadderMember,
  CapsuleLadderMemberInput,
  LadderChallenge,
  LadderChallengeOutcome,
  LadderChallengeResult,
  LadderMatchRecord,
  LadderStateMeta,
} from "@/types/ladders";

import { CapsuleLadderAccessError } from "./errors";
import {
  normalizeId,
  sanitizeChallenge,
  sanitizeMatchRecord,
  sanitizeText,
} from "./sanitizers";
import {
  DEFAULT_INITIAL_RATING,
  applyEloOutcome,
  applySimpleOutcome,
  ensureChallengeScoring,
  orderMembersWithSequentialRanks,
  resolveScoringConfig,
  sortMembersByRating,
} from "./scoring";
import {
  getCapsuleLadderRecordById,
  listCapsuleLadderMemberRecords,
  replaceCapsuleLadderMemberRecords,
  updateCapsuleLadderRecord,
} from "./repository";
import {
  MANAGER_ROLES,
  canViewerAccessLadder,
  resolveCapsuleViewer,
  type CapsuleViewerContext,
} from "./access";

function assertChallengePermissions(
  ladder: CapsuleLadderDetail,
  viewer: CapsuleViewerContext,
): void {
  const isManager = viewer.isOwner || (viewer.role && MANAGER_ROLES.has(viewer.role));
  if (!viewer.viewerId) {
    throw new CapsuleLadderAccessError("forbidden", "Sign in to manage challenges.", 403);
  }
  if (!isManager && !viewer.isMember) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "Join this capsule to issue challenges.",
      403,
    );
  }
  if (!canViewerAccessLadder(ladder, viewer, false)) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You do not have permission to manage this ladder.",
      403,
    );
  }
}

function readLadderState(
  ladder: CapsuleLadderDetail,
): { metaRoot: Record<string, unknown>; state: { challenges: LadderChallenge[]; history: LadderMatchRecord[] } } {
  const metaRoot = ladder.meta && typeof ladder.meta === "object" && !Array.isArray(ladder.meta)
    ? ({ ...ladder.meta } as Record<string, unknown>)
    : {};
  const stateSource = metaRoot.ladderState && typeof metaRoot.ladderState === "object"
    ? (metaRoot.ladderState as Record<string, unknown>)
    : metaRoot.state && typeof metaRoot.state === "object"
      ? (metaRoot.state as Record<string, unknown>)
      : {};
  const rawChallenges = Array.isArray((stateSource as LadderStateMeta).challenges)
    ? ((stateSource as LadderStateMeta).challenges as unknown[])
    : [];
  const rawHistory = Array.isArray((stateSource as LadderStateMeta).history)
    ? ((stateSource as LadderStateMeta).history as unknown[])
    : [];

  const challenges = rawChallenges
    .map((entry) => sanitizeChallenge(entry, ladder.id))
    .filter((entry): entry is LadderChallenge => Boolean(entry));
  const history = rawHistory
    .map((entry) => sanitizeMatchRecord(entry, ladder.id))
    .filter((entry): entry is LadderMatchRecord => Boolean(entry));

  return {
    metaRoot,
    state: { challenges, history },
  };
}

function toMemberInput(member: CapsuleLadderMember): CapsuleLadderMemberInput {
  const input: CapsuleLadderMemberInput = {
    displayName: member.displayName,
    rank: member.rank ?? null,
    rating: member.rating ?? 0,
    wins: member.wins ?? 0,
    losses: member.losses ?? 0,
    draws: member.draws ?? 0,
    streak: member.streak ?? 0,
  };
  if (member.userId !== undefined) input.userId = member.userId ?? null;
  if (member.handle !== undefined) input.handle = member.handle ?? null;
  if (member.seed !== undefined) input.seed = member.seed ?? null;
  if (member.metadata !== undefined) input.metadata = member.metadata ?? null;
  return input;
}

export async function listLadderChallengesForViewer(
  ladderId: string,
  viewerId: string | null,
): Promise<{ challenges: LadderChallenge[]; history: LadderMatchRecord[]; ladder: CapsuleLadderDetail }> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  const viewer = await resolveCapsuleViewer(ladder.capsuleId, viewerId);
  if (!canViewerAccessLadder(ladder, viewer, false)) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You do not have permission to view this ladder.",
      403,
    );
  }
  const { state } = readLadderState(ladder);
  return { challenges: state.challenges, history: state.history, ladder };
}

export async function createLadderChallenge(
  actorId: string,
  ladderId: string,
  payload: { challengerId: string; opponentId: string; note?: string | null },
): Promise<{ challenge: LadderChallenge; ladder: CapsuleLadderDetail }> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  if (ladder.status !== "active") {
    throw new CapsuleLadderAccessError(
      "invalid",
      "Challenges can only be created on active ladders.",
      400,
    );
  }
  const viewer = await resolveCapsuleViewer(ladder.capsuleId, actorId);
  assertChallengePermissions(ladder, viewer);
  const scoring = resolveScoringConfig(ladder);
  const system = ensureChallengeScoring(ladder);

  const challengerId = normalizeId(payload.challengerId);
  const opponentId = normalizeId(payload.opponentId);
  if (!challengerId || !opponentId || challengerId === opponentId) {
    throw new CapsuleLadderAccessError(
      "invalid",
      "Select two different ladder members to create a challenge.",
      400,
    );
  }

  const memberRecords = await listCapsuleLadderMemberRecords(ladder.id);
  const members =
    system === "elo"
      ? sortMembersByRating(memberRecords, scoring.initialRating ?? DEFAULT_INITIAL_RATING)
      : orderMembersWithSequentialRanks(memberRecords);
  const challenger = members.find((member) => member.id === challengerId);
  const opponent = members.find((member) => member.id === opponentId);
  if (!challenger || !opponent) {
    throw new CapsuleLadderAccessError("invalid", "Both members must exist on this ladder.", 400);
  }
  if (system === "simple") {
    const challengerRank = challenger.rank ?? Number.MAX_SAFE_INTEGER;
    const opponentRank = opponent.rank ?? Number.MAX_SAFE_INTEGER;
    if (challengerRank <= opponentRank) {
      throw new CapsuleLadderAccessError(
        "invalid",
        "Challenger must target someone ranked above them.",
        400,
      );
    }
  }

  const now = new Date().toISOString();
  const note = payload.note ? sanitizeText(payload.note, 240, null) : null;

  const challenge: LadderChallenge = {
    id: randomUUID(),
    ladderId: ladder.id,
    challengerId,
    opponentId,
    createdAt: now,
    createdById: viewer.viewerId,
    status: "pending",
    note: note ?? null,
  };

  const snapshot = readLadderState(ladder);
  const existing = snapshot.state.challenges.filter(
    (entry) => !(entry.challengerId === challengerId && entry.opponentId === opponentId && entry.status === "pending"),
  );
  snapshot.state.challenges = [challenge, ...existing].slice(0, 30);
  snapshot.metaRoot.ladderState = {
    ...(snapshot.metaRoot.ladderState as Record<string, unknown>),
    challenges: snapshot.state.challenges,
    history: snapshot.state.history,
  };

  const updatedLadder = await updateCapsuleLadderRecord(ladder.id, {
    meta: snapshot.metaRoot as LadderStateMeta,
  });

  const ladderForNotification = updatedLadder ?? ladder;
  void notifyLadderChallenge({
    ladder: ladderForNotification,
    challenge,
    members,
    actorId,
  });

  return { challenge, ladder: ladderForNotification };
}

export async function resolveLadderChallenge(
  actorId: string,
  ladderId: string,
  challengeId: string,
  outcome: LadderChallengeOutcome,
  note?: string | null,
): Promise<{
  challenge: LadderChallenge;
  members: CapsuleLadderMember[];
  history: LadderMatchRecord[];
}> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  const viewer = await resolveCapsuleViewer(ladder.capsuleId, actorId);
  assertChallengePermissions(ladder, viewer);
  const system = ensureChallengeScoring(ladder);
  const scoring = resolveScoringConfig(ladder);

  const snapshot = readLadderState(ladder);
  const challengeIndex = snapshot.state.challenges.findIndex((entry) => entry.id === challengeId);
  if (challengeIndex === -1) {
    throw new CapsuleLadderAccessError("not_found", "Challenge not found.", 404);
  }
  const challenge = snapshot.state.challenges[challengeIndex];
  if (!challenge) {
    throw new CapsuleLadderAccessError("not_found", "Challenge not found.", 404);
  }
  if (challenge.status === "resolved") {
    return { challenge, members: await listCapsuleLadderMemberRecords(ladder.id), history: snapshot.state.history };
  }

  const members = await listCapsuleLadderMemberRecords(ladder.id);
  const outcomeResult =
    system === "simple"
      ? applySimpleOutcome(members, challenge.challengerId, challenge.opponentId, outcome)
      : applyEloOutcome(
          members,
          challenge.challengerId,
          challenge.opponentId,
          outcome,
          scoring,
        );
  const rankChanges = outcomeResult.rankChanges ?? [];
  const ratingChanges =
    (outcomeResult as { ratingChanges?: NonNullable<LadderChallengeResult["ratingChanges"]> }).ratingChanges ?? [];
  const reordered = outcomeResult.members;
  const persistedMembers = await replaceCapsuleLadderMemberRecords(
    ladder.id,
    reordered.map(toMemberInput),
  );

  const resolvedAt = new Date().toISOString();
  const sanitizedNote = note ? sanitizeText(note, 240, null) : null;

  const historyRecord: LadderMatchRecord = {
    id: randomUUID(),
    ladderId: ladder.id,
    challengeId: challenge.id,
    challengerId: challenge.challengerId,
    opponentId: challenge.opponentId,
    outcome,
    resolvedAt,
    note: sanitizedNote ?? challenge.note ?? null,
  };
  if (rankChanges.length) {
    historyRecord.rankChanges = rankChanges;
  }
  if (ratingChanges.length) {
    historyRecord.ratingChanges = ratingChanges;
  }

  snapshot.state.history = [historyRecord, ...snapshot.state.history].slice(0, 50);
  snapshot.state.challenges[challengeIndex] = {
    ...challenge,
    status: "resolved",
    result: {
      outcome,
      reportedAt: resolvedAt,
      reportedById: viewer.viewerId,
      note: sanitizedNote ?? null,
    },
  };
  if (rankChanges.length) {
    snapshot.state.challenges[challengeIndex]!.result!.rankChanges = rankChanges;
  }
  if (ratingChanges.length) {
    snapshot.state.challenges[challengeIndex]!.result!.ratingChanges = ratingChanges;
  }

  snapshot.metaRoot.ladderState = {
    ...(snapshot.metaRoot.ladderState as Record<string, unknown>),
    challenges: snapshot.state.challenges,
    history: snapshot.state.history,
  };

  await updateCapsuleLadderRecord(ladder.id, {
    meta: snapshot.metaRoot as LadderStateMeta,
  });

  return {
    challenge: snapshot.state.challenges[challengeIndex]!,
    members: persistedMembers,
    history: snapshot.state.history,
  };
}
