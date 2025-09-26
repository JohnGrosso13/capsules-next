"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import { getRealtimeClient, resetRealtimeClient, type TokenResponse } from "@/lib/realtime/ably-client";
import type { Types as AblyTypes } from "ably";
import type { FriendRequestSummary, SocialGraphSnapshot } from "@/lib/supabase/friends";

import styles from "./friends.module.css";

type PresenceStatus = "online" | "offline" | "away";

type FriendItem = {
  id: string;
  userId: string;
  key: string | null;
  name: string;
  avatar: string | null;
  since: string | null;
  status: PresenceStatus;
};

type ChannelInfo = { events: string; presence: string };

type PresenceMap = Record<string, { status: PresenceStatus; updatedAt: string | null }>;

type RequestItem = FriendRequestSummary & { kind: "incoming" | "outgoing" };

const FALLBACK_FRIENDS: FriendItem[] = [
  { id: "capsules", userId: "capsules", key: null, name: "Capsules Team", avatar: null, since: null, status: "online" },
  { id: "memory", userId: "memory", key: null, name: "Memory Bot", avatar: null, since: null, status: "online" },
  { id: "dream", userId: "dream", key: null, name: "Dream Studio", avatar: null, since: null, status: "online" },
];

const tabs = ["Friends", "Chats", "Requests"] as const;
type Tab = (typeof tabs)[number];

async function fetchGraph(envelope: Record<string, unknown> | null): Promise<{ graph: SocialGraphSnapshot; channels: ChannelInfo; friends: FriendItem[] } | null> {
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
    channels: (data.channels ?? null) as ChannelInfo | null ?? { events: "", presence: "" },
    friends: Array.isArray(data.friends) ? (data.friends as FriendItem[]) : [],
  };
}

async function fetchToken(envelope: Record<string, unknown> | null): Promise<TokenResponse> {
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
  return (await res.json()) as TokenResponse;
}

export function FriendsClient() {
  const { user } = useUser();
  const currentUserName = React.useMemo(() => {
    if (!user) return null;
    return (user.fullName && user.fullName.trim())
      || (user.username && user.username.trim())
      || (user.firstName && user.firstName.trim())
      || (user.lastName && user.lastName.trim())
      || (user.primaryEmailAddress?.emailAddress ?? null);
  }, [user]);
  const currentUserAvatar = user?.imageUrl ?? null;
  const currentUserEnvelope = React.useMemo(() => {
    if (!user) return null;
    return {
      clerk_id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      full_name: currentUserName ?? null,
      avatar_url: currentUserAvatar ?? null,
      provider: 'clerk',
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
  const realtimeCleanup = React.useRef<() => void>(() => {});

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
            initialPresence[friend.friendUserId] = { status: "offline", updatedAt: friend.since ?? null };
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

  React.useEffect(() => {
    if (!channels || !channels.events || !channels.presence) return;
    let unsubscribed = false;
    let eventsChannel: AblyTypes.RealtimeChannelPromise | null = null;
    let presenceChannel: AblyTypes.RealtimeChannelPromise | null = null;
    let visibilityHandler: (() => void) | null = null;

    getRealtimeClient(() => fetchToken(currentUserEnvelope))
      .then(async (client) => {
        if (unsubscribed) return;
        eventsChannel = client.channels.get(channels.events);
        const handleEvent = () => scheduleRefresh();
        eventsChannel.subscribe(handleEvent);

        presenceChannel = client.channels.get(channels.presence);
        presenceChannel.presence.subscribe((message) => {
          const clientId = String(message.clientId ?? "");
          if (!clientId) return;
          setPresence((prev) => ({
            ...prev,
            [clientId]: {
              status: (message.data && typeof message.data.status === "string" ? message.data.status : "online") as PresenceStatus,
              updatedAt: typeof message.data?.updatedAt === "string" ? message.data.updatedAt : null,
            },
          }));
        });

        try {
          const members = await presenceChannel.presence.get();
          const current: PresenceMap = {};
          members.forEach((member) => {
            const clientId = String(member.clientId ?? "");
            if (!clientId) return;
            current[clientId] = {
              status: (member.data && typeof member.data.status === "string" ? member.data.status : "online") as PresenceStatus,
              updatedAt: typeof member.data?.updatedAt === "string" ? member.data.updatedAt : null,
            };
          });
          setPresence((prev) => ({ ...prev, ...current }));
        } catch (err) {
          console.error("presence get failed", err);
        }

        const clientId = client.auth.clientId ? String(client.auth.clientId) : null;
        if (clientId) {
          try {
            await presenceChannel.presence.enter({ status: "online", updatedAt: new Date().toISOString() });
          } catch (err) {
            console.error("presence enter failed", err);
          }
        }

        visibilityHandler = () => {
          const status: PresenceStatus = document.visibilityState === "hidden" ? "away" : "online";
          presenceChannel?.presence.update({ status, updatedAt: new Date().toISOString() }).catch(() => {});
        };
        document.addEventListener("visibilitychange", visibilityHandler);

        realtimeCleanup.current = () => {
          eventsChannel?.unsubscribe();
          presenceChannel?.presence.unsubscribe();
          if (document.visibilityState === "hidden") {
            presenceChannel?.presence.update({ status: "offline", updatedAt: new Date().toISOString() }).catch(() => {});
          }
          presenceChannel?.presence.leave().catch(() => {});
        };
      })
      .catch((err) => {
        console.error("Realtime connect failed", err);
      });

    return () => {
      unsubscribed = true;
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      realtimeCleanup.current();
      realtimeCleanup.current = () => {};
    };
  }, [channels, scheduleRefresh, currentUserEnvelope]);

  React.useEffect(() => () => resetRealtimeClient(), []);

  const mutateGraph = React.useCallback(async (payload: Record<string, unknown>) => {
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
  }, [currentUserEnvelope]);

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

  const incomingRequests: RequestItem[] = React.useMemo(() => {
    if (!graph) return [];
    return graph.incomingRequests.map((request) => ({ ...request, kind: "incoming" }));
  }, [graph]);

  const outgoingRequests: RequestItem[] = React.useMemo(() => {
    if (!graph) return [];
    return graph.outgoingRequests.map((request) => ({ ...request, kind: "outgoing" }));
  }, [graph]);

  const counters: Record<Tab, number> = {
    Friends: friends.length,
    Chats: 0,
    Requests: incomingRequests.length,
  };

  const [activeFriendTarget, setActiveFriendTarget] = React.useState<string | null>(null);
  const [friendActionPendingId, setFriendActionPendingId] = React.useState<string | null>(null);
  const [friendNotice, setFriendNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!friendNotice) return;
    const timer = window.setTimeout(() => setFriendNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [friendNotice]);

  const buildFriendTargetPayload = React.useCallback((friend: FriendItem): Record<string, string> | null => {
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
  }, []);

  const handleFriendNameClick = React.useCallback((identifier: string) => {
    setActiveFriendTarget((prev) => (prev === identifier ? null : identifier));
  }, []);

  const handleFriendRequest = React.useCallback(
    async (friend: FriendItem, identifier: string) => {
      const target = buildFriendTargetPayload(friend);
      if (!target) {
        setFriendNotice("That profile isn't ready for requests yet.");
        return;
      }
      setFriendActionPendingId(identifier);
      try {
        await mutateGraph({ action: "request", target });
        setFriendNotice(`Friend request sent to ${friend.name}.`);
        setActiveFriendTarget(null);
        scheduleRefresh();
      } catch (error) {
        console.error("Friend request error", error);
        setFriendNotice(
          error instanceof Error && error.message ? error.message : "Couldn't send that friend request.",
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

  function statusClass(status: PresenceStatus) {
    switch (status) {
      case "online":
        return styles.online;
      case "away":
        return styles.away ?? styles.online;
      default:
        return styles.offline;
    }
  }

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
      <div className={styles.tabsSticky}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Connections"
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const index = tabs.indexOf(active);
            const next = e.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
            selectTab(tabs[next]);
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              id={`tab-${tab.toLowerCase()}`}
              className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`.trim()}
              role="tab"
              aria-selected={active === tab}
              aria-controls={`panel-${tab.toLowerCase()}`}
              tabIndex={active === tab ? 0 : -1}
              type="button"
              onClick={() => selectTab(tab)}
            >
              <span className={styles.tabContent}>
                <span className={styles.tabLabel}>{tab}</span>
              </span>
              {counters[tab] ? <span className={styles.badge}>{counters[tab]}</span> : null}
              <span className={styles.tabDescription}>
                {tab === "Friends" && "Everyone in your circle."}
                {tab === "Chats" && "Jump back into conversations."}
                {tab === "Requests" && "Approve new connections."}
              </span>
            </button>
          ))}
        </div>
      </div>

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
        <div className={`${styles.list} ${styles.listLarge}`.trim()}>
          {friendNotice ? <div className={styles.friendNotice}>{friendNotice}</div> : null}
          {friends.map((friend, index) => {
            const identifier = friend.userId ?? friend.key ?? friend.id ?? `friend-${index}`;
            const canTarget = Boolean(friend.userId || friend.key);
            const isOpen = activeFriendTarget === identifier;
            const isPending = friendActionPendingId === identifier;
            const sinceLabel = friend.since ? new Date(friend.since).toLocaleDateString() : null;
            return (
              <div key={`${identifier}-${index}`} className={styles.friendRow}>
                <span className={styles.avatarWrap}>
                  {friend.avatar ? (
                    <img className={styles.avatarImg} src={friend.avatar} alt="" aria-hidden />
                  ) : (
                    <span className={styles.avatar} aria-hidden />
                  )}
                  <span className={`${styles.presence} ${statusClass(friend.status)}`.trim()} aria-hidden />
                </span>
                <div className={styles.friendMeta}>
                  <button
                    type="button"
                    className={`${styles.friendNameButton} ${styles.friendName}`.trim()}
                    onClick={() => handleFriendNameClick(identifier)}
                    aria-expanded={isOpen}
                  >
                    {friend.name}
                  </button>
                  {sinceLabel ? <div className={styles.friendSince}>Since {sinceLabel}</div> : null}
                  {isOpen ? (
                    <div className={styles.friendActions}>
                      <button
                        type="button"
                        className={styles.friendActionButton}
                        onClick={() => handleFriendRequest(friend, identifier)}
                        disabled={!canTarget || isPending}
                        aria-busy={isPending}
                      >
                        {isPending ? "Sending..." : "Add friend"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        id="panel-requests"
        role="tabpanel"
        aria-labelledby="tab-requests"
        hidden={active !== "Requests"}
        className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
      >
        {incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
          <div className={styles.empty}>No pending requests.</div>
        ) : (
          <div className={styles.requestList}>
            {incomingRequests.map((request) => (
              <div key={request.id} className={styles.requestRow}>
                <div className={styles.requestMeta}>
                  <div className={styles.friendName}>{request.user?.name ?? "New friend"}</div>
                  <div className={styles.requestLabel}>Incoming request</div>
                </div>
                <div className={styles.requestActions}>
                  <button type="button" onClick={() => handleAccept(request.id)}>
                    Accept
                  </button>
                  <button type="button" onClick={() => handleDecline(request.id)}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {outgoingRequests.map((request) => (
              <div key={request.id} className={styles.requestRow}>
                <div className={styles.requestMeta}>
                  <div className={styles.friendName}>{request.user?.name ?? "Pending friend"}</div>
                  <div className={styles.requestLabel}>Waiting for approval</div>
                </div>
                <div className={styles.requestActions}>
                  <button type="button" onClick={() => handleCancel(request.id)}>
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

