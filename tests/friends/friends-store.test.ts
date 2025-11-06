import { describe, expect, it, vi } from "vitest";

import { FriendsStore } from "@/lib/friends/store";
import type {
  FriendMutationActionInput,
  FriendMutationActionResult,
  FriendsSnapshotActionResult,
} from "@/server/actions/friends";
import type { SocialGraphSnapshot } from "@/lib/supabase/friends";
import type { PartyInviteSummary } from "@/types/party";

const baseGraph: SocialGraphSnapshot = {
  friends: [
    {
      id: "edge-1",
      friendUserId: "friend-1",
      requestId: null,
      since: "2025-01-01T00:00:00.000Z",
      user: {
        id: "friend-1",
        key: "friend:1",
        name: "Friend One",
        avatarUrl: null,
      },
    },
  ],
  incomingRequests: [
    {
      id: "req-1",
      requesterId: "user-2",
      recipientId: "viewer-1",
      status: "pending",
      message: null,
      createdAt: "2025-01-02T00:00:00.000Z",
      respondedAt: null,
      acceptedAt: null,
      direction: "incoming",
      user: {
        id: "user-2",
        key: "user:2",
        name: "User Two",
        avatarUrl: null,
      },
    },
  ],
  outgoingRequests: [],
  followers: [],
  following: [],
  blocked: [],
};

const partyInvites: PartyInviteSummary[] = [
  {
    id: "invite-1",
    partyId: "party-1",
    senderId: "friend-1",
    recipientId: "viewer-1",
    status: "pending",
    topic: "Hangout",
    message: null,
    createdAt: "2025-01-03T00:00:00.000Z",
    respondedAt: null,
    acceptedAt: null,
    declinedAt: null,
    cancelledAt: null,
    expiresAt: null,
    sender: {
      id: "friend-1",
      key: "friend:1",
      name: "Friend One",
      avatarUrl: null,
    },
  },
];

describe("FriendsStore", () => {
  function createStore(overrides: Partial<ConstructorParameters<typeof FriendsStore>[0]> = {}) {
    const loadSnapshot = vi
      .fn<() => Promise<FriendsSnapshotActionResult>>()
      .mockResolvedValue({
        viewerId: "viewer-1",
        graph: structuredClone(baseGraph),
        channels: { events: "events:viewer-1", presence: "presence:friends" },
      });
    const mutate = vi
      .fn<(input: FriendMutationActionInput) => Promise<FriendMutationActionResult>>()
      .mockImplementation(async () => ({
        action: "accept",
        result: null,
        graph: structuredClone(baseGraph),
      }));
    const fetchInvites = vi
      .fn<() => Promise<PartyInviteSummary[]>>()
      .mockResolvedValue(structuredClone(partyInvites));
    const respondInvite = vi
      .fn<(inviteId: string, action: "accept" | "decline") => Promise<PartyInviteSummary>>()
      .mockImplementation(async (inviteId, action) => {
        const template = partyInvites[0]!;
        return {
          ...template,
          id: inviteId,
          status: action === "accept" ? "accepted" : "declined",
        };
      });
    const dependencies = {
      loadSnapshot,
      mutate,
      fetchInvites,
      respondInvite,
      ...overrides,
    };
    return {
      store: new FriendsStore(dependencies),
      loadSnapshot,
      mutate,
      fetchInvites,
      respondInvite,
    };
  }

  it("refresh hydrates state and derives counters", async () => {
    const { store } = createStore();

    await store.refresh();

    const state = store.getSnapshot();
    expect(state.viewerId).toBe("viewer-1");
    expect(state.channels?.events).toBe("events:viewer-1");
    expect(state.friends).toHaveLength(1);
    expect(state.friends[0]?.name).toBe("Friend One");
    expect(state.incomingRequests).toHaveLength(1);
    expect(state.partyInvites).toHaveLength(1);
    expect(state.counters.friends).toBe(1);
    expect(state.counters.requests).toBe(2); // one request + one invite
    expect(state.hasRealFriends).toBe(true);
    expect(state.status).toBe("ready");
    expect(state.error).toBeNull();
  });

  it("updatePresence adjusts friend status", async () => {
    const { store } = createStore();
    await store.refresh();

    store.updatePresence(() => ({
      "friend-1": { status: "online", updatedAt: "2025-01-04T00:00:00.000Z" },
    }));

    const state = store.getSnapshot();
    expect(state.friends[0]?.status).toBe("online");
  });

  it("mutate replaces graph snapshot", async () => {
    const newGraph: SocialGraphSnapshot = {
      ...structuredClone(baseGraph),
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
    };
    const mutate = vi
      .fn<(input: FriendMutationActionInput) => Promise<FriendMutationActionResult>>()
      .mockResolvedValue({
        action: "remove",
        result: null,
        graph: newGraph,
      });
    const { store } = createStore({ mutate });
    await store.refresh();

    await store.mutate({ action: "remove", target: { userId: "friend-1" } });

    const state = store.getSnapshot();
    expect(state.hasRealFriends).toBe(false);
    expect(state.friends.some((friend) => friend.userId === "friend-1")).toBe(false);
  });

  it("acceptPartyInvite removes invite from state", async () => {
    const respondInvite = vi
      .fn<(inviteId: string, action: "accept" | "decline") => Promise<PartyInviteSummary>>()
      .mockResolvedValue({
        ...partyInvites[0]!,
        status: "accepted",
      });
    const { store } = createStore({ respondInvite });
    await store.refresh();

    await store.acceptPartyInvite("invite-1");

    const state = store.getSnapshot();
    expect(state.partyInvites).toHaveLength(0);
    expect(respondInvite).toHaveBeenCalledWith("invite-1", "accept");
  });
});
