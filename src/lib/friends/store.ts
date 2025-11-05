"use client";

import * as React from "react";

import {
  mapPartyInviteSummaries,
  mapRequestSummaries,
  deriveCounters,
  hasRealFriends,
  applyPresenceToSummaries,
  FALLBACK_DISPLAY_FRIENDS,
} from "@/lib/friends/transformers";
import type {
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
      const friends = applyPresenceToSummaries(graph, presence);
      const incomingRequests = mapRequestSummaries(graph?.incomingRequests ?? [], "incoming");
      const outgoingRequests = mapRequestSummaries(graph?.outgoingRequests ?? [], "outgoing");
      const counters = deriveCounters(graph?.friends ?? [], graph?.incomingRequests ?? [], partyInvites);
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
        this.recompute({
          status: "ready",
          viewerId: snapshot.viewerId ?? null,
          channels: snapshot.channels ?? null,
          graph: snapshot.graph,
          partyInvites: inviteItems,
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

  async acceptPartyInvite(inviteId: string): Promise<void> {
    await this.handleInviteResponse(inviteId, "accept");
  }

  async declinePartyInvite(inviteId: string): Promise<void> {
    await this.handleInviteResponse(inviteId, "decline");
  }

  private async handleInviteResponse(
    inviteId: string,
    action: "accept" | "decline",
  ): Promise<void> {
    try {
      await this.deps.respondInvite(inviteId, action);
      this.recompute({
        partyInvites: this.state.partyInvites.filter((invite) => invite.id !== inviteId),
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
  acceptPartyInvite: (inviteId: string) => Promise<void>;
  declinePartyInvite: (inviteId: string) => Promise<void>;
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
  mutate: (input) => getFriendsStore().mutate(input),
};

export function useFriendsActions(): FriendsActions {
  return actions;
}

export const friendsActions = actions;

export const friendsStore = friendsStoreInstance;
