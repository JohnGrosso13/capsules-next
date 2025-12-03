import { describe, expect, it, vi } from "vitest";

import { FriendsStore } from "@/lib/friends/store";
import type {
  FriendMutationActionInput,
  FriendMutationActionResult,
  FriendsSnapshotActionResult,
} from "@/server/actions/friends";
import type { SocialGraphSnapshot } from "@/lib/supabase/friends";
import type { PartyInviteSummary } from "@/types/party";
import type { CapsuleMemberRequestSummary } from "@/types/capsules";

const capsuleInvites: CapsuleMemberRequestSummary[] = [
  {
    id: "cap-req-1",
    capsuleId: "capsule-1",
    requesterId: "owner-1",
    responderId: null,
    capsuleName: "Studio",
    capsuleSlug: "studio",
    capsuleLogoUrl: null,
    role: null,
    message: null,
    initiator: { id: "owner-1", name: "Owner", avatarUrl: null, userKey: "owner:1" },
    initiatorId: "owner-1",
    requester: { id: "owner-1", name: "Owner", avatarUrl: null, userKey: "owner:1" },
    createdAt: "2025-01-03T00:00:00.000Z",
    status: "pending",
    origin: "owner_invite",
    respondedAt: null,
    approvedAt: null,
    declinedAt: null,
    cancelledAt: null,
  },
];

const partyInvites: PartyInviteSummary[] = [
  {
    id: "party-invite-1",
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

const baseGraph: SocialGraphSnapshot = {
  friends: [],
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
  capsuleInvites,
};

function createStore() {
  const loadSnapshot = vi
    .fn<() => Promise<FriendsSnapshotActionResult>>()
    .mockResolvedValue({
      viewerId: "viewer-1",
      graph: structuredClone(baseGraph),
      channels: { events: "events:viewer-1", presence: ["presence:friends"] },
    });

  const mutate = vi
    .fn<(input: FriendMutationActionInput) => Promise<FriendMutationActionResult>>()
    .mockImplementation(async (input) => {
      const nextGraph = structuredClone(baseGraph);
      if (input.action === "accept" || input.action === "decline" || input.action === "cancel") {
        nextGraph.incomingRequests = [];
      }
      return {
        action: input.action,
        result: null,
        graph: nextGraph,
      };
    });

  const fetchInvites = vi.fn<() => Promise<PartyInviteSummary[]>>().mockResolvedValue(partyInvites);
  const respondInvite = vi
    .fn<(inviteId: string, action: "accept" | "decline") => Promise<PartyInviteSummary>>()
    .mockImplementation(async (inviteId, action) => ({
      ...partyInvites[0]!,
      id: inviteId,
      status: action === "accept" ? "accepted" : "declined",
    }));
  const respondCapsuleInvite = vi
    .fn<(capsuleId: string, requestId: string, action: "accept" | "decline") => Promise<void>>()
    .mockResolvedValue(undefined);

  const store = new FriendsStore({
    loadSnapshot,
    mutate,
    fetchInvites,
    respondInvite,
    respondCapsuleInvite,
  });

  return { store, loadSnapshot, mutate, respondInvite, respondCapsuleInvite };
}

describe("Requests integration", () => {
  it("updates request counters when accepting and declining across feeds", async () => {
    const { store, respondInvite, respondCapsuleInvite } = createStore();

    await store.refresh();
    expect(store.getSnapshot().counters.requests).toBe(3); // 1 friend + 1 party + 1 capsule

    await store.acceptRequest("req-1");
    const afterFriend = store.getSnapshot();
    expect(afterFriend.incomingRequests).toHaveLength(0);
    expect(afterFriend.counters.requests).toBe(2);

    await store.declineCapsuleInvite("capsule-1", "cap-req-1");
    const afterCapsule = store.getSnapshot();
    expect(afterCapsule.capsuleInvites).toHaveLength(0);
    expect(afterCapsule.counters.requests).toBe(1);
    expect(respondCapsuleInvite).toHaveBeenCalledWith("capsule-1", "cap-req-1", "decline");

    await store.declinePartyInvite("party-invite-1");
    const afterParty = store.getSnapshot();
    expect(afterParty.partyInvites).toHaveLength(0);
    expect(afterParty.counters.requests).toBe(0);
    expect(respondInvite).toHaveBeenCalledWith("party-invite-1", "decline");
  });
});
