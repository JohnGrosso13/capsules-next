"use client";

import * as React from "react";
import homeStyles from "@/components/home.module.css";
import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";
import { FriendsRail } from "@/components/rail/FriendsRail";
import { useFriendsRealtime, type PresenceMap } from "@/hooks/useFriendsRealtime";
import { useFriendRequestActions } from "@/hooks/useFriendRequestActions";
import { RequestsList } from "@/components/friends/RequestsList";
import {
  useFriendActions,
  buildFriendTargetPayload as buildTarget,
} from "@/hooks/useFriendActions";
import {
  useFriendsGraph,
  type Friend,
  mapFriendList,
} from "@/hooks/useFriendsGraph";
import { UsersThree, ChatsCircle, Handshake } from "@phosphor-icons/react/dist/ssr";
type RailTab = "friends" | "chats" | "requests";

const CHAT_REMINDER_KEY = "capsule:lastChatReminder";
const CHAT_UNREAD_COUNT_KEY = "capsule:unreadChatCount";

const CONNECTION_TILE_DEFS: Array<{ key: RailTab; title: string; icon: React.ReactNode }> = [
  {
    key: "friends",
    title: "Friends",
    icon: <UsersThree size={28} weight="duotone" className="duo" />,
  },
  {
    key: "chats",
    title: "Chats",
    icon: <ChatsCircle size={28} weight="duotone" className="duo" />,
  },
  {
    key: "requests",
    title: "Requests",
    icon: <Handshake size={28} weight="duotone" className="duo" />,
  },
];

const RAIL_TAB_DEFS: Array<{ key: RailTab; label: string; icon: React.ReactNode }> =
  CONNECTION_TILE_DEFS.map(({ key, title, icon }) => ({ key, label: title, icon }));

const FALLBACK_FRIENDS: Friend[] = [
  { id: "capsules", userId: null, key: null, name: "Capsules Team", status: "online" },
  { id: "memory", userId: null, key: null, name: "Memory Bot", status: "online" },
  { id: "dream", userId: null, key: null, name: "Dream Studio", status: "online" },
];

function isRailTab(value: unknown): value is RailTab {
  return value === "friends" || value === "chats" || value === "requests";
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function formatFriendsSummary(count: number): string {
  if (count <= 0) return "Invite friends to build your capsule.";
  if (count === 1) return "1 friend is connected.";
  if (count <= 4) return `${count} friends are connected.`;
  return `${count} ${pluralize("friend", count)} are in your capsule.`;
}

function formatRelativeTime(from: number, to: number): string {
  const diff = Math.max(0, to - from);
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "moments ago";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return "1 week ago";
  return `${weeks} weeks ago`;
}

function formatChatSummary(unread: number, lastReminder: number | null, now: number): string {
  if (unread > 0) return `${unread} unread ${pluralize("chat", unread)} waiting.`;
  if (lastReminder) return `Last chat ${formatRelativeTime(lastReminder, now)}.`;
  return "You're all caught up on chats.";
}

function formatRequestsSummary(incoming: number, outgoing: number): string {
  if (incoming > 0) return `${incoming} ${pluralize("request", incoming)} need your review.`;
  if (outgoing > 0) return `Waiting on ${outgoing} ${pluralize("invitation", outgoing)}.`;
  return "No pending requests right now.";
}

function sanitizeOverrideText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 220 ? `${trimmed.slice(0, 219)}...` : trimmed;
}
function coerceBadge(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const safe = Math.max(0, Math.round(value));
  return safe > 0 ? safe : null;
}
function readStoredTimestamp(value: string | null): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
function coerceTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return readStoredTimestamp(value);
  return null;
}

type ConnectionOverrideMap = Partial<Record<RailTab, { description?: string; badge?: number }>>;
type ConnectionSummaryDetail = Partial<
  Record<RailTab, { description?: string | null; badge?: number | null }>
>;

export function ConnectionsRail() {
  const {
    friends,
    setFriends,
    incomingRequests,
    outgoingRequests,
    incomingRequestCount,
    outgoingRequestCount,
    channels,
    refresh,
  } = useFriendsGraph(FALLBACK_FRIENDS);

  const requestActions = useFriendRequestActions(refresh);
  const noopSetPresence = React.useCallback<React.Dispatch<React.SetStateAction<PresenceMap>>>(() => undefined, []);

  const realtimeTokenProvider = React.useCallback(async () => {
    const res = await fetch("/api/realtime/token", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: {} }),
    });
    const data = await res.json();
    return { provider: data.provider, token: data.token, environment: data.environment } as any;
  }, []);

  const handleRealtimeEvent = React.useCallback(() => {
    void refresh();
  }, [refresh]);

  useFriendsRealtime(
    channels,
    realtimeTokenProvider,
    handleRealtimeEvent,
    noopSetPresence,
  );

  const [railMode, setRailMode] = React.useState<"tiles" | "connections">("tiles");
  const [activeRailTab, setActiveRailTab] = React.useState<RailTab>("friends");
  const [activeFriendTarget, setActiveFriendTarget] = React.useState<string | null>(null);
  const [friendActionPendingId, setFriendActionPendingId] = React.useState<string | null>(null);
  const [unreadChats, setUnreadChats] = React.useState(0);
  const [lastChatReminder, setLastChatReminder] = React.useState<number | null>(null);
  const [chatTicker, setChatTicker] = React.useState(0);
  const [connectionOverrides, setConnectionOverrides] = React.useState<ConnectionOverrideMap>({});

  const convertFriends = React.useCallback(
    (items: unknown[]): Friend[] => mapFriendList(items),
    [],
  );
  React.useEffect(() => {
    try {
      const storedUnread = localStorage.getItem(CHAT_UNREAD_COUNT_KEY);
      if (storedUnread !== null) {
        const parsed = Number.parseInt(storedUnread, 10);
        if (!Number.isNaN(parsed)) setUnreadChats(Math.max(0, parsed));
      }
      const storedReminderRaw = localStorage.getItem(CHAT_REMINDER_KEY);
      const storedReminder = readStoredTimestamp(storedReminderRaw);
      if (storedReminder !== null) setLastChatReminder(storedReminder);
    } catch {}
  }, []);

  React.useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (!event.key) return;
      if (event.key === CHAT_UNREAD_COUNT_KEY) {
        if (event.newValue === null) setUnreadChats(0);
        else {
          const parsed = Number.parseInt(event.newValue, 10);
          if (!Number.isNaN(parsed)) setUnreadChats(Math.max(0, parsed));
        }
      }
      if (event.key === CHAT_REMINDER_KEY) {
        if (event.newValue === null) setLastChatReminder(null);
        else {
          const timestamp = readStoredTimestamp(event.newValue);
          if (timestamp !== null) setLastChatReminder(timestamp);
        }
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  React.useEffect(() => {
    try {
      if (unreadChats > 0) localStorage.setItem(CHAT_UNREAD_COUNT_KEY, String(unreadChats));
      else localStorage.removeItem(CHAT_UNREAD_COUNT_KEY);
    } catch {}
  }, [unreadChats]);
  React.useEffect(() => {
    try {
      if (lastChatReminder) localStorage.setItem(CHAT_REMINDER_KEY, String(lastChatReminder));
      else localStorage.removeItem(CHAT_REMINDER_KEY);
    } catch {}
  }, [lastChatReminder]);

  React.useEffect(() => {
    if (!lastChatReminder) return;
    setChatTicker(Date.now());
    const timer = window.setInterval(() => setChatTicker(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [lastChatReminder]);

  React.useEffect(() => {
    function handleChatStatus(event: Event) {
      const detail = (
        event as CustomEvent<{
          unreadCount?: number;
          lastReceivedAt?: number | string | null;
          description?: string | null;
        }>
      ).detail;
      if (!detail || typeof detail !== "object") return;
      if (typeof detail.unreadCount === "number" && Number.isFinite(detail.unreadCount))
        setUnreadChats(Math.max(0, Math.round(detail.unreadCount)));
      if (Object.prototype.hasOwnProperty.call(detail, "lastReceivedAt")) {
        const raw = (detail as { lastReceivedAt?: number | string | null }).lastReceivedAt;
        if (raw === null) setLastChatReminder(null);
        else if (raw !== undefined) {
          const timestamp = coerceTimestamp(raw);
          if (timestamp !== null) setLastChatReminder(timestamp);
        }
      }
      if (Object.prototype.hasOwnProperty.call(detail, "description")) {
        const overrideText = sanitizeOverrideText(
          (detail as { description?: string | null }).description ?? null,
        );
        setConnectionOverrides((prev) => {
          const next: ConnectionOverrideMap = { ...prev };
          const existing = next.chats ?? {};
          let changed = false;
          if (overrideText) {
            if (existing.description !== overrideText) {
              next.chats = { ...existing, description: overrideText };
              changed = true;
            }
          } else if (existing.description) {
            const rest = { ...existing };
            delete (rest as { description?: string }).description;
            if (Object.keys(rest).length)
              next.chats = rest as { description?: string; badge?: number };
            else delete next.chats;
            changed = true;
          }
          return changed ? next : prev;
        });
      }
    }
    window.addEventListener("capsule:chat:status", handleChatStatus as EventListener);
    return () =>
      window.removeEventListener("capsule:chat:status", handleChatStatus as EventListener);
  }, []);

  React.useEffect(() => {
    function handleConnectionUpdate(event: Event) {
      const detail = (event as CustomEvent<ConnectionSummaryDetail>).detail;
      if (!detail || typeof detail !== "object") return;
      setConnectionOverrides((prev) => {
        let mutated = false;
        const next: ConnectionOverrideMap = { ...prev };
        (Object.entries(detail) as [string, ConnectionSummaryDetail[RailTab]][]).forEach(
          ([rawKey, patch]) => {
            if (!isRailTab(rawKey)) return;
            if (patch == null) {
              if (next[rawKey]) {
                delete next[rawKey];
                mutated = true;
              }
              return;
            }
            const patchValue = patch as { description?: string | null; badge?: number | null };
            const current = { ...(next[rawKey] ?? {}) } as { description?: string; badge?: number };
            let localChanged = false;
            if (Object.prototype.hasOwnProperty.call(patchValue, "description")) {
              const normalized = sanitizeOverrideText(patchValue.description ?? null);
              if (normalized) {
                if (current.description !== normalized) {
                  current.description = normalized;
                  localChanged = true;
                }
              } else if (current.description) {
                delete current.description;
                localChanged = true;
              }
            }
            if (Object.prototype.hasOwnProperty.call(patchValue, "badge")) {
              const badgeRaw = patchValue.badge;
              if (badgeRaw === null) {
                if (current.badge !== undefined) {
                  delete current.badge;
                  localChanged = true;
                }
              } else {
                const normalizedBadge = coerceBadge(badgeRaw);
                if (normalizedBadge !== null) {
                  if (current.badge !== normalizedBadge) {
                    current.badge = normalizedBadge;
                    localChanged = true;
                  }
                } else if (current.badge !== undefined) {
                  delete current.badge;
                  localChanged = true;
                }
              }
            }
            if (localChanged) {
              mutated = true;
              if (Object.keys(current).length) next[rawKey] = current;
              else if (next[rawKey]) delete next[rawKey];
            }
          },
        );
        return mutated ? next : prev;
      });
    }
    window.addEventListener("capsule:connections:update", handleConnectionUpdate as EventListener);
    return () =>
      window.removeEventListener(
        "capsule:connections:update",
        handleConnectionUpdate as EventListener,
      );
  }, []);

  const connectionTiles = React.useMemo(() => {
    const now = chatTicker || Date.now();
    const defaults = {
      friends: {
        description: formatFriendsSummary(friends.length),
        badge: friends.length > 0 ? friends.length : null,
      },
      chats: {
        description: formatChatSummary(unreadChats, lastChatReminder, now),
        badge: unreadChats > 0 ? unreadChats : null,
      },
      requests: {
        description: formatRequestsSummary(incomingRequestCount, outgoingRequestCount),
        badge: incomingRequestCount > 0 ? incomingRequestCount : null,
      },
    } as const;
    return CONNECTION_TILE_DEFS.map((def) => {
      const override = connectionOverrides[def.key];
      const fallback = defaults[def.key];
      const description = override?.description ?? fallback.description;
      const badgeValue = override?.badge ?? fallback.badge;
      const badge = typeof badgeValue === "number" && badgeValue > 0 ? badgeValue : undefined;
      return { ...def, description, badge } as const;
    });
  }, [
    friends.length,
    unreadChats,
    lastChatReminder,
    incomingRequestCount,
    outgoingRequestCount,
    connectionOverrides,
    chatTicker,
  ]);

  const handleFriendNameClick = React.useCallback(
    (identifier: string) =>
      setActiveFriendTarget((prev) => (prev === identifier ? null : identifier)),
    [],
  );
  const { remove: removeFriend } = useFriendActions();

  const handleFriendRemove = React.useCallback(
    async (friend: Friend, identifier: string) => {
      const target = buildTarget(friend);
      if (!target) return;
      setFriendActionPendingId(identifier);
      try {
        const data = await removeFriend(target);
        if (data && typeof data === "object") {
          const friendsData = (data as { friends?: unknown[] }).friends;
          if (Array.isArray(friendsData)) {
            setFriends(convertFriends(friendsData));
          }
        }
      } catch (error) {
        console.error("Friend remove error", error);
      } finally {
        setFriendActionPendingId(null);
        setActiveFriendTarget(null);
      }
    },
    [removeFriend, convertFriends, setFriends],
  );

  return (
    <div className={homeStyles.railConnections}>
      {railMode === "tiles" ? (
        <div className={homeStyles.connectionTiles}>
          {connectionTiles.map((tile) => (
            <button
              key={tile.key}
              type="button"
              data-tile={tile.key}
              className={homeStyles.connectionTile}
              onClick={() => {
                setActiveRailTab(tile.key);
                setRailMode("connections");
              }}
            >
              <div className={homeStyles.connectionTileHeader}>
                <div className={homeStyles.connectionTileMeta}>
                  <span className={homeStyles.connectionTileIcon} aria-hidden>
                    {tile.icon}
                  </span>
                  <span className={homeStyles.connectionTileTitle}>{tile.title}</span>
                </div>
                {tile.badge ? (
                  <span className={homeStyles.connectionTileBadge}>{tile.badge}</span>
                ) : null}
              </div>
              <p className={homeStyles.connectionTileDescription}>{tile.description}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className={homeStyles.railConnections}>
          <div className={homeStyles.railHeaderRow}>
            <button
              type="button"
              className={homeStyles.railBackBtn}
              aria-label="Back to tiles"
              onClick={() => setRailMode("tiles")}
            >
              &lt;
            </button>
          </div>
          <div className={homeStyles.railTabs} role="tablist" aria-label="Connections">
            {RAIL_TAB_DEFS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeRailTab === tab.key}
                className={`${homeStyles.railTab} ${activeRailTab === tab.key ? homeStyles.railTabActive : ""}`.trim()}
                onClick={() => setActiveRailTab(tab.key)}
              >
                <span className={homeStyles.railTabIcon} aria-hidden>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div className={homeStyles.railPanel} hidden={activeRailTab !== "friends"}>
            <FriendsRail
              friends={friends}
              pendingId={friendActionPendingId}
              activeTarget={activeFriendTarget}
              onNameClick={handleFriendNameClick}
              onDelete={handleFriendRemove}
            />
          </div>
          <div className={homeStyles.railPanel} hidden={activeRailTab !== "chats"}>
            <div className={friendsStyles.empty}>Chats are coming soon.</div>
          </div>
          <div className={homeStyles.railPanel} hidden={activeRailTab !== "requests"}>
            <RequestsList
              incoming={incomingRequests.map((it) => ({ id: it.id, user: it.user ?? null, kind: "incoming" }))}
              outgoing={outgoingRequests.map((it) => ({ id: it.id, user: it.user ?? null, kind: "outgoing" }))}
              onAccept={async (id) => {
                try {
                  await requestActions.accept(id);
                } catch (error) {
                  console.error("Friend request accept error", error);
                }
              }}
              onDecline={async (id) => {
                try {
                  await requestActions.decline(id);
                } catch (error) {
                  console.error("Friend request decline error", error);
                }
              }}
              onCancel={async (id) => {
                try {
                  await requestActions.cancel(id);
                } catch (error) {
                  console.error("Friend request cancel error", error);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectionsRail;














