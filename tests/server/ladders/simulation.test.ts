import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  buildDoubleEliminationBracket,
  buildRoundRobinBracket,
  buildSingleEliminationBracket,
} from "@/lib/ladders/bracket";
import { createLadderChallenge, resolveLadderChallenge } from "@/server/ladders/service";
import type { CapsuleLadderDetail, CapsuleLadderMember, LadderMatchRecord } from "@/types/ladders";

let uuidQueue: string[] = [];

// Keep deterministic IDs for challenges/history.
vi.mock("crypto", async (importOriginal) => {
  const mod = await importOriginal<typeof import("crypto")>();
  return { ...mod, randomUUID: () => uuidQueue.shift() ?? "uuid-fallback" };
});
vi.mock("node:crypto", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:crypto")>();
  return { ...mod, randomUUID: () => uuidQueue.shift() ?? "uuid-fallback" };
});

// Avoid hitting real notification pipelines.
vi.mock("@/server/notifications/triggers", () => ({
  notifyLadderChallenge: vi.fn(),
  notifyLadderChallengeResolved: vi.fn(),
  notifyLadderChallengeVoid: vi.fn(),
}));

// Relax ladder access so we can simulate with a single actor.
vi.mock("@/server/ladders/access", () => ({
  resolveCapsuleViewer: vi.fn(async (_capsuleId: string, viewerId: string) => ({
    capsuleId: "capsule-1",
    viewerId,
    role: "member",
    isOwner: false,
    isMember: true,
  })),
  canViewerAccessLadder: vi.fn(() => true),
  MANAGER_ROLES: new Set(["owner", "manager", "member"]),
}));

// In-memory stores act as the ladder + roster backing the repository mock.
const ladderStore = new Map<string, CapsuleLadderDetail>();
const memberStore = new Map<string, CapsuleLadderMember[]>();
const nowIso = () => new Date().toISOString();

type UpdateArgs = Parameters<
  typeof import("@/server/ladders/repository").updateCapsuleLadderRecord
>[2];

vi.mock("@/server/ladders/repository", () => ({
  insertCapsuleLadderRecord: vi.fn(),
  updateCapsuleLadderRecord: vi.fn(
    async (ladderId: string, patch: Partial<CapsuleLadderDetail>, options?: UpdateArgs) => {
      const current = ladderStore.get(ladderId);
      if (!current) return null;
      if (options?.expectedUpdatedAt && current.updatedAt !== options.expectedUpdatedAt) {
        return null;
      }
      const updated: CapsuleLadderDetail = {
        ...current,
        ...patch,
        updatedAt: nowIso(),
      };
      ladderStore.set(ladderId, updated);
      return updated;
    },
  ),
  getCapsuleLadderRecordById: vi.fn(async (ladderId: string) => ladderStore.get(ladderId) ?? null),
  listCapsuleLadderMemberRecords: vi.fn(async (ladderId: string) =>
    (memberStore.get(ladderId) ?? []).map((member) => ({ ...member })),
  ),
  replaceCapsuleLadderMemberRecords: vi.fn(
    async (ladderId: string, inputs: Array<Omit<CapsuleLadderMember, "id" | "createdAt" | "updatedAt">>) => {
      const existing = memberStore.get(ladderId) ?? [];
      const updated = inputs.map((input, index) => {
        const match =
          existing.find((member) => member.displayName === input.displayName) ??
          existing[index] ??
          {
            id: `m-${index + 1}`,
            createdAt: nowIso(),
          };
        return {
          ...match,
          ...input,
          ladderId,
          rank: typeof input.rank === "number" ? input.rank : index + 1,
          rating: typeof input.rating === "number" ? input.rating : 1200,
          wins: typeof input.wins === "number" ? input.wins : 0,
          losses: typeof input.losses === "number" ? input.losses : 0,
          draws: typeof input.draws === "number" ? input.draws : 0,
          streak: typeof input.streak === "number" ? input.streak : 0,
          updatedAt: nowIso(),
          createdAt: match.createdAt ?? nowIso(),
        };
      });
      memberStore.set(ladderId, updated);
      return updated;
    },
  ),
}));

const baseLadder: CapsuleLadderDetail = {
  id: "ladder-1",
  capsuleId: "capsule-1",
  name: "Simulated Ladder",
  slug: null,
  summary: null,
  status: "active",
  visibility: "capsule",
  createdById: "owner-1",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  publishedAt: null,
  publishedById: null,
  game: { title: "Game" },
  config: { scoring: { system: "elo", initialRating: 1200, kFactor: 32 } },
  sections: {},
  aiPlan: null,
  meta: {},
};

const seedMembers = (members: Array<Omit<CapsuleLadderMember, "ladderId">>) => {
  memberStore.set(
    "ladder-1",
    members.map((member) => ({
      ...member,
      ladderId: "ladder-1",
      createdAt: member.createdAt ?? "2024-01-01T00:00:00.000Z",
      updatedAt: member.updatedAt ?? "2024-01-01T00:00:00.000Z",
    })),
  );
};

const buildMember = (id: string, seed: number): CapsuleLadderMember => ({
  id,
  ladderId: "ladder-1",
  userId: null,
  displayName: `Member ${seed}`,
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

describe("ladder + tournament simulation harness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-01T00:00:00.000Z"));
    uuidQueue = ["challenge-1", "history-1", "challenge-2", "history-2", "challenge-3", "history-3", "challenge-4", "history-4"];
    ladderStore.clear();
    memberStore.clear();
    ladderStore.set("ladder-1", { ...baseLadder });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const playMatch = async (challengerId: string, opponentId: string, outcome: "challenger" | "opponent") => {
    const { challenge } = await createLadderChallenge("user-1", "ladder-1", {
      challengerId,
      opponentId,
    });
    const result = await resolveLadderChallenge("user-1", "ladder-1", challenge.id, outcome);
    return result;
  };

  it("runs a multi-match Elo ladder and preserves standings + history", async () => {
    seedMembers([buildMember("m1", 1), buildMember("m2", 2), buildMember("m3", 3), buildMember("m4", 4)]);

    await playMatch("m3", "m1", "challenger"); // upset win
    await playMatch("m4", "m2", "challenger");
    await playMatch("m4", "m3", "challenger");
    await playMatch("m4", "m1", "challenger");

    const standings = memberStore.get("ladder-1")!;
    expect(standings).toHaveLength(4);
    expect(standings.map((member) => member.rank)).toEqual([1, 2, 3, 4]);
    const top = standings[0]!;
    expect(top).toMatchObject({ id: "m4", wins: 3, losses: 0 });
    expect(top.rating).toBeGreaterThan(1200);
    expect(standings[standings.length - 1]?.rating ?? 0).toBeLessThan(1200);
    for (let i = 1; i < standings.length; i += 1) {
      expect(standings[i - 1]?.rating ?? 0).toBeGreaterThanOrEqual(standings[i]?.rating ?? 0);
    }

    const ladder = ladderStore.get("ladder-1")!;
    const state = (ladder.meta as { ladderState?: { challenges?: Array<{ id: string; status: string }>; history?: LadderMatchRecord[] } }).ladderState;
    expect(state?.history?.length).toBe(4);
    expect(state?.challenges?.every((entry) => entry.status === "resolved")).toBe(true);
  });

  it("builds a single-elimination bracket snapshot from simulated results", () => {
    const members = [
      buildMember("m1", 1),
      buildMember("m2", 2),
      buildMember("m3", 3),
      buildMember("m4", 4),
      buildMember("m5", 5),
      buildMember("m6", 6),
      buildMember("m7", 7),
      buildMember("m8", 8),
    ];
    const history: LadderMatchRecord[] = [
      // Round 1 (mirror seeding: 1v8, 2v7, 3v6, 4v5)
      { id: "h1", ladderId: "ladder-1", challengeId: null, challengerId: "m1", opponentId: "m8", outcome: "challenger", resolvedAt: "2024-02-01T00:00:00.000Z" },
      { id: "h2", ladderId: "ladder-1", challengeId: null, challengerId: "m2", opponentId: "m7", outcome: "challenger", resolvedAt: "2024-02-01T00:05:00.000Z" },
      { id: "h3", ladderId: "ladder-1", challengeId: null, challengerId: "m3", opponentId: "m6", outcome: "challenger", resolvedAt: "2024-02-01T00:10:00.000Z" },
      { id: "h4", ladderId: "ladder-1", challengeId: null, challengerId: "m4", opponentId: "m5", outcome: "challenger", resolvedAt: "2024-02-01T00:15:00.000Z" },
      // Round 2 (winners of 1v8 vs 4v5, winners of 2v7 vs 3v6)
      { id: "h5", ladderId: "ladder-1", challengeId: null, challengerId: "m1", opponentId: "m4", outcome: "challenger", resolvedAt: "2024-02-01T00:20:00.000Z" },
      { id: "h6", ladderId: "ladder-1", challengeId: null, challengerId: "m2", opponentId: "m3", outcome: "opponent", resolvedAt: "2024-02-01T00:25:00.000Z" },
      // Final (m1 vs m3)
      { id: "h7", ladderId: "ladder-1", challengeId: null, challengerId: "m1", opponentId: "m3", outcome: "challenger", resolvedAt: "2024-02-01T00:30:00.000Z" },
    ];

    const bracket = buildSingleEliminationBracket(members, history);

    expect(bracket.type).toBe("single");
    expect(bracket.rounds).toHaveLength(3);
    expect(bracket.championId).toBe("m1");

    const finals = bracket.rounds[2]?.matches[0];
    expect(finals?.winnerId).toBe("m1");
    expect(finals?.status).toBe("complete");
  });

  it("builds a double-elimination bracket with winners dropping to losers", () => {
    const members = Array.from({ length: 4 }, (_, index) => buildMember(`m${index + 1}`, index + 1));
    const history: LadderMatchRecord[] = [
      // Winners round 1
      { id: "h1", ladderId: "ladder-1", challengeId: null, challengerId: "m1", opponentId: "m4", outcome: "challenger", resolvedAt: "2024-02-01T00:00:00.000Z" },
      { id: "h2", ladderId: "ladder-1", challengeId: null, challengerId: "m2", opponentId: "m3", outcome: "opponent", resolvedAt: "2024-02-01T00:05:00.000Z" }, // m3 upsets
      // Winners final: m1 vs m3
      { id: "h3", ladderId: "ladder-1", challengeId: null, challengerId: "m1", opponentId: "m3", outcome: "challenger", resolvedAt: "2024-02-01T00:10:00.000Z" },
      // Losers: m4 vs m2
      { id: "h4", ladderId: "ladder-1", challengeId: null, challengerId: "m2", opponentId: "m4", outcome: "challenger", resolvedAt: "2024-02-01T00:12:00.000Z" },
      // Losers final: m3 drops to face m2
      { id: "h5", ladderId: "ladder-1", challengeId: null, challengerId: "m3", opponentId: "m2", outcome: "challenger", resolvedAt: "2024-02-01T00:15:00.000Z" },
      // Grand final: m1 vs m3 again
      { id: "h6", ladderId: "ladder-1", challengeId: null, challengerId: "m1", opponentId: "m3", outcome: "challenger", resolvedAt: "2024-02-01T00:20:00.000Z" },
    ];

    const bracket = buildDoubleEliminationBracket(members, history);

    expect(bracket.type).toBe("double");
    expect(bracket.championId).toBe("m1");
    expect(bracket.winners).toHaveLength(2);
    expect(bracket.losers.length).toBeGreaterThanOrEqual(2);
    const grandFinal = bracket.finals.at(-1)?.matches[0];
    expect(grandFinal?.winnerId).toBe("m1");
  });

  it("builds a round-robin table and marks completed matches", () => {
    const members = [buildMember("m1", 1), buildMember("m2", 2), buildMember("m3", 3)];
    const history: LadderMatchRecord[] = [
      { id: "h1", ladderId: "ladder-1", challengeId: null, challengerId: "m1", opponentId: "m2", outcome: "challenger", resolvedAt: "2024-02-01T00:00:00.000Z" },
      { id: "h2", ladderId: "ladder-1", challengeId: null, challengerId: "m2", opponentId: "m3", outcome: "opponent", resolvedAt: "2024-02-01T00:05:00.000Z" }, // m3 beats m2
    ];

    const bracket = buildRoundRobinBracket(members, history);
    expect(bracket.type).toBe("round_robin");
    expect(bracket.rounds.length).toBeGreaterThanOrEqual(2);

    const allMatches = bracket.rounds.flatMap((round) => round.matches);
    const m1m2 = allMatches.find(
      (match) =>
        (match.a?.id === "m1" && match.b?.id === "m2") || (match.a?.id === "m2" && match.b?.id === "m1"),
    );
    expect(m1m2?.status).toBe("complete");
    expect(m1m2?.winnerId).toBe("m1");

    const m2m3 = allMatches.find(
      (match) =>
        (match.a?.id === "m2" && match.b?.id === "m3") || (match.a?.id === "m3" && match.b?.id === "m2"),
    );
    expect(m2m3?.winnerId).toBe("m3");
  });
});
