import { describe, it, expect } from "vitest";

import { buildSingleEliminationBracket } from "@/lib/ladders/bracket";
import type { CapsuleLadderMember, LadderMatchRecord } from "@/types/ladders";

const mkMember = (id: string, seed: number): CapsuleLadderMember => ({
  id,
  ladderId: "ladder-1",
  userId: null,
  displayName: `Player ${id}`,
  handle: null,
  status: "active",
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

describe("buildSingleEliminationBracket", () => {
  it("seeds entrants, applies history, and surfaces champion", () => {
    const members = [mkMember("a", 1), mkMember("b", 2), mkMember("c", 3), mkMember("d", 4)];
    const history: LadderMatchRecord[] = [
      {
        id: "h1",
        ladderId: "ladder-1",
        challengeId: null,
        challengerId: "a",
        opponentId: "d",
        outcome: "challenger",
        resolvedAt: "2024-01-02T00:00:00.000Z",
      },
      {
        id: "h2",
        ladderId: "ladder-1",
        challengeId: null,
        challengerId: "b",
        opponentId: "c",
        outcome: "opponent",
        resolvedAt: "2024-01-02T00:00:01.000Z",
      },
      {
        id: "h3",
        ladderId: "ladder-1",
        challengeId: null,
        challengerId: "a",
        opponentId: "c",
        outcome: "challenger",
        resolvedAt: "2024-01-03T00:00:00.000Z",
      },
    ];

    const bracket = buildSingleEliminationBracket(members, history);

    expect(bracket.championId).toBe("a");
    expect(bracket.rounds).toHaveLength(2);
    const round1 = bracket.rounds[0]!;
    const finals = bracket.rounds[1]!;
    expect(round1.matches).toHaveLength(2);
    expect(round1.matches[0]!.winnerId).toBe("a");
    expect(round1.matches[1]!.winnerId).toBe("c");
    expect(finals.matches[0]!.winnerId).toBe("a");
  });

  it("fills byes when entrants are not a power of two", () => {
    const members = [mkMember("a", 1), mkMember("b", 2), mkMember("c", 3)];
    const bracket = buildSingleEliminationBracket(members, []);

    const firstRound = bracket.rounds[0]!;
    expect(firstRound.matches).toHaveLength(2); // 3 entrants => bracket of 4
    const byeMatch = firstRound.matches.find((m) => !m.b || !m.a);
    expect(byeMatch?.status).toBe("bye");
    const finals = bracket.rounds[1]!;
    expect(finals.matches[0]!.status).toBe("bye");
  });
});
