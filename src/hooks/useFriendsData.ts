"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";
import {
  useFriendsRealtime,
  type PresenceMap,
  type ChannelInfo as RealtimeChannelInfo,
} from "@/hooks/useFriendsRealtime";
import {
  FRIENDS_GRAPH_REFRESH_EVENT,
  FRIENDS_GRAPH_UPDATE_EVENT,
  broadcastFriendsGraphRefresh,
  broadcastFriendsGraphUpdate,
  type FriendsGraphUpdateEventDetail,
} from "@/hooks/useFriendsGraph";
import { buildFriendTargetPayload } from "@/hooks/useFriendActions";
import type { RealtimeAuthPayload } from "@/ports/realtime";
import type {
  FriendSummary,
  FriendRequestSummary,
  SocialGraphSnapshot,
} from "@/lib/supabase/friends";

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

export type ChannelInfo = RealtimeChannelInfo;

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
    status: "online" as const,
  },
  {
    id: "memory",
    userId: "memory",
    key: null,
    name: "Memory Bot",
    avatar: null,
    since: null,
    status: "online" as const,
  },
  {
    id: "dream",
    userId: "dream",
    key: null,
    name: "Dream Studio",
    avatar: null,
    since: null,
    status: "online" as const,
  },
];
type FriendsDataResponse = {
  graph: SocialGraphSnapshot | null;
  channels: ChannelInfo;
};

type Envelope = Record<string, unknown> | null;

async function fetchFriendsSnapshot(envelope: Envelope): Promise<FriendsDataResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (envelope) {
    try {
      headers["X-Capsules-User"] = JSON.stringify(envelope);
    } catch {
      // ignore serialization issues Ã¯Â¿Â½ request works without header
    }
  }

  const res = await fetch("/api/friends/sync", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ user: envelope ?? {} }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (payload && typeof payload?.message === "string" && payload.message) ||
      (payload && typeof payload?.error === "string" && payload.error) ||
      `Friends sync failed (${res.status})`;
    throw new Error(message);
  }

  const graph =
    payload && typeof payload.graph === "object" ? (payload.graph as SocialGraphSnapshot) : null;

  const channelsRecord =
    payload && typeof payload.channels === "object" ? (payload.channels as Record<string, unknown>) : null;

  let channels: ChannelInfo = null;
  if (channelsRecord) {
    const events = channelsRecord.events;
    const presence = channelsRecord.presence;
    if (typeof events === "string" && typeof presence === "string") {
      channels = { events, presence };
    }
  }

  return { graph, channels };
}

async function fetchRealtimeToken(envelope: Envelope): Promise<RealtimeAuthPayload> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (envelope) {
    try {
      headers["X-Capsules-User"] = JSON.stringify(envelope);
    } catch {
      // ignore header serialization failures
    }
  }

  const res = await fetch("/api/realtime/token", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ user: envelope ?? {} }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Realtime token request failed (${res.status})`);
  }
  if (!payload || typeof payload.provider !== "string") {
    throw new Error("Invalid realtime token response");
  }
  return {
    provider: payload.provider as string,
    token: payload.token,
    environment: (payload.environment ?? null) as string | null,
  };
}

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

function buildEnvelope(user: ReturnType<typeof useCurrentUser>["user"]): Envelope {
  if (!user) return null;

  const userWithAddresses = user as unknown as {
    emailAddresses?: Array<{ id: string; emailAddress?: string | null }>;
    primaryEmailAddressId?: string | null;
  };

  const addresses = userWithAddresses.emailAddresses ?? [];
  const primaryId = userWithAddresses.primaryEmailAddressId;
  const primaryEmail = (() => {
    if (primaryId) {
      const primary = addresses.find((address) => address.id === primaryId);
      if (primary?.emailAddress) return primary.emailAddress;
    }
    return addresses[0]?.emailAddress ?? null;
  })();

  const typedUser = user as unknown as {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };

  const resolvedName = (() => {
    if (typeof typedUser.name === "string" && typedUser.name.trim().length > 0) {
      return typedUser.name.trim();
    }
    const first = typeof typedUser.firstName === "string" ? typedUser.firstName.trim() : "";
    const last = typeof typedUser.lastName === "string" ? typedUser.lastName.trim() : "";
    const combined = `${first} ${last}`.trim();
    return combined.length > 0 ? combined : null;
  })();

  return {
    clerk_id: user.id,
    email: primaryEmail,
    full_name: resolvedName ?? primaryEmail ?? null,
    avatar_url: user.avatarUrl ?? null,
    provider: "clerk",
    key: `clerk:${user.id}`,
  } as Record<string, unknown>;
}

export type UseFriendsDataOptions = {
  subscribeRealtime?: boolean;
};

export function useFriendsData(options: UseFriendsDataOptions = {}) {
  const subscribeRealtime = options.subscribeRealtime ?? true;
  const { user } = useCurrentUser();

  const envelope = React.useMemo(() => buildEnvelope(user), [user]);

  const [friendSummaries, setFriendSummaries] = React.useState<FriendSummary[]>([]);
  const [incomingSummaries, setIncomingSummaries] = React.useState<FriendRequestSummary[]>([]);
  const [outgoingSummaries, setOutgoingSummaries] = React.useState<FriendRequestSummary[]>([]);
  const [channels, setChannels] = React.useState<ChannelInfo>(null);
  const [presence, setPresence] = React.useState<PresenceMap>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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
      const { graph, channels: channelData } = await fetchFriendsSnapshot(envelope);
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
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load friends";
      setError(message);
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

  const tokenProvider = React.useCallback(() => fetchRealtimeToken(envelope), [envelope]);

  useFriendsRealtime(subscribeRealtime ? channels : null, tokenProvider, scheduleRefresh, setPresence);

  const friends: FriendItem[] = React.useMemo(() => {
    const mapped = mapFriendSummaries(friendSummaries, presence);
    if (mapped.length > 0) return mapped;
    return FALLBACK_DISPLAY_FRIENDS;
  }, [friendSummaries, presence]);

  const incomingRequests = React.useMemo(
    () => mapRequestSummaries(incomingSummaries, "incoming"),
    [incomingSummaries],
  );
  const outgoingRequests = React.useMemo(
    () => mapRequestSummaries(outgoingSummaries, "outgoing"),
    [outgoingSummaries],
  );

  const counters: FriendsCounters = React.useMemo(
    () => ({
      friends: friends.length,
      chats: 0,
      requests: incomingRequests.length,
    }),
    [friends.length, incomingRequests.length],
  );

  const mutate = React.useCallback(
    async (payload: Record<string, unknown>) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (envelope) {
        try {
          headers["X-Capsules-User"] = JSON.stringify(envelope);
        } catch {
          // ignore serialization
        }
      }

      const res = await fetch("/api/friends/update", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ ...payload, user: envelope ?? {} }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          (data && typeof data?.message === "string" && data.message) ||
          (data && typeof data?.error === "string" && data.error) ||
          "Friends update failed.";
        throw new Error(message);
      }

      const graph =
        data && typeof data.graph === "object" ? (data.graph as SocialGraphSnapshot) : null;
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

  return {
    friends,
    incomingRequests,
    outgoingRequests,
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
  } as const;
}


