import { describe, expect, it, beforeEach, vi } from "vitest";
import type { RawRow } from "./types";

vi.mock("./repository", () => ({
  fetchSocialGraphRows: vi.fn(),
  findPendingRequest: vi.fn(),
  findLatestRequestBetween: vi.fn(),
  findFriendshipRow: vi.fn(),
  findBlockBetween: vi.fn(),
  ensureFriendshipEdge: vi.fn(),
  softDeleteFriendshipEdge: vi.fn(),
  softDeleteFollowEdge: vi.fn(),
  closePendingRequest: vi.fn(),
  insertFriendRequest: vi.fn(),
  updateFriendRequest: vi.fn(),
  updatePendingRequest: vi.fn(),
  insertFollowEdge: vi.fn(),
  restoreFollowEdge: vi.fn(),
  findLatestFollowEdge: vi.fn(),
  findLatestBlockEdge: vi.fn(),
  findActiveBlock: vi.fn(),
  insertBlockEdge: vi.fn(),
  updateBlockEdge: vi.fn(),
  removeBlock: vi.fn(),
  getRequestById: vi.fn(),
}));

vi.mock("@/services/realtime/friends", () => ({
  publishFriendEvents: vi.fn(),
}));

const repository = await import("./repository");
const realtime = await import("@/services/realtime/friends");
const service = await import("./service");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("sendFriendRequest", () => {
  it("creates a new pending request when no prior history exists", async () => {
    const requestRow = {
      id: "req-1",
      requester_id: "user-a",
      recipient_id: "user-b",
      status: "pending",
      message: null,
      created_at: "2024-01-01T00:00:00Z",
      responded_at: null,
      accepted_at: null,
      requester: { id: "user-a", user_key: "user:a", full_name: "User A" },
      recipient: { id: "user-b", user_key: "user:b", full_name: "User B" },
    } as const;

    vi.mocked(repository.findBlockBetween).mockResolvedValue(false);
    vi.mocked(repository.findFriendshipRow).mockResolvedValue(null);
    vi.mocked(repository.findPendingRequest).mockResolvedValue(null);
    vi.mocked(repository.findLatestRequestBetween).mockResolvedValue(null);
    vi.mocked(repository.insertFriendRequest).mockResolvedValue(requestRow as unknown as RawRow);
    vi.mocked(realtime.publishFriendEvents).mockResolvedValue();

    const summary = await service.sendFriendRequest("user-a", "user-b");

    expect(repository.insertFriendRequest).toHaveBeenCalledWith({
      requester_id: "user-a",
      recipient_id: "user-b",
      status: "pending",
      message: null,
    });
    expect(summary.id).toBe("req-1");
    expect(summary.direction).toBe("outgoing");
    expect(realtime.publishFriendEvents).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(realtime.publishFriendEvents).mock.calls;
    expect(calls.length).toBe(1);
    const eventsArg = calls[0]![0];
    expect(eventsArg).toHaveLength(2);
  });

  it("throws when requester matches recipient", async () => {
    await expect(service.sendFriendRequest("user-a", "user-a")).rejects.toMatchObject({
      code: "self_target",
    });
  });
});

describe("followUser", () => {
  it("restores a previous follow edge before publishing events", async () => {
    const deletedRow = {
      id: "follow-1",
      follower_user_id: "user-a",
      followee_user_id: "user-b",
      created_at: "2024-01-01T00:00:00Z",
      deleted_at: "2024-01-02T00:00:00Z",
      follower: { id: "user-a", user_key: "user:a" },
      followee: { id: "user-b", user_key: "user:b" },
    } as const;

    const restoredRow = {
      ...deletedRow,
      deleted_at: null,
    } as const;

    vi.mocked(repository.findBlockBetween).mockResolvedValue(false);
    vi.mocked(repository.findLatestFollowEdge).mockResolvedValue(deletedRow as unknown as RawRow);
    vi.mocked(repository.restoreFollowEdge).mockResolvedValue(restoredRow as unknown as RawRow);
    vi.mocked(realtime.publishFriendEvents).mockResolvedValue();

    const summary = await service.followUser("user-a", "user-b");

    expect(repository.restoreFollowEdge).toHaveBeenCalledWith("user-a", "user-b");
    expect(repository.insertFollowEdge).not.toHaveBeenCalled();
    expect(summary.direction).toBe("following");
    expect(realtime.publishFriendEvents).toHaveBeenCalledTimes(1);
  });
});

describe("blockUser", () => {
  it("updates existing block entry and clears graph edges", async () => {
    const existingRow = {
      id: "block-1",
      blocker_user_id: "user-a",
      blocked_user_id: "user-b",
      reason: "old",
      deleted_at: "2024-01-02T00:00:00Z",
      created_at: "2024-01-01T00:00:00Z",
      blocked: { id: "user-b", user_key: "user:b" },
    } as const;

    const updatedRow = {
      ...existingRow,
      deleted_at: null,
      reason: "updated",
    } as const;

    vi.mocked(repository.findLatestBlockEdge).mockResolvedValue(existingRow as unknown as RawRow);
    vi.mocked(repository.updateBlockEdge).mockResolvedValue(updatedRow as unknown as RawRow);
    vi.mocked(realtime.publishFriendEvents).mockResolvedValue();

    const summary = await service.blockUser("user-a", "user-b", { reason: "updated" });

    expect(repository.updateBlockEdge).toHaveBeenCalled();
    expect(repository.softDeleteFriendshipEdge).toHaveBeenCalledTimes(2);
    expect(repository.softDeleteFollowEdge).toHaveBeenCalledTimes(2);
    expect(summary.reason).toBe("updated");
    expect(realtime.publishFriendEvents).toHaveBeenCalledTimes(1);
  });
});
