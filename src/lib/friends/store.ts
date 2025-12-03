"use client";

import * as React from "react";

import {
  mapPartyInviteSummaries,
  mapRequestSummaries,
  deriveCounters,
  hasRealFriends,
  applyPresenceToSummaries,
  FALLBACK_DISPLAY_FRIENDS,
  mapCapsuleInviteSummaries,
} from "@/lib/friends/transformers";
import type {
  CapsuleInviteItem,
  FriendsChannelInfo,
  FriendsCounters,
  FriendItem,
  PartyInviteItem,
  PresenceMap,
  RequestItem,
} from "@/lib/friends/types";
import type { SocialGraphSnapshot } from "@/lib/supabase/friends";
import type { PartyInviteSummary } from "@/types/party";
import type {
  FriendMutationActionInput,
  FriendMutationActionResult,
  FriendsSnapshotActionResult,
} from "@/server/actions/friends";
import { fetchPartyInvites, respondToPartyInvite } from "@/services/party-invite/client";

type FriendsStoreStatus = "idle" | "loading" | "ready" | "error";

type FriendsState = {
  status: FriendsStoreStatus;
  viewerId: string | null;
  channels: FriendsChannelInfo;
  graph: SocialGraphSnapshot | null;
  presence: PresenceMap;
  friends: FriendItem[];
  hasRealFriends: boolean;
  incomingRequests: RequestItem[];
  outgoingRequests: RequestItem[];
  partyInvites: PartyInviteItem[];
  capsuleInvites: CapsuleInviteItem[];
  counters: FriendsCounters;
  error: string | null;
  lastUpdatedAt: number | null;
};

type FriendsStoreListener = () => void;

type FriendsStoreDependencies = {
  loadSnapshot: () => Promise<FriendsSnapshotActionResult>;
  mutate: (input: FriendMutationActionInput) => Promise<FriendMutationActionResult>;
  fetchInvites: () => Promise<PartyInviteSummary[]>;
  respondInvite: (
    inviteId: string,
    action: "accept" | "decline",
  ) => Promise<PartyInviteSummary>;
  respondCapsuleInvite: (
    capsuleId: string,
    requestId: string,
    action: "accept" | "decline",
  ) => Promise<void>;
};

type RefreshOptions = {
  background?: boolean;
};

const emptyPresence: PresenceMap = Object.create(null);

const initialState: FriendsState = {
  status: "idle",
  viewerId: null,
  channels: null,
  graph: null,
  presence: emptyPresence,
  friends: FALLBACK_DISPLAY_FRIENDS,
  hasRealFriends: false,
  incomingRequests: [],
  outgoingRequests: [],
  partyInvites: [],
  capsuleInvites: [],
  counters: { friends: 0, chats: 0, requests: 0 },
  error: null,
  lastUpdatedAt: null,
};

const defaultDependencies: FriendsStoreDependencies = {
  loadSnapshot: async () => {
    const { loadFriendsSnapshotAction } = await import("@/server/actions/friends");
    return loadFriendsSnapshotAction();
  },
  mutate: async (input) => {
    const { mutateFriendsGraphAction } = await import("@/server/actions/friends");
    return mutateFriendsGraphAction(input);
  },
  fetchInvites: async () => {
    const response = await fetchPartyInvites();
    return Array.isArray(response?.incoming) ? response.incoming : [];
  },
  respondInvite: respondToPartyInvite,
  respondCapsuleInvite: async (capsuleId, requestId, action) => {
    const res = await fetch(`/api/capsules/${capsuleId}/membership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: action === "accept" ? "accept_invite" : "decline_invite",
        requestId,
      }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || "Unable to update capsule invite.");
    }
    await res.json().catch(() => null);
  },
};

function clonePresence(map: PresenceMap): PresenceMap {
  return { ...map };
}

export class FriendsStore {
  private state: FriendsState = initialState;
  private listeners = new Set<FriendsStoreListener>();
  private deps: FriendsStoreDependencies;
  private refreshPromise: Promise<void> | null = null;

  constructor(dependencies: FriendsStoreDependencies = defaultDependencies) {
    this.deps = dependencies;
  }

  getSnapshot(): FriendsState {
    return this.state;
  }

  subscribe(listener: FriendsStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setDependencies(overrides: Partial<FriendsStoreDependencies>): void {
    this.deps = { ...this.deps, ...overrides };
  }

  private emit() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("FriendsStore listener error", error);
      }
    });
  }

  private updateState(updater: (prev: FriendsState) => FriendsState): void {
    this.state = updater(this.state);
    this.emit();
  }

  private recompute(next: Partial<FriendsState>): void {
    this.updateState((prev) => {
      const graph = next.graph ?? prev.graph;
      const presence = next.presence ?? prev.presence ?? emptyPresence;
      const partyInvites = next.partyInvites ?? prev.partyInvites;
      const capsuleInvites =
        next.capsuleInvites ??
        prev.capsuleInvites ??
        mapCapsuleInviteSummaries(graph?.capsuleInvites ?? []);
      const friends = applyPresenceToSummaries(graph, presence);
      const incomingRequests = mapRequestSummaries(graph?.incomingRequests ?? [], "incoming");
      const outgoingRequests = mapRequestSummaries(graph?.outgoingRequests ?? [], "outgoing");
      const counters = deriveCounters(
        graph?.friends ?? [],
        graph?.incomingRequests ?? [],
        partyInvites,
        capsuleInvites,
      );
      const hasFriends = hasRealFriends(graph?.friends ?? []);

      return {
        ...prev,
        ...next,
        graph,
        presence,
        friends,
        hasRealFriends: hasFriends,
        incomingRequests,
        outgoingRequests,
        partyInvites,
        capsuleInvites,
        counters,
      };
    });
  }

  async refresh(options: RefreshOptions = {}): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const run = async () => {
      if (!options.background) {
        this.updateState((prev) => ({
          ...prev,
          status: prev.status === "ready" ? "ready" : "loading",
          error: null,
        }));
      }

      try {
        const [snapshot, invites] = await Promise.all([
          this.deps.loadSnapshot(),
          this.deps.fetchInvites(),
        ]);
        const inviteItems = mapPartyInviteSummaries(invites);
        const capsuleInviteItems = mapCapsuleInviteSummaries(snapshot.graph?.capsuleInvites ?? []);
        this.recompute({
          status: "ready",
          viewerId: snapshot.viewerId ?? null,
          channels: snapshot.channels ?? null,
          graph: snapshot.graph,
          partyInvites: inviteItems,
          capsuleInvites: capsuleInviteItems,
          error: null,
          lastUpdatedAt: Date.now(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load friends";
        this.updateState((prev) => ({
          ...prev,
          status: prev.graph ? "ready" : "error",
          error: message,
        }));
      } finally {
        this.refreshPromise = null;
      }
    };

    const promise = run();
    this.refreshPromise = promise;
    return promise;
  }

  setError(message: string | null): void {
    this.updateState((prev) => ({
      ...prev,
      error: message,
    }));
  }

  clearChannels(): void {
    this.updateState((prev) => ({
      ...prev,
      channels: null,
    }));
  }

  updatePresence(update: PresenceMap | ((value: PresenceMap) => PresenceMap)): void {
    this.recompute({
      presence: typeof update === "function" ? clonePresence(update(this.state.presence)) : update,
    });
  }

  async mutate(input: FriendMutationActionInput): Promise<FriendMutationActionResult> {
    const outcome = await this.deps.mutate(input);
    this.recompute({
      graph: outcome.graph,
      channels: outcome.channels ?? this.state.channels,
      status: "ready",
      error: null,
      lastUpdatedAt: Date.now(),
    });
    return outcome;
  }

  async acceptRequest(requestId: string): Promise<void> {
    await this.mutate({ action: "accept", requestId });
  }

  async declineRequest(requestId: string): Promise<void> {
    await this.mutate({ action: "decline", requestId });
  }

  async cancelRequest(requestId: string): Promise<void> {
    await this.mutate({ action: "cancel", requestId });
  }

  async performTargetedMutation(
    action: "request" | "remove" | "block" | "follow" | "unfollow" | "unblock",
    target: Record<string, unknown>,
  ): Promise<void> {
    await this.mutate({ action, target });
  }

  async acceptPartyInvite(inviteId: string): Promise<PartyInviteSummary> {
    return this.handleInviteResponse(inviteId, "accept");
  }

  async declinePartyInvite(inviteId: string): Promise<PartyInviteSummary> {
    return this.handleInviteResponse(inviteId, "decline");
  }

  async acceptCapsuleInvite(capsuleId: string, requestId: string): Promise<void> {
    await this.handleCapsuleInviteResponse(capsuleId, requestId, "accept");
  }

  async declineCapsuleInvite(capsuleId: string, requestId: string): Promise<void> {
    await this.handleCapsuleInviteResponse(capsuleId, requestId, "decline");
  }

  private async handleInviteResponse(
    inviteId: string,
    action: "accept" | "decline",
  ): Promise<PartyInviteSummary> {
    try {
      const invite = await this.deps.respondInvite(inviteId, action);
      this.recompute({
        partyInvites: this.state.partyInvites.filter((invite) => invite.id !== inviteId),
        counters: {
          ...this.state.counters,
          requests: Math.max(0, this.state.counters.requests - 1),
        },
      });
      return invite;
    } catch (error) {
      throw error;
    }
  }

  private async handleCapsuleInviteResponse(
    capsuleId: string,
    requestId: string,
    action: "accept" | "decline",
  ): Promise<void> {
    try {
      await this.deps.respondCapsuleInvite(capsuleId, requestId, action);
      this.recompute({
        capsuleInvites: this.state.capsuleInvites.filter((invite) => invite.id !== requestId),
        counters: {
          ...this.state.counters,
          requests: Math.max(0, this.state.counters.requests - 1),
        },
      });
    } catch (error) {
      throw error;
    }
  }
}

const friendsStoreInstance = new FriendsStore();

export function getFriendsStore(): FriendsStore {
  return friendsStoreInstance;
}

export function useFriendsState(): FriendsState {
  const store = getFriendsStore();
  return React.useSyncExternalStore<FriendsState>(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}

export function useFriendsSelector<T>(selector: (state: FriendsState) => T): T {
  const store = getFriendsStore();
  return React.useSyncExternalStore<T>(
    (listener) => store.subscribe(listener),
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}

type FriendsActions = {
  refresh: (options?: RefreshOptions) => Promise<void>;
  setError: (message: string | null) => void;
  updatePresence: (update: PresenceMap | ((value: PresenceMap) => PresenceMap)) => void;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  performTargetedMutation: (
    action: "request" | "remove" | "block" | "follow" | "unfollow" | "unblock",
    target: Record<string, unknown>,
  ) => Promise<void>;
  acceptPartyInvite: (inviteId: string) => Promise<PartyInviteSummary>;
  declinePartyInvite: (inviteId: string) => Promise<PartyInviteSummary>;
  acceptCapsuleInvite: (capsuleId: string, requestId: string) => Promise<void>;
  declineCapsuleInvite: (capsuleId: string, requestId: string) => Promise<void>;
  mutate: (input: FriendMutationActionInput) => Promise<FriendMutationActionResult>;
};

const actions: FriendsActions = {
  refresh: (options) => getFriendsStore().refresh(options),
  setError: (message) => getFriendsStore().setError(message),
  updatePresence: (update) => getFriendsStore().updatePresence(update),
  acceptRequest: (requestId) => getFriendsStore().acceptRequest(requestId),
  declineRequest: (requestId) => getFriendsStore().declineRequest(requestId),
  cancelRequest: (requestId) => getFriendsStore().cancelRequest(requestId),
  performTargetedMutation: (action, target) =>
    getFriendsStore().performTargetedMutation(action, target),
  acceptPartyInvite: (inviteId) => getFriendsStore().acceptPartyInvite(inviteId),
  declinePartyInvite: (inviteId) => getFriendsStore().declinePartyInvite(inviteId),
  acceptCapsuleInvite: (capsuleId, requestId) =>
    getFriendsStore().acceptCapsuleInvite(capsuleId, requestId),
  declineCapsuleInvite: (capsuleId, requestId) =>
    getFriendsStore().declineCapsuleInvite(capsuleId, requestId),
  mutate: (input) => getFriendsStore().mutate(input),
};

export function useFriendsActions(): FriendsActions {
  return actions;
}

export const friendsActions = actions;

export const friendsStore = friendsStoreInstance;
