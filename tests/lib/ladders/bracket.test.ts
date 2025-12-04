import { describe, expect, it } from "vitest";

import {
  buildDoubleEliminationBracket,
  buildSingleEliminationBracket,
} from "@/lib/ladders/bracket";
import type { CapsuleLadderMember, LadderMatchRecord } from "@/types/ladders";

const makeMember = (id: string, seed: number): CapsuleLadderMember => ({
  id,
  ladderId: "ladder-1",
  userId: null,
  displayName: `Player ${seed}`,
  handle: null,
  seed,
  rank: seed,
  rating: 1200,
  wins: 0,
  losses: 0,
  draws: 0,
  streak: 0,
  metadata: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
});

const makeResult = (
  id: string,
  challengerId: string,
  opponentId: string,
  outcome: LadderMatchRecord["outcome"],
  resolvedAt: string,
): LadderMatchRecord => ({
  id,
  ladderId: "ladder-1",
  challengeId: null,
  challengerId,
  opponentId,
  outcome,
  resolvedAt,
  note: null,
});

describe("tournament brackets", () => {
  it("keeps single elimination structure intact", () => {
    const members = [makeMember("m1", 1), makeMember("m2", 2)];
    const history: LadderMatchRecord[] = [
      makeResult("h1", "m1", "m2", "challenger", "2024-01-02T00:00:00.000Z"),
    ];
    const bracket = buildSingleEliminationBracket(members, history);
    expect(bracket.type).toBe("single");
    expect(bracket.rounds).toHaveLength(1);
    expect(bracket.rounds[0]?.matches[0]?.winnerId).toBe("m1");
    expect(bracket.championId).toBe("m1");
  });

  it("maps double elimination rounds with winners dropping correctly", () => {
    const members = [makeMember("m1", 1), makeMember("m2", 2), makeMember("m3", 3), makeMember("m4", 4)];
    const history: LadderMatchRecord[] = [
      // Winners round 1
      makeResult("h1", "m1", "m4", "challenger", "2024-01-02T00:00:00.000Z"),
      makeResult("h2", "m2", "m3", "opponent", "2024-01-02T00:05:00.000Z"), // m3 wins
      // Winners final (m1 vs m3)
      makeResult("h3", "m1", "m3", "challenger", "2024-01-02T00:10:00.000Z"),
      // Losers round: m4 vs m2
      makeResult("h4", "m2", "m4", "challenger", "2024-01-02T00:15:00.000Z"),
      // Losers final: m3 (from winners loss) vs m2
      makeResult("h5", "m3", "m2", "challenger", "2024-01-02T00:20:00.000Z"),
      // Grand final: m1 vs m3
      makeResult("h6", "m1", "m3", "challenger", "2024-01-02T00:30:00.000Z"),
    ];

    const bracket = buildDoubleEliminationBracket(members, history);
    expect(bracket.type).toBe("double");
    expect(bracket.winners).toHaveLength(2);
    expect(bracket.losers).toHaveLength(2);
    expect(bracket.finals).toHaveLength(1);
    expect(bracket.championId).toBe("m1");

    const losersFinal = bracket.losers[1]?.matches[0];
    const finalsMatch = bracket.finals[0]?.matches[0];

    expect(losersFinal?.a?.id === "m3" || losersFinal?.b?.id === "m3").toBe(true);
    expect(finalsMatch?.a?.id === "m1" || finalsMatch?.b?.id === "m1").toBe(true);
  });
});
