"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";
import { buildRealtimeEnvelope } from "@/lib/realtime/envelope";
import { requestRealtimeToken } from "@/lib/realtime/token";
import { useFriendsRealtime } from "@/hooks/useFriendsRealtime";
import { useFriendsActions, useFriendsSelector } from "@/lib/friends/store";
import {
  FALLBACK_DISPLAY_FRIENDS,
} from "@/lib/friends/transformers";
import type { FriendItem } from "@/lib/friends/types";
import { buildFriendTargetPayload } from "@/lib/friends/targets";

export type { FriendItem, FriendsCounters, PartyInviteItem, RequestItem } from "@/lib/friends/types";

export type UseFriendsDataOptions = {
  subscribeRealtime?: boolean;
};

export function useFriendsData(options: UseFriendsDataOptions = {}) {
  const subscribeRealtime = options.subscribeRealtime ?? true;
  const { user } = useCurrentUser();
  const status = useFriendsSelector((snapshot) => snapshot.status);
  const lastUpdatedAt = useFriendsSelector((snapshot) => snapshot.lastUpdatedAt);
  const channels = useFriendsSelector((snapshot) => snapshot.channels);
  const friendsState = useFriendsSelector((snapshot) => snapshot.friends);
  const hasRealFriends = useFriendsSelector((snapshot) => snapshot.hasRealFriends);
  const incomingRequests = useFriendsSelector((snapshot) => snapshot.incomingRequests);
  const outgoingRequests = useFriendsSelector((snapshot) => snapshot.outgoingRequests);
  const partyInvites = useFriendsSelector((snapshot) => snapshot.partyInvites);
  const counters = useFriendsSelector((snapshot) => snapshot.counters);
  const error = useFriendsSelector((snapshot) => snapshot.error);
  const viewerId = useFriendsSelector((snapshot) => snapshot.viewerId);
  const actions = useFriendsActions();

  const envelope = React.useMemo(() => buildRealtimeEnvelope(user), [user]);

  const refreshRef = React.useRef<number | null>(null);

  const scheduleRefresh = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (refreshRef.current) return;
    refreshRef.current = window.setTimeout(() => {
      refreshRef.current = null;
      void actions.refresh({ background: true });
    }, 200);
  }, [actions]);

  React.useEffect(() => {
    if (status === "idle") {
      void actions.refresh();
    }
    return () => {
      if (refreshRef.current) {
        window.clearTimeout(refreshRef.current);
        refreshRef.current = null;
      }
    };
  }, [actions, status]);

  const tokenProvider = React.useCallback(() => requestRealtimeToken(envelope), [envelope]);

  useFriendsRealtime(subscribeRealtime ? channels : null, tokenProvider, scheduleRefresh);

  const loading = status === "loading" && lastUpdatedAt === null;

  const friends = React.useMemo<FriendItem[]>(() => {
    if (!friendsState.length) return FALLBACK_DISPLAY_FRIENDS;
    return friendsState;
  }, [friendsState]);

  const removeFriend = React.useCallback(
    async (friend: FriendItem) => {
      const target = buildFriendTargetPayload({
        userId: friend.userId,
        key: friend.key,
        id: friend.id,
        name: friend.name,
        avatar: friend.avatar ?? null,
      });
      if (!target) {
        throw new Error("Unable to resolve friend target");
      }
      await actions.performTargetedMutation("remove", target);
    },
    [actions],
  );

  const blockFriend = React.useCallback(
    async (friend: FriendItem) => {
      const target = buildFriendTargetPayload({
        userId: friend.userId,
        key: friend.key,
        id: friend.id,
        name: friend.name,
        avatar: friend.avatar ?? null,
      });
      if (!target) {
        throw new Error("Unable to resolve friend target");
      }
      await actions.performTargetedMutation("block", target);
    },
    [actions],
  );

  const acceptRequest = React.useCallback(
    async (requestId: string) => {
      await actions.acceptRequest(requestId);
    },
    [actions],
  );

  const declineRequest = React.useCallback(
    async (requestId: string) => {
      await actions.declineRequest(requestId);
    },
    [actions],
  );

  const cancelRequest = React.useCallback(
    async (requestId: string) => {
      await actions.cancelRequest(requestId);
    },
    [actions],
  );

  const acceptPartyInvite = React.useCallback(
    async (inviteId: string) => actions.acceptPartyInvite(inviteId),
    [actions],
  );

  const declinePartyInvite = React.useCallback(
    async (inviteId: string) => actions.declinePartyInvite(inviteId),
    [actions],
  );

  const refresh = React.useCallback(async () => {
    await actions.refresh();
  }, [actions]);

  const setError = React.useCallback(
    (value: string | null) => {
      actions.setError(value);
    },
    [actions],
  );

  return {
    friends,
    hasRealFriends,
    incomingRequests,
    outgoingRequests,
    partyInvites,
    counters,
    loading,
    error,
    setError,
    refresh,
    removeFriend,
    blockFriend,
    acceptRequest,
    declineRequest,
    cancelRequest,
    acceptPartyInvite,
    declinePartyInvite,
    viewerId,
  } as const;
}
