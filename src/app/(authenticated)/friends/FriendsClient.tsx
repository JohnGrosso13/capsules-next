"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useCurrentUser } from "@/services/auth/client";

import { useFriendsRealtime, type PresenceMap } from "@/hooks/useFriendsRealtime";
import type { RealtimeAuthPayload } from "@/ports/realtime";
import type { SocialGraphSnapshot } from "@/lib/supabase/friends";

import styles from "./friends.module.css";
import { FriendsTabs } from "@/components/friends/FriendsTabs";
import { FriendsList, type FriendItem } from "@/components/friends/FriendsList";
import { RequestsList } from "@/components/friends/RequestsList";
import type { RequestItem as RequestsListItem } from "@/components/friends/RequestsList";

type ChannelInfo = { events: string; presence: string };

// presence state managed via useFriendsRealtime hook

const FALLBACK_FRIENDS: FriendItem[] = [
  {
    id: "capsules",
    userId: "capsules",
    key: null,
    name: "Capsules Team",
    avatar: null,
    since: null,
    status: "online",
  },
  {
    id: "memory",
    userId: "memory",
    key: null,
    name: "Memory Bot",
    avatar: null,
    since: null,
    status: "online",
  },
  {
    id: "dream",
    userId: "dream",
    key: null,
    name: "Dream Studio",
    avatar: null,
    since: null,
    status: "online",
  },
];

const tabs = ["Friends", "Chats", "Requests"] as const;
type Tab = (typeof tabs)[number];

async function fetchGraph(
  envelope: Record<string, unknown> | null,
): Promise<{ graph: SocialGraphSnapshot; channels: ChannelInfo; friends: FriendItem[] } | null> {
  const res = await fetch("/api/friends/sync", {
    method: "POST",
    credentials: "include",
    headers: (() => {
      const h: Record<string, string> = { "Content-Type": "application/json" };
      try {
        if (envelope) h["X-Capsules-User"] = JSON.stringify(envelope);
      } catch {}
      return h;
    })(),
    body: JSON.stringify({ user: envelope ?? {} }),
  });
  if (!res.ok) {
    console.error("friends sync failed", await res.text());
    return null;
  }
  const data = await res.json();
  if (!data?.graph) return null;
  return {
    graph: data.graph as SocialGraphSnapshot,
    channels: ((data.channels ?? null) as ChannelInfo | null) ?? { events: "", presence: "" },
    friends: Array.isArray(data.friends) ? (data.friends as FriendItem[]) : [],
  };
}

async function fetchToken(envelope: Record<string, unknown> | null): Promise<RealtimeAuthPayload> {
  const res = await fetch("/api/realtime/token", {
    method: "POST",
    credentials: "include",
    headers: (() => {
      const h: Record<string, string> = { "Content-Type": "application/json" };
      try {
        if (envelope) h["X-Capsules-User"] = JSON.stringify(envelope);
      } catch {}
      return h;
    })(),
    body: JSON.stringify({ user: envelope ?? {} }),
  });
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status})`);
  }
  const data = await res.json();
  if (!data || typeof data.provider !== "string") {
    throw new Error("Invalid realtime token response");
  }
  return {
    provider: data.provider as string,
    token: data.token,
    environment: (data.environment ?? null) as string | null,
  };
}

export function FriendsClient() {
  const { user } = useCurrentUser();
  const currentUserName = React.useMemo(() => {
    if (!user) return null;
    return user.name ?? user.email ?? null;
  }, [user]);
  const currentUserAvatar = user?.avatarUrl ?? null;
  const currentUserEnvelope = React.useMemo(() => {
    if (!user) return null;
    return {
      clerk_id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      full_name: currentUserName ?? null,
      avatar_url: currentUserAvatar ?? null,
      provider: "clerk",
      key: `clerk:${user.id}`,
    } as Record<string, unknown>;
  }, [user, currentUserName, currentUserAvatar]);
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedTab = searchParams.get("tab");
  const normalized = React.useMemo<Tab>(
    () => tabs.find((tab) => tab.toLowerCase() === (requestedTab ?? "").toLowerCase()) ?? "Friends",
    [requestedTab],
  );

  const [active, setActive] = React.useState<Tab>(normalized);
  React.useEffect(() => {
    setActive(normalized);
  }, [normalized]);

  const [graph, setGraph] = React.useState<SocialGraphSnapshot | null>(null);
  const [channels, setChannels] = React.useState<ChannelInfo | null>(null);
  const [presence, setPresence] = React.useState<PresenceMap>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const refreshPending = React.useRef(false);

  const scheduleRefresh = React.useCallback(() => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    window.setTimeout(async () => {
      try {
        const data = await fetchGraph(currentUserEnvelope);
        if (data) {
          setGraph(data.graph);
          setChannels(data.channels);
        }
      } finally {
        refreshPending.current = false;
      }
    }, 200);
  }, [currentUserEnvelope]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchGraph(currentUserEnvelope);
        if (!mounted) return;
        if (data) {
          setGraph(data.graph);
          setChannels(data.channels);
          const initialPresence: PresenceMap = {};
          for (const friend of data.graph.friends ?? []) {
            initialPresence[friend.friendUserId] = {
              status: "offline",
              updatedAt: friend.since ?? null,
            };
          }
          setPresence(initialPresence);
          setError(null);
        } else {
          setError("Failed to load friends");
        }
      } catch (err) {
        console.error(err);
        if (mounted) setError("Failed to load friends");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentUserEnvelope]);

  useFriendsRealtime(channels, () => fetchToken(currentUserEnvelope), scheduleRefresh, setPresence);

  const mutateGraph = React.useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/friends/update", {
        method: "POST",
        credentials: "include",
        headers: (() => {
          const h: Record<string, string> = { "Content-Type": "application/json" };
          try {
            if (currentUserEnvelope) h["X-Capsules-User"] = JSON.stringify(currentUserEnvelope);
          } catch {}
          return h;
        })(),
        body: JSON.stringify({ ...payload, user: currentUserEnvelope ?? {} }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data && data.error) || "Failed to update friends");
      }
      if (data?.graph) {
        setGraph(data.graph as SocialGraphSnapshot);
      }
    },
    [currentUserEnvelope],
  );

  const selectTab = React.useCallback(
    (tab: Tab) => {
      setActive(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab.toLowerCase());
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const friends: FriendItem[] = React.useMemo(() => {
    if (!graph) return FALLBACK_FRIENDS;
    return graph.friends.map((friend) => {
      const info = presence[friend.friendUserId];
      return {
        id: friend.id,
        userId: friend.friendUserId,
        key: friend.user?.key ?? null,
        name: friend.user?.name ?? "Friend",
        avatar: friend.user?.avatarUrl ?? null,
        since: friend.since,
        status: info?.status ?? "offline",
      } satisfies FriendItem;
    });
  }, [graph, presence]);

  const incomingRequests: RequestsListItem[] = React.useMemo(() => {
    if (!graph) return [];
    return graph.incomingRequests.map((request) => ({
      id: request.id,
      user: request.user ? { name: request.user.name } : null,
      kind: "incoming",
    }));
  }, [graph]);

  const outgoingRequests: RequestsListItem[] = React.useMemo(() => {
    if (!graph) return [];
    return graph.outgoingRequests.map((request) => ({
      id: request.id,
      user: request.user ? { name: request.user.name } : null,
      kind: "outgoing",
    }));
  }, [graph]);

  const counters: Record<Tab, number> = {
    Friends: friends.length,
    Chats: 0,
    Requests: incomingRequests.length,
  };

  const [friendActionPendingId, setFriendActionPendingId] = React.useState<string | null>(null);
  const [friendNotice, setFriendNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!friendNotice) return;
    const timer = window.setTimeout(() => setFriendNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [friendNotice]);

  const buildFriendTargetPayload = React.useCallback(
    (friend: FriendItem): Record<string, string> | null => {
      const target: Record<string, string> = {};
      if (friend.userId) {
        target.userId = friend.userId;
      } else if (friend.key) {
        target.userKey = friend.key;
      } else {
        return null;
      }
      if (friend.name) target.name = friend.name;
      if (friend.avatar) target.avatar = friend.avatar;
      return target;
    },
    [],
  );

  const handleFriendRemove = React.useCallback(
    async (friend: FriendItem, identifier: string) => {
      const target = buildFriendTargetPayload(friend);
      if (!target) {
        setFriendNotice("That profile can't be removed right now.");
        return;
      }
      setFriendActionPendingId(identifier);
      const name = friend.name || "Friend";
      try {
        await mutateGraph({ action: "remove", target });
        setFriendNotice(`${name} removed from friends.`);
        scheduleRefresh();
      } catch (error) {
        console.error("Friend remove error", error);
        setFriendNotice(
          error instanceof Error && error.message ? error.message : "Couldn't remove that friend.",
        );
      } finally {
        setFriendActionPendingId(null);
      }
    },
    [buildFriendTargetPayload, mutateGraph, scheduleRefresh],
  );

  async function handleAccept(requestId: string) {
    await mutateGraph({ action: "accept", requestId });
  }

  async function handleDecline(requestId: string) {
    await mutateGraph({ action: "decline", requestId });
  }

  async function handleCancel(requestId: string) {
    await mutateGraph({ action: "cancel", requestId });
  }

  // Presence class mapping handled by FriendRow via useFriendPresence

  if (loading) {
    return <div className={styles.empty}>Loading friends…</div>;
  }

  if (error) {
    return (
      <div className={styles.empty} role="alert">
        {error}
      </div>
    );
  }

  return (
    <section className={styles.friendsSection}>
      <FriendsTabs active={active} counters={counters} onSelect={selectTab} />

      <div
        id="panel-chats"
        role="tabpanel"
        aria-labelledby="tab-chats"
        hidden={active !== "Chats"}
        className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
      >
        <div className={styles.empty}>Chats are coming soon.</div>
      </div>

      <div
        id="panel-friends"
        role="tabpanel"
        aria-labelledby="tab-friends"
        hidden={active !== "Friends"}
        className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
      >
        <FriendsList
          items={friends}
          pendingId={friendActionPendingId}
          notice={friendNotice}
          onDelete={(friend, id) => {
            void handleFriendRemove(friend, id);
          }}
        />
      </div>

      <div
        id="panel-requests"
        role="tabpanel"
        aria-labelledby="tab-requests"
        hidden={active !== "Requests"}
        className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
      >
        <RequestsList
          incoming={incomingRequests}
          outgoing={outgoingRequests}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onCancel={handleCancel}
        />
      </div>
    </section>
  );
}
