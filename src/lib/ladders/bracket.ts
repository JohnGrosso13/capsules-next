import type { CapsuleLadderMember, LadderMatchRecord } from "@/types/ladders";

export type BracketMatch = {
  id: string;
  round: number;
  index: number;
  a: CapsuleLadderMember | null;
  b: CapsuleLadderMember | null;
  winnerId: string | null;
  status: "pending" | "complete" | "bye";
  history?: LadderMatchRecord | null;
  bracket: "winners" | "losers" | "finals";
  aSource?: string | null;
  bSource?: string | null;
};

export type BracketRound = {
  round: number;
  label: string;
  matches: BracketMatch[];
};

export type SingleEliminationBracket = {
  type: "single";
  rounds: BracketRound[];
  championId: string | null;
};

export type DoubleEliminationBracket = {
  type: "double";
  winners: BracketRound[];
  losers: BracketRound[];
  finals: BracketRound[];
  championId: string | null;
};

export type TournamentBracket = SingleEliminationBracket | DoubleEliminationBracket;

type SlotRef = { member: CapsuleLadderMember | null; source: string; sourceId: string };

const bySeed = (a: CapsuleLadderMember, b: CapsuleLadderMember) => {
  const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
  const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
  if (seedA !== seedB) return seedA - seedB;
  return a.displayName.localeCompare(b.displayName);
};

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function findLatestResult(
  history: LadderMatchRecord[],
  aId: string,
  bId: string,
): LadderMatchRecord | null {
  const relevant = history.filter((record) => {
    const challenger = record.challengerId;
    const opponent = record.opponentId;
    return (
      (challenger === aId && opponent === bId) || (challenger === bId && opponent === aId)
    );
  });
  if (!relevant.length) return null;
  return relevant.sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt))[0] ?? null;
}

function getHeadToHead(
  history: LadderMatchRecord[],
  aId: string,
  bId: string,
): LadderMatchRecord[] {
  return history
    .filter((record) => {
      const challenger = record.challengerId;
      const opponent = record.opponentId;
      return (
        (challenger === aId && opponent === bId) || (challenger === bId && opponent === aId)
      );
    })
    .sort((a, b) => Date.parse(a.resolvedAt) - Date.parse(b.resolvedAt));
}

function resolveOutcome(
  a: CapsuleLadderMember | null,
  b: CapsuleLadderMember | null,
  history: LadderMatchRecord[],
  forcedHistory?: LadderMatchRecord | null,
): { winnerId: string | null; status: BracketMatch["status"]; historyResult: LadderMatchRecord | null } {
  let winnerId: string | null = null;
  let status: BracketMatch["status"] = "pending";
  let historyResult: LadderMatchRecord | null = null;

  if (a && !b) {
    winnerId = a.id;
    status = "bye";
  } else if (!a && b) {
    winnerId = b.id;
    status = "bye";
  } else if (a && b) {
    const result = forcedHistory ?? findLatestResult(history, a.id, b.id);
    if (result && result.outcome !== "draw") {
      historyResult = result;
      status = "complete";
      winnerId = result.outcome === "challenger" ? result.challengerId : result.opponentId;
    }
  }

  return { winnerId, status, historyResult };
}

function createMatchFromRefs(
  params: {
    prefix: string;
    round: number;
    index: number;
    bracket: BracketMatch["bracket"];
    aRef: SlotRef | null;
    bRef: SlotRef | null;
    history: LadderMatchRecord[];
    lookup: Map<string, CapsuleLadderMember>;
    forcedHistory?: LadderMatchRecord | null | undefined;
  },
): { match: BracketMatch; winnerRef: SlotRef; loserRef: SlotRef | null } {
  const { prefix, round, index, bracket, aRef, bRef, history, lookup, forcedHistory } = params;
  const a = aRef?.member ?? null;
  const b = bRef?.member ?? null;
  const { winnerId, status, historyResult } = resolveOutcome(a, b, history, forcedHistory);
  const matchId = `${prefix}${round}-m${index + 1}`;
  const winnerMember = winnerId ? lookup.get(winnerId) ?? null : null;
  const loserMember =
    winnerId && a && b ? (winnerId === a.id ? b : a) : null;

  const match: BracketMatch = {
    id: matchId,
    bracket,
    round,
    index,
    a,
    b,
    aSource: a ? null : aRef?.source ?? null,
    bSource: b ? null : bRef?.source ?? null,
    winnerId,
    status,
    history: historyResult,
  };

  const winnerRef: SlotRef = {
    member: winnerMember,
    source: `Winner of ${matchId.toUpperCase()}`,
    sourceId: `winner-${matchId}`,
  };

  const loserRef: SlotRef | null =
    a && b
      ? {
          member: loserMember,
          source: `Loser of ${matchId.toUpperCase()}`,
          sourceId: `loser-${matchId}`,
        }
      : null;

  return { match, winnerRef, loserRef };
}

export function buildSingleEliminationBracket(
  members: CapsuleLadderMember[],
  history: LadderMatchRecord[],
): SingleEliminationBracket {
  if (!members.length) return { type: "single", rounds: [], championId: null };

  const seeded = [...members].sort(bySeed);
  const bracketSize = nextPowerOfTwo(seeded.length);
  const slots: Array<CapsuleLadderMember | null> = Array.from({ length: bracketSize }, () => null);
  seeded.forEach((member, index) => {
    slots[index] = member;
  });

  const rounds: BracketRound[] = [];
  const lookup = new Map<string, CapsuleLadderMember>(members.map((member) => [member.id, member]));
  let championId: string | null = null;
  let currentSlots = slots;
  let roundNumber = 1;

  while (currentSlots.length >= 2) {
    const pairCount = Math.floor(currentSlots.length / 2);
    const matches: BracketMatch[] = [];

    for (let i = 0; i < pairCount; i += 1) {
      const a: SlotRef = {
        member: currentSlots[i] ?? null,
        source: currentSlots[i]?.displayName ?? "TBD",
        sourceId: `seed-${i}`,
      };
      const b: SlotRef = {
        member: currentSlots[currentSlots.length - 1 - i] ?? null,
        source: currentSlots[currentSlots.length - 1 - i]?.displayName ?? "TBD",
        sourceId: `seed-${currentSlots.length - 1 - i}`,
      };
      const { match, winnerRef } = createMatchFromRefs({
        prefix: "w",
        round: roundNumber,
        index: i,
        bracket: "winners",
        aRef: a,
        bRef: b,
        history,
        lookup,
      });
      matches.push(match);
      currentSlots[i] = winnerRef.member;
    }

    rounds.push({
      round: roundNumber,
      label: `Round ${roundNumber}`,
      matches,
    });

    const winnersForNextRound: Array<CapsuleLadderMember | null> = matches.map((match) => {
      if (!match.winnerId) return null;
      const member = seeded.find((entry) => entry.id === match.winnerId);
      return member ?? null;
    });

    if (winnersForNextRound.length === 1) {
      championId = winnersForNextRound[0]?.id ?? null;
      break;
    }

    currentSlots = winnersForNextRound;
    roundNumber += 1;
  }

  return { type: "single", rounds, championId };
}

export function buildDoubleEliminationBracket(
  members: CapsuleLadderMember[],
  history: LadderMatchRecord[],
): DoubleEliminationBracket {
  if (!members.length) return { type: "double", winners: [], losers: [], finals: [], championId: null };

  const seeded = [...members].sort(bySeed);
  const lookup = new Map<string, CapsuleLadderMember>(members.map((member) => [member.id, member]));
  const bracketSize = nextPowerOfTwo(seeded.length);
  const slots: Array<CapsuleLadderMember | null> = Array.from({ length: bracketSize }, () => null);
  seeded.forEach((member, index) => {
    slots[index] = member;
  });

  const winners: BracketRound[] = [];
  const losers: BracketRound[] = [];
  const loserRefsByRound: SlotRef[][] = [];
  const winnerRefsByRound: SlotRef[][] = [];
  let currentSlots = slots;
  let roundNumber = 1;

  // Winners bracket construction
  while (currentSlots.length >= 2) {
    const pairCount = Math.floor(currentSlots.length / 2);
    const matches: BracketMatch[] = [];
    const nextRoundWinners: SlotRef[] = [];
    const loserRefs: SlotRef[] = [];

    for (let i = 0; i < pairCount; i += 1) {
      const aRef: SlotRef = {
        member: currentSlots[i] ?? null,
        source: currentSlots[i]?.displayName ?? "TBD",
        sourceId: `seed-${i}`,
      };
      const bRef: SlotRef = {
        member: currentSlots[currentSlots.length - 1 - i] ?? null,
        source: currentSlots[currentSlots.length - 1 - i]?.displayName ?? "TBD",
        sourceId: `seed-${currentSlots.length - 1 - i}`,
      };
      const { match, winnerRef, loserRef } = createMatchFromRefs({
        prefix: "w",
        round: roundNumber,
        index: i,
        bracket: "winners",
        aRef,
        bRef,
        history,
        lookup,
      });
      matches.push(match);
      nextRoundWinners.push(winnerRef);
      if (loserRef) {
        loserRefs.push(loserRef);
      }
    }

    winners.push({
      round: roundNumber,
      label: `Winners Round ${roundNumber}`,
      matches,
    });
    winnerRefsByRound.push(nextRoundWinners);
    loserRefsByRound.push(loserRefs);
    currentSlots = nextRoundWinners.map((ref) => ref.member);
    roundNumber += 1;
    if (currentSlots.length === 1) break;
  }

  const totalLoserRounds = Math.max(1, (winners.length - 1) * 2);
  let previousWinners: SlotRef[] = [];
  for (let lbRoundIndex = 1; lbRoundIndex <= totalLoserRounds; lbRoundIndex += 1) {
    let sources: SlotRef[] = [];
    const finalLosers = loserRefsByRound[winners.length - 1] ?? [];
    if (lbRoundIndex === 1) {
      sources = loserRefsByRound[0] ?? [];
    } else if (lbRoundIndex === totalLoserRounds) {
      sources = [...previousWinners, ...finalLosers];
    } else if (lbRoundIndex % 2 === 0) {
      const wbRoundIndex = lbRoundIndex / 2;
      sources = [...previousWinners, ...(loserRefsByRound[wbRoundIndex] ?? [])];
    } else {
      sources = [...previousWinners];
    }

    const matches: BracketMatch[] = [];
    const nextWinners: SlotRef[] = [];
    const pool = [...sources];
    let matchIndex = 0;

    while (pool.length > 1) {
      const aRef = pool.shift() ?? null;
      const bRef = pool.shift() ?? null;
      const { match, winnerRef } = createMatchFromRefs({
        prefix: "l",
        round: lbRoundIndex,
        index: matchIndex,
        bracket: "losers",
        aRef,
        bRef,
        history,
        lookup,
      });
      matches.push(match);
      nextWinners.push(winnerRef);
      matchIndex += 1;
    }

    if (pool.length === 1) {
      const byeRef = pool[0]!;
      const { match, winnerRef } = createMatchFromRefs({
        prefix: "l",
        round: lbRoundIndex,
        index: matchIndex,
        bracket: "losers",
        aRef: byeRef,
        bRef: { member: null, source: "Bye", sourceId: "bye" },
        history,
        lookup,
      });
      matches.push(match);
      nextWinners.push(winnerRef);
    }

    losers.push({
      round: lbRoundIndex,
      label: `Elimination Round ${lbRoundIndex}`,
      matches,
    });
    previousWinners = nextWinners;
  }

  // Finals + potential reset
  const wbChampionRef = winnerRefsByRound[winnerRefsByRound.length - 1]?.[0] ?? null;
  const lbChampionRef = previousWinners[0] ?? null;
  const finals: BracketRound[] = [];
  let championId: string | null = null;

  if (wbChampionRef || lbChampionRef) {
    const headToHeadHistory =
      wbChampionRef?.member && lbChampionRef?.member
        ? getHeadToHead(history, wbChampionRef.member.id, lbChampionRef.member.id)
        : [];
    const resetHistory =
      headToHeadHistory.length > 1 ? headToHeadHistory[headToHeadHistory.length - 1] : null;
    const finalHistory =
      headToHeadHistory.length > 1 ? headToHeadHistory[headToHeadHistory.length - 2] : headToHeadHistory[0] ?? null;

    const { match: finalMatch } = createMatchFromRefs({
      prefix: "f",
      round: 1,
      index: 0,
      bracket: "finals",
      aRef: wbChampionRef,
      bRef: lbChampionRef,
      history,
      lookup,
      forcedHistory: finalHistory,
    });

    const finalRoundMatches: BracketMatch[] = [finalMatch];
    let resetMatch: BracketMatch | null = null;

    if (
      (resetHistory ||
        (finalMatch.status === "complete" &&
          lbChampionRef?.member &&
          finalMatch.winnerId === lbChampionRef.member.id))
    ) {
      const { match } = createMatchFromRefs({
        prefix: "f",
        round: resetHistory ? 2 : 2,
        index: 0,
        bracket: "finals",
        aRef: wbChampionRef,
        bRef: lbChampionRef,
        history,
        lookup,
        forcedHistory: resetHistory ?? null,
      });
      resetMatch = match;
      finalRoundMatches.push(match);
    }

    finals.push({
      round: 1,
      label: resetMatch ? "Grand Finals" : "Grand Final",
      matches: finalRoundMatches,
    });

    if (resetMatch && resetMatch.status === "complete") {
      championId = resetMatch.winnerId;
    } else if (finalMatch.status === "complete" && !(resetMatch && resetMatch.status !== "complete" && finalMatch.winnerId === lbChampionRef?.member?.id)) {
      championId = finalMatch.winnerId;
    } else if (wbChampionRef?.member && !lbChampionRef?.member) {
      championId = wbChampionRef.member.id;
    }
  }

  return { type: "double", winners, losers, finals, championId };
}
