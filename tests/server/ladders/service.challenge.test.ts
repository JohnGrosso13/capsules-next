import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createLadderChallenge, resolveLadderChallenge } from "@/server/ladders/service";
import type { CapsuleLadderDetail, CapsuleLadderMember, LadderChallenge } from "@/types/ladders";

let uuidQueue: string[] = [];
vi.mock("crypto", async (importOriginal) => {
  const mod = await importOriginal<typeof import("crypto")>();
  return {
    ...mod,
    randomUUID: () => uuidQueue.shift() ?? "uuid-fallback",
  };
});
vi.mock("node:crypto", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:crypto")>();
  return {
    ...mod,
    randomUUID: () => uuidQueue.shift() ?? "uuid-fallback",
  };
});

vi.mock("@/server/capsules/permissions", () => ({
  resolveCapsuleActor: vi.fn(async (_capsuleId: string, viewerId: string) => ({
    capsuleId: "capsule-1",
    ownerId: "owner-1",
    actorId: viewerId,
    role: "member",
    isOwner: false,
  })),
  canManageLadders: vi.fn(() => true),
}));

vi.mock("@/server/capsules/repository", () => ({
  findCapsuleById: vi.fn(async (id: string) => ({ id, created_by_id: "owner-1" })),
  listCapsulesForUser: vi.fn(async () => []),
}));

type UpdateArgs = Parameters<
  typeof import("@/server/ladders/repository").updateCapsuleLadderRecord
>[2];

const ladderStore = new Map<string, CapsuleLadderDetail>();
const memberStore = new Map<string, CapsuleLadderMember[]>();

const nowIso = () => new Date().toISOString();

vi.mock("@/server/ladders/repository", () => ({
  insertCapsuleLadderRecord: vi.fn(),
  updateCapsuleLadderRecord: vi.fn(
    async (
      ladderId: string,
      patch: Partial<CapsuleLadderDetail>,
      options?: UpdateArgs,
    ): Promise<CapsuleLadderDetail | null> => {
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
  listCapsuleLaddersByCapsule: vi.fn(async (capsuleId: string) =>
    Array.from(ladderStore.values()).filter((ladder) => ladder.capsuleId === capsuleId),
  ),
  listCapsuleLadderMemberRecords: vi.fn(async (ladderId: string) =>
    (memberStore.get(ladderId) ?? []).map((member) => ({ ...member })),
  ),
  replaceCapsuleLadderMemberRecords: vi.fn(
    async (ladderId: string, inputs: Array<Omit<CapsuleLadderMember, "id">>) => {
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
          id: match.id,
          updatedAt: nowIso(),
          createdAt: match.createdAt ?? nowIso(),
          rating: input.rating ?? 1200,
          wins: input.wins ?? 0,
          losses: input.losses ?? 0,
          draws: input.draws ?? 0,
          streak: input.streak ?? 0,
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
  name: "Test Ladder",
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
  config: { scoring: { system: "simple" } },
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-01-02T00:00:00.000Z"));
  uuidQueue = ["challenge-1", "history-1"];
  ladderStore.clear();
  memberStore.clear();
  ladderStore.set("ladder-1", { ...baseLadder });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("challenge lifecycle", () => {
  it("rejects creating challenges on non-active ladders", async () => {
    ladderStore.set("ladder-1", { ...baseLadder, status: "draft" });
    seedMembers([
      { id: "m1", displayName: "A", rank: 1, rating: 1200, wins: 0, losses: 0, draws: 0, streak: 0, userId: null, handle: null, seed: 1, metadata: null, createdAt: "", updatedAt: "" },
      { id: "m2", displayName: "B", rank: 2, rating: 1200, wins: 0, losses: 0, draws: 0, streak: 0, userId: null, handle: null, seed: 2, metadata: null, createdAt: "", updatedAt: "" },
    ]);

    await expect(
      createLadderChallenge("user-1", "ladder-1", { challengerId: "m2", opponentId: "m1" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("creates a simple ladder challenge and persists meta with optimistic lock", async () => {
    seedMembers([
      { id: "m1", displayName: "Top", rank: 1, rating: 1300, wins: 5, losses: 1, draws: 0, streak: 2, userId: null, handle: null, seed: 1, metadata: null, createdAt: "", updatedAt: "" },
      { id: "m2", displayName: "Challenger", rank: 3, rating: 1200, wins: 1, losses: 3, draws: 0, streak: -1, userId: null, handle: null, seed: 2, metadata: null, createdAt: "", updatedAt: "" },
    ]);

    const result = await createLadderChallenge("user-1", "ladder-1", {
      challengerId: "m2",
      opponentId: "m1",
      note: "  great game ",
    });

    expect(result.challenge.status).toBe("pending");
    expect(result.challenge.note).toBe("great game");

    const ladder = ladderStore.get("ladder-1")!;
  const ladderState = (ladder.meta as { ladderState?: { challenges?: LadderChallenge[] } })
    .ladderState;
    expect(ladderState?.challenges?.[0]).toMatchObject({
      challengerId: "m2",
      opponentId: "m1",
      status: "pending",
    });
    expect(ladderState?.challenges?.[0]?.id).toBeTruthy();
  });

  it("resolves a simple ladder challenge and reorders standings", async () => {
    const pendingChallenge: LadderChallenge = {
      id: "challenge-1",
      ladderId: "ladder-1",
      challengerId: "m2",
      opponentId: "m1",
      createdAt: "2024-01-01T00:00:00.000Z",
      createdById: "user-1",
      status: "pending",
      note: null,
    };
    ladderStore.set("ladder-1", {
      ...baseLadder,
      meta: { ladderState: { challenges: [pendingChallenge], history: [] } },
    });
    seedMembers([
      { id: "m1", displayName: "Top", rank: 1, rating: 1300, wins: 5, losses: 1, draws: 0, streak: 2, userId: null, handle: null, seed: 1, metadata: null, createdAt: "", updatedAt: "" },
      { id: "m2", displayName: "Challenger", rank: 4, rating: 1200, wins: 1, losses: 3, draws: 0, streak: -1, userId: null, handle: null, seed: 2, metadata: null, createdAt: "", updatedAt: "" },
      { id: "m3", displayName: "Mid", rank: 2, rating: 1250, wins: 3, losses: 2, draws: 0, streak: 1, userId: null, handle: null, seed: 3, metadata: null, createdAt: "", updatedAt: "" },
    ]);

    const result = await resolveLadderChallenge("user-1", "ladder-1", "challenge-1", "challenger", " gg ");

    expect(result.challenge.status).toBe("resolved");
    expect(result.history[0]).toMatchObject({
      challengeId: "challenge-1",
      outcome: "challenger",
    });
    expect(result.history[0]?.id).toBeTruthy();

    const reordered = memberStore.get("ladder-1")!;
    expect(reordered.map((m) => ({ id: m.id, rank: m.rank, wins: m.wins, losses: m.losses })))
      .toEqual([
        { id: "m1", rank: 1, wins: 5, losses: 2 },
        { id: "m2", rank: 2, wins: 2, losses: 3 },
        { id: "m3", rank: 3, wins: 3, losses: 2 },
      ]);
  });

  it("updates Elo ratings when resolving challenges", async () => {
    ladderStore.set("ladder-1", {
      ...baseLadder,
      config: { scoring: { system: "elo", initialRating: 1200, kFactor: 32 } },
      meta: {
        ladderState: {
          challenges: [
            {
              id: "challenge-1",
              ladderId: "ladder-1",
              challengerId: "m-low",
              opponentId: "m-high",
              createdAt: "2024-01-01T00:00:00.000Z",
              createdById: "user-1",
              status: "pending",
              note: null,
            },
          ],
          history: [],
        },
      },
    });
    seedMembers([
      { id: "m-high", displayName: "High", rank: 1, rating: 1300, wins: 10, losses: 2, draws: 0, streak: 3, userId: null, handle: null, seed: 1, metadata: null, createdAt: "", updatedAt: "" },
      { id: "m-low", displayName: "Low", rank: 2, rating: 1100, wins: 2, losses: 8, draws: 0, streak: -2, userId: null, handle: null, seed: 2, metadata: null, createdAt: "", updatedAt: "" },
    ]);

    const result = await resolveLadderChallenge("user-1", "ladder-1", "challenge-1", "challenger");

    const reordered = memberStore.get("ladder-1")!;
    const low = reordered.find((m) => m.id === "m-low")!;
    const high = reordered.find((m) => m.id === "m-high")!;
    expect(low.rating).toBe(1124); // gained points as underdog
    expect(high.rating).toBe(1276); // lost points
    expect(result.history[0]?.ratingChanges).toEqual([
      { memberId: "m-low", from: 1100, to: 1124, delta: 24 },
      { memberId: "m-high", from: 1300, to: 1276, delta: -24 },
    ]);
  });
});
