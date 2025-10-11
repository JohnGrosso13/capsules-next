"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";
import { useFriendsRealtime, type PresenceMap } from "@/hooks/useFriendsRealtime";
import { buildRealtimeEnvelope } from "@/lib/realtime/envelope";
import { requestRealtimeToken } from "@/lib/realtime/token";
import {
  fetchFriendsSnapshot,
  updateFriendsGraph,
  type FriendsChannelInfo,
} from "@/services/friends/client";
import { fetchPartyInvites, respondToPartyInvite } from "@/services/party-invite/client";
import {
  FRIENDS_GRAPH_REFRESH_EVENT,
  FRIENDS_GRAPH_UPDATE_EVENT,
  broadcastFriendsGraphRefresh,
  broadcastFriendsGraphUpdate,
  type FriendsGraphUpdateEventDetail,
} from "@/hooks/useFriendsGraph";
import { buildFriendTargetPayload } from "@/hooks/useFriendActions";
import type {
  FriendSummary,
  FriendRequestSummary,
  SocialGraphSnapshot,
} from "@/lib/supabase/friends";
import type { PartyInviteSummary } from "@/types/party";

export type FriendItem = {
  id: string;
  userId: string | null;
  key: string | null;
  name: string;
  avatar: string | null;
  since: string | null;
  status: "online" | "offline" | "away";
};

export type RequestItem = {
  id: string;
  user: { name?: string | null } | null;
  kind: "incoming" | "outgoing";
};

export type PartyInviteItem = {
  id: string;
  partyId: string;
  hostName: string;
  hostAvatar: string | null;
  topic: string | null;
  expiresAt: string | null;
  senderId: string;
};

export type ChannelInfo = FriendsChannelInfo;

export type FriendsCounters = {
  friends: number;
  chats: number;
  requests: number;
};
const FALLBACK_DISPLAY_FRIENDS: FriendItem[] = [
  {
    id: "capsules",
    userId: "capsules",
    key: null,
    name: "Capsules Team",
    avatar: null,
    since: null,
    status: "offline" as const,
  },
  {
    id: "memory",
    userId: "memory",
    key: null,
    name: "Memory Bot",
    avatar: null,
    since: null,
    status: "offline" as const,
  },
  {
    id: "dream",
    userId: "dream",
    key: null,
    name: "Dream Studio",
    avatar: null,
    since: null,
    status: "offline" as const,
  },
];

function mapFriendSummaries(
  summaries: FriendSummary[],
  presence: PresenceMap,
): FriendItem[] {
  return summaries.map((summary, index) => {
    const presenceKey = summary.friendUserId || summary.user?.key || summary.user?.id || summary.id;
    const presenceEntry = presenceKey ? presence[presenceKey] : undefined;
    const status = presenceEntry?.status ?? "offline";

    const fallbackName = "Friend";
    const fallbackId = summary.id || summary.friendUserId || summary.user?.key || `friend-${index}`;

    return {
      id: String(fallbackId),
      userId: summary.friendUserId ?? null,
      key: summary.user?.key ?? null,
      name: summary.user?.name ?? fallbackName,
      avatar: summary.user?.avatarUrl ?? null,
      since: summary.since ?? null,
      status,
    } satisfies FriendItem;
  });
}

function mapRequestSummaries(
  summaries: FriendRequestSummary[],
  kind: "incoming" | "outgoing",
): RequestItem[] {
  return summaries.map((summary) => ({
    id: summary.id,
    user: summary.user ? { name: summary.user.name } : null,
    kind,
  }));
}

function mapPartyInviteSummaries(summaries: PartyInviteSummary[]): PartyInviteItem[] {
  return summaries.map((invite) => ({
    id: invite.id,
    partyId: invite.partyId,
    hostName: invite.sender?.name ?? "Party host",
    hostAvatar: invite.sender?.avatarUrl ?? null,
    topic: invite.topic ?? null,
    expiresAt: invite.expiresAt ?? null,
    senderId: invite.senderId,
  }));
}

export type UseFriendsDataOptions = {
  subscribeRealtime?: boolean;
};

export function useFriendsData(options: UseFriendsDataOptions = {}) {
  const subscribeRealtime = options.subscribeRealtime ?? true;
  const { user } = useCurrentUser();

  const envelope = React.useMemo(() => buildRealtimeEnvelope(user), [user]);

  const [friendSummaries, setFriendSummaries] = React.useState<FriendSummary[]>([]);
  const [incomingSummaries, setIncomingSummaries] = React.useState<FriendRequestSummary[]>([]);
  const [outgoingSummaries, setOutgoingSummaries] = React.useState<FriendRequestSummary[]>([]);
  const [incomingPartySummaries, setIncomingPartySummaries] = React.useState<PartyInviteSummary[]>([]);
  const [channels, setChannels] = React.useState<ChannelInfo>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [viewerId, setViewerId] = React.useState<string | null>(null);

  const refreshRef = React.useRef<number | null>(null);

  const applyGraph = React.useCallback((graph: SocialGraphSnapshot | null) => {
    if (!graph) {
      setFriendSummaries([]);
      setIncomingSummaries([]);
      setOutgoingSummaries([]);
      return;
    }
    setFriendSummaries(graph.friends ?? []);
    setIncomingSummaries(graph.incomingRequests ?? []);
    setOutgoingSummaries(graph.outgoingRequests ?? []);
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading((prev) => prev && friendSummaries.length === 0);
    try {
      const { graph, channels: channelData, viewerId: snapshotViewerId } = await fetchFriendsSnapshot(envelope);
      setViewerId(snapshotViewerId ?? null);
      setChannels((prev) => {
        if (
          prev &&
          channelData &&
          prev.events === channelData.events &&
          prev.presence === channelData.presence
        ) {
          return prev;
        }
        return channelData;
      });
      applyGraph(graph);

      try {
        const inviteData = await fetchPartyInvites();
        setIncomingPartySummaries(inviteData.incoming ?? []);
      } catch (inviteError) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Party invite refresh error", inviteError);
        }
        setIncomingPartySummaries([]);
      }

      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load friends";
      setError(message);
      setIncomingPartySummaries([]);
    } finally {
      setLoading(false);
    }
  }, [applyGraph, envelope, friendSummaries.length]);

  const scheduleRefresh = React.useCallback(() => {
    if (refreshRef.current) return;
    refreshRef.current = window.setTimeout(() => {
      refreshRef.current = null;
      void refresh();
    }, 200);
  }, [refresh]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      scheduleRefresh();
    };
    window.addEventListener(FRIENDS_GRAPH_UPDATE_EVENT, handler);
    window.addEventListener(FRIENDS_GRAPH_REFRESH_EVENT, handler);
    return () => {
      window.removeEventListener(FRIENDS_GRAPH_UPDATE_EVENT, handler);
      window.removeEventListener(FRIENDS_GRAPH_REFRESH_EVENT, handler);
    };
  }, [scheduleRefresh]);

  React.useEffect(() => {
    void refresh();
    return () => {
      if (refreshRef.current) {
        window.clearTimeout(refreshRef.current);
        refreshRef.current = null;
      }
    };
  }, [refresh]);

  const tokenProvider = React.useCallback(() => requestRealtimeToken(envelope), [envelope]);

  const presenceState = useFriendsRealtime(subscribeRealtime ? channels : null, tokenProvider, scheduleRefresh);

  const hasRealFriends = friendSummaries.length > 0;

  const friends: FriendItem[] = React.useMemo(() => {
    const mapped = mapFriendSummaries(friendSummaries, presenceState);
    if (mapped.length > 0) return mapped;
    return FALLBACK_DISPLAY_FRIENDS;
  }, [friendSummaries, presenceState]);

  const incomingRequests = React.useMemo(
    () => mapRequestSummaries(incomingSummaries, "incoming"),
    [incomingSummaries],
  );
  const outgoingRequests = React.useMemo(
    () => mapRequestSummaries(outgoingSummaries, "outgoing"),
    [outgoingSummaries],
  );
  const partyInvites = React.useMemo(
    () => mapPartyInviteSummaries(incomingPartySummaries),
    [incomingPartySummaries],
  );

  const counters: FriendsCounters = React.useMemo(
    () => ({
      friends: hasRealFriends ? friendSummaries.length : 0,
      chats: 0,
      requests: incomingSummaries.length + partyInvites.length,
    }),
    [hasRealFriends, friendSummaries.length, incomingSummaries.length, partyInvites.length],
  );

  const mutate = React.useCallback(
    async (payload: Record<string, unknown>) => {
      const { graph, data } = await updateFriendsGraph(payload, envelope);
      applyGraph(graph);

      const detail: FriendsGraphUpdateEventDetail = {};
      if (Array.isArray(data?.friends)) {
        detail.friends = data.friends as unknown[];
      }
      if (graph) {
        detail.incomingCount = graph.incomingRequests.length;
        detail.outgoingCount = graph.outgoingRequests.length;
        detail.incomingRequests = graph.incomingRequests;
        detail.outgoingRequests = graph.outgoingRequests;
      }
      broadcastFriendsGraphUpdate(detail);
      broadcastFriendsGraphRefresh();

      return data;
    },
    [applyGraph, envelope],
  );

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
      await mutate({ action: "remove", target });
    },
    [mutate],
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
      await mutate({ action: "block", target });
    },
    [mutate],
  );

  const acceptRequest = React.useCallback(async (requestId: string) => {
    await mutate({ action: "accept", requestId });
  }, [mutate]);

  const declineRequest = React.useCallback(async (requestId: string) => {
    await mutate({ action: "decline", requestId });
  }, [mutate]);

  const cancelRequest = React.useCallback(async (requestId: string) => {
    await mutate({ action: "cancel", requestId });
  }, [mutate]);

  const acceptPartyInviteRequest = React.useCallback(async (inviteId: string) => {
    const invite = await respondToPartyInvite(inviteId, "accept");
    setIncomingPartySummaries((prev) => prev.filter((invite) => invite.id !== inviteId));
    return invite;
  }, []);

  const declinePartyInviteRequest = React.useCallback(async (inviteId: string) => {
    const invite = await respondToPartyInvite(inviteId, "decline");
    setIncomingPartySummaries((prev) => prev.filter((invite) => invite.id !== inviteId));
    return invite;
  }, []);

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
    acceptPartyInvite: acceptPartyInviteRequest,
    declinePartyInvite: declinePartyInviteRequest,
    viewerId,
  } as const;
}


