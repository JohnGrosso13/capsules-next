import { CapsuleLadderAccessError } from "./errors";
import type {
  CapsuleLadderDetail,
  CapsuleLadderMember,
  LadderChallengeOutcome,
  LadderChallengeResult,
  LadderScoringConfig,
} from "@/types/ladders";

export type ScoringSystem = "simple" | "elo" | "ai" | "points" | "custom";

export const DEFAULT_INITIAL_RATING = 1200;
export const DEFAULT_K_FACTOR = 32;
export const DEFAULT_PLACEMENT_MATCHES = 3;
export const MIN_RATING = 100;
export const MAX_RATING = 4000;

export function normalizeScoringSystem(value: unknown): ScoringSystem {
  if (typeof value !== "string") return "elo";
  const cleaned = value.trim().toLowerCase();
  if (cleaned === "simple" || cleaned === "elo" || cleaned === "ai" || cleaned === "points" || cleaned === "custom") {
    return cleaned as ScoringSystem;
  }
  if (cleaned.includes("ai")) return "ai";
  if (cleaned.includes("simple") || cleaned.includes("casual") || cleaned.includes("points")) return "simple";
  return "elo";
}

export function resolveScoringConfig(
  ladder: CapsuleLadderDetail,
): Required<LadderScoringConfig> & { system: ScoringSystem } {
  const scoring = (ladder.config?.scoring as LadderScoringConfig | undefined) ?? {};
  return {
    system: normalizeScoringSystem(scoring.system),
    initialRating: scoring.initialRating ?? DEFAULT_INITIAL_RATING,
    kFactor: scoring.kFactor ?? DEFAULT_K_FACTOR,
    placementMatches: scoring.placementMatches ?? DEFAULT_PLACEMENT_MATCHES,
    decayPerDay: scoring.decayPerDay ?? 0,
    bonusForStreak: scoring.bonusForStreak ?? 0,
  };
}

export function normalizeRatingValue(value: number | null | undefined, initialRating: number): number {
  const rating = typeof value === "number" && Number.isFinite(value) ? value : initialRating;
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(rating)));
}

export function sortMembersByRating(
  members: CapsuleLadderMember[],
  initialRating: number,
): CapsuleLadderMember[] {
  return [...members]
    .map((member) => ({
      ...member,
      rating: normalizeRatingValue(member.rating, initialRating),
    }))
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if ((b.wins ?? 0) !== (a.wins ?? 0)) return (b.wins ?? 0) - (a.wins ?? 0);
      if ((a.losses ?? 0) !== (b.losses ?? 0)) return (a.losses ?? 0) - (b.losses ?? 0);
      return a.displayName.localeCompare(b.displayName);
    })
    .map((member, index) => ({ ...member, rank: index + 1 }));
}

function sortMembersForRanking(members: CapsuleLadderMember[]): CapsuleLadderMember[] {
  return [...members].sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });
}

export function orderMembersWithSequentialRanks(
  members: CapsuleLadderMember[],
): CapsuleLadderMember[] {
  return sortMembersForRanking(members).map((member, index) => ({
    ...member,
    rank: index + 1,
  }));
}

function applyResultStats(
  member: CapsuleLadderMember,
  result: "win" | "loss" | "draw",
): CapsuleLadderMember {
  const wins = member.wins ?? 0;
  const losses = member.losses ?? 0;
  const draws = member.draws ?? 0;
  const streak = member.streak ?? 0;
  if (result === "win") {
    return {
      ...member,
      wins: wins + 1,
      streak: streak >= 0 ? streak + 1 : 1,
    };
  }
  if (result === "loss") {
    return {
      ...member,
      losses: losses + 1,
      streak: streak <= 0 ? streak - 1 : -1,
    };
  }
  return {
    ...member,
    draws: draws + 1,
    streak: 0,
  };
}

function resolveMemberKFactor(member: CapsuleLadderMember, scoring: Required<LadderScoringConfig>): number {
  const baseK = scoring.kFactor ?? DEFAULT_K_FACTOR;
  const totalMatches = (member.wins ?? 0) + (member.losses ?? 0) + (member.draws ?? 0);
  const placementBoost =
    totalMatches < (scoring.placementMatches ?? DEFAULT_PLACEMENT_MATCHES) ? 1.5 : 1;
  const streak = member.streak ?? 0;
  const streakBonus =
    scoring.bonusForStreak && streak > 1
      ? Math.min(streak, 5) * scoring.bonusForStreak * 0.2
      : 0;
  const adjusted = Math.round(baseK * placementBoost + streakBonus);
  return Math.min(128, Math.max(4, adjusted));
}

function calculateExpectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

export function applyEloOutcome(
  members: CapsuleLadderMember[],
  challengerId: string,
  opponentId: string,
  outcome: LadderChallengeOutcome,
  scoring: Required<LadderScoringConfig>,
): {
  members: CapsuleLadderMember[];
  rankChanges: Array<{ memberId: string; from: number; to: number }>;
  ratingChanges: Array<{ memberId: string; from: number; to: number; delta?: number }>;
} {
  const initialRating = scoring.initialRating ?? DEFAULT_INITIAL_RATING;
  const challenger = members.find((member) => member.id === challengerId);
  const opponent = members.find((member) => member.id === opponentId);
  if (!challenger || !opponent) {
    throw new CapsuleLadderAccessError("invalid", "Both members must exist on this ladder.", 400);
  }

  const baseRatingMap = new Map<string, number>(
    members.map((member) => [member.id, normalizeRatingValue(member.rating, initialRating)]),
  );

  const challengerRating = baseRatingMap.get(challengerId)!;
  const opponentRating = baseRatingMap.get(opponentId)!;

  const challengerScore = outcome === "challenger" ? 1 : outcome === "draw" ? 0.5 : 0;
  const opponentScore = 1 - challengerScore;

  const challengerExpected = calculateExpectedScore(challengerRating, opponentRating);
  const opponentExpected = calculateExpectedScore(opponentRating, challengerRating);

  const challengerDelta = Math.round(
    resolveMemberKFactor(challenger, scoring) * (challengerScore - challengerExpected),
  );
  const opponentDelta = Math.round(
    resolveMemberKFactor(opponent, scoring) * (opponentScore - opponentExpected),
  );

  const nextChallengerRating = normalizeRatingValue(
    challengerRating + challengerDelta,
    initialRating,
  );
  const nextOpponentRating = normalizeRatingValue(opponentRating + opponentDelta, initialRating);

  const updatedMembers = members.map((member) => {
    if (member.id === challengerId) {
      const withStats =
        outcome === "challenger"
          ? applyResultStats(member, "win")
          : outcome === "opponent"
            ? applyResultStats(member, "loss")
            : applyResultStats(member, "draw");
      return { ...withStats, rating: nextChallengerRating };
    }
    if (member.id === opponentId) {
      const withStats =
        outcome === "opponent"
          ? applyResultStats(member, "win")
          : outcome === "challenger"
            ? applyResultStats(member, "loss")
            : applyResultStats(member, "draw");
      return { ...withStats, rating: nextOpponentRating };
    }
    return { ...member, rating: normalizeRatingValue(member.rating, initialRating) };
  });

  const baseRanks = new Map(
    sortMembersByRating(members, initialRating).map((member) => [
      member.id,
      member.rank ?? Number.MAX_SAFE_INTEGER,
    ]),
  );
  const reordered = sortMembersByRating(updatedMembers, initialRating);

  const rankChanges =
    reordered
      .map((member) => {
        const previousRank = baseRanks.get(member.id) ?? member.rank ?? 0;
        if (previousRank !== member.rank) {
          return { memberId: member.id, from: previousRank, to: member.rank ?? previousRank };
        }
        return null;
      })
      .filter(
        (entry): entry is NonNullable<LadderChallengeResult["rankChanges"]>[number] =>
          Boolean(entry),
      ) ?? [];

  const ratingChanges: NonNullable<LadderChallengeResult["ratingChanges"]> = [
    {
      memberId: challengerId,
      from: challengerRating,
      to: nextChallengerRating,
      delta: nextChallengerRating - challengerRating,
    },
    {
      memberId: opponentId,
      from: opponentRating,
      to: nextOpponentRating,
      delta: nextOpponentRating - opponentRating,
    },
  ];

  return { members: reordered, rankChanges, ratingChanges };
}

export function applySimpleOutcome(
  members: CapsuleLadderMember[],
  challengerId: string,
  opponentId: string,
  outcome: LadderChallengeOutcome,
): {
  members: CapsuleLadderMember[];
  rankChanges: Array<{ memberId: string; from: number; to: number }>;
} {
  const ordered = orderMembersWithSequentialRanks(members);
  const challenger = ordered.find((member) => member.id === challengerId);
  const opponent = ordered.find((member) => member.id === opponentId);
  if (!challenger || !opponent) {
    throw new CapsuleLadderAccessError("invalid", "Both challenger and opponent must be on the ladder.", 400);
  }
  const challengerRank = challenger.rank ?? Number.MAX_SAFE_INTEGER;
  const opponentRank = opponent.rank ?? Number.MAX_SAFE_INTEGER;

  const updated = ordered.map((member) => {
    if (member.id === challengerId) {
      if (outcome === "challenger") return applyResultStats(member, "win");
      if (outcome === "opponent") return applyResultStats(member, "loss");
      return applyResultStats(member, "draw");
    }
    if (member.id === opponentId) {
      if (outcome === "opponent") return applyResultStats(member, "win");
      if (outcome === "challenger") return applyResultStats(member, "loss");
      return applyResultStats(member, "draw");
    }
    return member;
  });

  const baseRanks = new Map<string, number>(
    ordered.map((member) => [member.id, member.rank ?? Number.MAX_SAFE_INTEGER]),
  );

  const challengerUpdated = updated.find((member) => member.id === challengerId)!;
  let reordered: CapsuleLadderMember[];

  if (outcome === "challenger" && challengerRank > opponentRank) {
    const gap = challengerRank - opponentRank;
    const hop = Math.ceil(gap / 2);
    const targetRank = Math.max(opponentRank + 1, challengerRank - hop);
    const withoutChallenger = updated.filter((member) => member.id !== challengerId);
    const insertIndex = Math.max(0, targetRank - 1);
    withoutChallenger.splice(insertIndex, 0, challengerUpdated);
    reordered = withoutChallenger.map((member, index) => ({ ...member, rank: index + 1 }));
  } else {
    reordered = updated.map((member, index) => ({ ...member, rank: index + 1 }));
  }

  const rankChanges =
    reordered
      .map((member) => {
        const previousRank = baseRanks.get(member.id) ?? member.rank ?? 0;
        if (previousRank !== member.rank) {
          return { memberId: member.id, from: previousRank, to: member.rank ?? previousRank };
        }
        return null;
      })
      .filter(
        (entry): entry is NonNullable<LadderChallengeResult["rankChanges"]>[number] =>
          Boolean(entry),
      ) ?? [];

  return { members: reordered, rankChanges };
}

export function ensureChallengeScoring(ladder: CapsuleLadderDetail): Extract<ScoringSystem, "simple" | "elo"> {
  const { system } = resolveScoringConfig(ladder);
  if (system !== "simple" && system !== "elo") {
    throw new CapsuleLadderAccessError(
      "invalid",
      "Challenges are only enabled for simple or Elo ladders right now.",
      400,
    );
  }
  return system;
}
