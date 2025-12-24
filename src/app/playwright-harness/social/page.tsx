"use client";

import * as React from "react";

import type {
  FriendMutationActionInput,
  FriendMutationActionResult,
  FriendsSnapshotActionResult,
} from "@/server/actions/friends";
import type { SocialGraphSnapshot } from "@/lib/supabase/friends";
import type { CapsuleMemberRequestSummary } from "@/types/capsules";
import type { PartyInviteSummary } from "@/types/party";
import { FriendsStore } from "@/lib/friends/store";

type HarnessStore = {
  store: FriendsStore;
  snapshot: SocialGraphSnapshot;
  partyInvites: PartyInviteSummary[];
};

function createHarnessStore(): HarnessStore {
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
      status: "pending" as const,
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
      status: "pending" as const,
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

  const loadSnapshot = async (): Promise<FriendsSnapshotActionResult> => ({
    viewerId: "viewer-1",
    graph: structuredClone(baseGraph),
    channels: { events: "events:viewer-1", presence: ["presence:friends"] },
  });

  const mutate = async (input: FriendMutationActionInput): Promise<FriendMutationActionResult> => {
    const nextGraph = structuredClone(baseGraph);
    if (input.action === "accept" || input.action === "decline" || input.action === "cancel") {
      nextGraph.incomingRequests = [];
    }
    return {
      action: input.action,
      result: null,
      graph: nextGraph,
    };
  };

  const respondInvite = async (
    inviteId: string,
    action: "accept" | "decline",
  ): Promise<PartyInviteSummary> => ({
    ...partyInvites[0]!,
    id: inviteId,
    status: action === "accept" ? ("accepted" as const) : ("declined" as const),
  });

  const respondCapsuleInvite = async () => {};

  const store = new FriendsStore({
    loadSnapshot,
    mutate,
    fetchInvites: async () => partyInvites,
    respondInvite,
    respondCapsuleInvite,
  });

  return { store, snapshot: baseGraph, partyInvites };
}

export default function SocialHarnessPage() {
  const harnessRef = React.useRef<HarnessStore | null>(null);
  const [, setVersion] = React.useState(0);

  if (!harnessRef.current) {
    harnessRef.current = createHarnessStore();
  }

  const store = harnessRef.current.store;
  const state = store.getSnapshot();

  React.useEffect(() => {
    const unsub = store.subscribe(() => setVersion((v) => v + 1));
    void store.refresh();
    return () => unsub();
  }, [store]);

  const handle = async (action: () => Promise<unknown>) => {
    await action();
  };

  return (
    <main style={{ padding: "1.5rem", fontFamily: "sans-serif", maxWidth: 680 }}>
      <h1>Playwright Social Requests Harness</h1>
      <p>
        Requests counter: <span data-testid="requests-count">{state.counters.requests}</span>
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void handle(() => store.acceptRequest("req-1"))}
          data-testid="accept-friend"
        >
          Accept friend
        </button>
        <button
          type="button"
          onClick={() => void handle(() => store.declineCapsuleInvite("capsule-1", "cap-req-1"))}
          data-testid="decline-capsule"
        >
          Decline capsule invite
        </button>
        <button
          type="button"
          onClick={() => void handle(() => store.declinePartyInvite("party-invite-1"))}
          data-testid="decline-party"
        >
          Decline party invite
        </button>
      </div>
      <section style={{ marginTop: "1rem" }}>
        <h3>Incoming requests</h3>
        <ul data-testid="friend-requests">
          {state.incomingRequests.map((req) => (
            <li key={req.id}>{req.user?.name ?? req.id}</li>
          ))}
        </ul>
        <h3>Capsule invites</h3>
        <ul data-testid="capsule-invites">
          {state.capsuleInvites.map((invite) => (
            <li key={invite.id}>{invite.capsuleName ?? invite.id}</li>
          ))}
        </ul>
        <h3>Party invites</h3>
        <ul data-testid="party-invites">
          {state.partyInvites.map((invite) => (
            <li key={invite.id}>{invite.topic ?? invite.id}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
