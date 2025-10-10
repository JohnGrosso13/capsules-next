"use client";

import * as React from "react";
import homeStyles from "@/components/home.module.css";
import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";
import { FriendsRail } from "@/components/rail/FriendsRail";
import { RequestsList } from "@/components/friends/RequestsList";
import { PartyPanel } from "@/components/party/PartyPanel";
import { useFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { usePartyContext } from "@/components/providers/PartyProvider";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { GroupChatOverlay, type GroupChatOverlaySubmitPayload } from "@/components/chat/GroupChatOverlay";
import { useChatContext, type ChatFriendTarget, type ChatSession } from "@/components/providers/ChatProvider";
import { type FriendItem } from "@/hooks/useFriendsData";
import { UsersThree, ChatsCircle, Handshake, MicrophoneStage } from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";

type RailTab = "friends" | "party" | "chats" | "requests";

type ConnectionOverride = {
  description?: string;
  badge?: number;
};

type ConnectionOverrideMap = Partial<Record<RailTab, ConnectionOverride>>;

type ConnectionSummaryDetail = Partial<
  Record<RailTab, { description?: string | null; badge?: number | null }>
>;

type ConnectionTile = {
  key: RailTab;
  title: string;
  icon: React.ReactNode;
  description: string;
  badge: number | null;
};

const CONNECTION_TILE_DEFS: Array<{ key: RailTab; title: string; icon: React.ReactNode }> = [
  {
    key: "friends",
    title: "Friends",
    icon: <UsersThree size={28} weight="duotone" className="duo" />,
  },
  {
    key: "party",
    title: "Party",
    icon: <MicrophoneStage size={28} weight="duotone" className="duo" />,
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

function isRailTab(value: unknown): value is RailTab {
  return value === "friends" || value === "party" || value === "chats" || value === "requests";
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function countConnectedFriends(friends: FriendItem[]): number {
  return friends.reduce((total, friend) => (friend.status === "offline" ? total : total + 1), 0);
}

function formatFriendsSummary(connected: number, total: number): string {
  if (total <= 0) return "Invite friends to build your capsule.";
  if (connected <= 0) return "No friends are connected right now.";
  if (connected === 1) return "1 friend is connected.";
  if (connected <= 4) return `${connected} friends are connected.`;
  return `${connected} ${pluralize("friend", connected)} are connected right now.`;
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

export function ConnectionsRail() {
  const {
    friends,
    hasRealFriends,
    incomingRequests,
    outgoingRequests,
    removeFriend,
    acceptRequest,
    declineRequest,
    cancelRequest,
  } = useFriendsDataContext();

  const [railMode, setRailMode] = React.useState<"tiles" | "connections">("tiles");
  const [activeRailTab, setActiveRailTab] = React.useState<RailTab>("friends");

  // Chat / group chat integration
  const {
    startChat: startChatSession,
    unreadCount: chatUnreadCount,
    startGroupChat,
    addParticipantsToGroup,
    sessions: chatSessions,
  } = useChatContext();
  const {
    session: partySession,
    status: partyStatus,
    action: partyAction,
    error: partyError,
  } = usePartyContext();
  type GroupFlowState = { mode: "create" } | { mode: "invite"; sessionId: string };
  const [groupFlow, setGroupFlow] = React.useState<GroupFlowState | null>(null);
  const [groupBusy, setGroupBusy] = React.useState(false);
  const [groupError, setGroupError] = React.useState<string | null>(null);

  const friendTargetMap = React.useMemo(() => {
    const map = new Map<string, ChatFriendTarget>();
    friends.forEach((friend) => {
      if (!friend.userId) return;
      map.set(friend.userId, {
        userId: friend.userId,
        name: friend.name || friend.userId,
        avatar: friend.avatar ?? null,
      });
    });
    return map;
  }, [friends]);

  const hasEligibleFriends = React.useMemo(() => friends.some((f) => Boolean(f.userId)), [friends]);
  const partySummary = React.useMemo(() => {
    if (partyStatus === "loading") {
      if (partyAction === "create") return "Starting your party…";
      if (partyAction === "join") return "Joining the party…";
      if (partyAction === "close") return "Ending the party…";
      if (partyAction === "leave") return "Leaving the party…";
      return "Syncing party status…";
    }
    if (partySession) {
      const topic = partySession.metadata.topic?.trim();
      if (topic) return `Live now: ${topic}`;
      const ownerName = partySession.metadata.ownerDisplayName?.trim();
      if (ownerName) {
        return partySession.isOwner ? "You're hosting a party right now." : `${ownerName} is hosting a party.`;
      }
      return "A party is live right now.";
    }
    if (partyError) return "Party unavailable. Try again.";
    return "Start a drop-in voice party with friends.";
  }, [partyAction, partyError, partySession, partyStatus]);

  const closeGroupFlow = React.useCallback(() => {
    setGroupFlow(null);
    setGroupError(null);
    setGroupBusy(false);
  }, []);

  const handleOpenGroupCreator = React.useCallback(() => {
    setGroupFlow({ mode: "create" });
    setGroupError(null);
  }, []);

  const handleInviteToGroup = React.useCallback((session: ChatSession) => {
    setGroupFlow({ mode: "invite", sessionId: session.id });
    setGroupError(null);
  }, []);
  const handlePartyButtonClick = React.useCallback(() => {
    setActiveRailTab("party");
    setRailMode("connections");
  }, []);
  const handlePartyShowFriends = React.useCallback(() => {
    setActiveRailTab("friends");
    setRailMode("connections");
  }, []);

  const handleGroupSubmit = React.useCallback(
    async ({ name, participantIds }: GroupChatOverlaySubmitPayload) => {
      if (!groupFlow) return;
      if (!participantIds.length) {
        setGroupError("Select at least one friend.");
        return;
      }
      setGroupBusy(true);
      setGroupError(null);
      try {
        if (groupFlow.mode === "create") {
          const targets = participantIds
            .map((id) => friendTargetMap.get(id))
            .filter((t): t is ChatFriendTarget => Boolean(t));
          if (!targets.length) throw new Error("Those friends are unavailable right now.");
          await startGroupChat({ name, participants: targets, activate: true });
          closeGroupFlow();
          setActiveRailTab("chats");
          setRailMode("connections");
        } else {
          const session = chatSessions.find((entry) => entry.id === groupFlow.sessionId);
          if (!session) throw new Error("That chat is no longer available.");
          const existingIds = new Set(session.participants.map((p) => p.id));
          const targets = participantIds
            .filter((id) => !existingIds.has(id))
            .map((id) => friendTargetMap.get(id))
            .filter((t): t is ChatFriendTarget => Boolean(t));
          if (!targets.length) throw new Error("Select at least one new friend to add.");
          await addParticipantsToGroup(session.id, targets);
          closeGroupFlow();
          setActiveRailTab("chats");
          setRailMode("connections");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update that group chat.";
        setGroupError(message);
      } finally {
        setGroupBusy(false);
      }
    },
    [addParticipantsToGroup, chatSessions, closeGroupFlow, friendTargetMap, groupFlow, setActiveRailTab, setRailMode, startGroupChat],
  );
  const inviteSession = React.useMemo(() => {
    if (groupFlow?.mode !== "invite") return null;
    return chatSessions.find((entry) => entry.id === groupFlow.sessionId) ?? null;
  }, [chatSessions, groupFlow]);

  const overlayDisabledIds = React.useMemo(() => {
    if (!inviteSession) return [] as string[];
    return inviteSession.participants.map((participant) => participant.id);
  }, [inviteSession]);

  const overlayHeading = React.useMemo(() => {
    if (!inviteSession) return undefined;
    return `Add people to ${inviteSession.title}`;
  }, [inviteSession]);

  const [activeFriendTarget, setActiveFriendTarget] = React.useState<string | null>(null);
  const [friendActionPendingId, setFriendActionPendingId] = React.useState<string | null>(null);
  const [chatTicker, setChatTicker] = React.useState(() => Date.now());
  const pathname = usePathname();
  const [connectionOverrides, setConnectionOverrides] = React.useState<ConnectionOverrideMap>({});

  const lastChatTimestamp = React.useMemo(() => {
    let latest = 0;
    chatSessions.forEach((session) => {
      if (session.lastMessageAt) {
        const parsed = Date.parse(session.lastMessageAt);
        if (Number.isFinite(parsed)) {
          latest = Math.max(latest, parsed);
        }
      }
    });
    return latest > 0 ? latest : null;
  }, [chatSessions]);

  React.useEffect(() => {
    setChatTicker(Date.now());
    if (!lastChatTimestamp) return;
    const timer = window.setInterval(() => setChatTicker(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [lastChatTimestamp]);

  React.useEffect(() => {
    function handleChatStatus(event: Event) {
      const detail = (event as CustomEvent<{ description?: string | null }>).detail;
      if (!detail || typeof detail !== "object") return;
      if (Object.prototype.hasOwnProperty.call(detail, "description")) {
        const overrideText = sanitizeOverrideText(detail.description ?? null);
        setConnectionOverrides((prev) => {
          const next: ConnectionOverrideMap = { ...prev };
          const existing = next.chats ?? {};
          const updated: ConnectionOverride = { ...existing };
          let mutated = false;
          if (overrideText) {
            if (updated.description !== overrideText) {
              updated.description = overrideText;
              mutated = true;
            }
          } else if (updated.description) {
            delete updated.description;
            mutated = true;
          }
          if (mutated) {
            if (Object.keys(updated).length) next.chats = updated;
            else delete next.chats;
            return next;
          }
          return prev;
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
            const current = { ...(next[rawKey] ?? {}) };
            let localMutated = false;
            if (Object.prototype.hasOwnProperty.call(patchValue, "description")) {
              const normalized = sanitizeOverrideText(patchValue.description ?? null);
              if (normalized) {
                if (current.description !== normalized) {
                  current.description = normalized;
                  localMutated = true;
                }
              } else if (current.description) {
                delete current.description;
                localMutated = true;
              }
            }
            if (Object.prototype.hasOwnProperty.call(patchValue, "badge")) {
              const normalizedBadge = coerceBadge(patchValue.badge ?? null);
              if (normalizedBadge !== null) {
                if (current.badge !== normalizedBadge) {
                  current.badge = normalizedBadge;
                  localMutated = true;
                }
              } else if (current.badge !== undefined) {
                delete current.badge;
                localMutated = true;
              }
            }
            if (localMutated) {
              mutated = true;
              if (Object.keys(current).length) next[rawKey] = current;
              else delete next[rawKey];
            }
          },
        );
        return mutated ? next : prev;
      });
    }
    window.addEventListener("capsule:connections:update", handleConnectionUpdate as EventListener);
    return () =>
      window.removeEventListener("capsule:connections:update", handleConnectionUpdate as EventListener);
  }, []);

  const connectedFriends = React.useMemo(() => countConnectedFriends(friends), [friends]);
  const totalFriendsForSummary = React.useMemo(
    () => (hasRealFriends ? friends.length : 0),
    [hasRealFriends, friends.length],
  );

  const connectionTiles = React.useMemo<ConnectionTile[]>(() => {
    const now = chatTicker || Date.now();
    const defaults = {
      friends: {
        description: formatFriendsSummary(connectedFriends, totalFriendsForSummary),
        badge: connectedFriends > 0 ? connectedFriends : null,
      },
      party: {
        description: partySummary,
        badge: null,
      },
      chats: {
        description: formatChatSummary(chatUnreadCount, lastChatTimestamp, now),
        badge: chatUnreadCount > 0 ? chatUnreadCount : null,
      },
      requests: {
        description: formatRequestsSummary(incomingRequests.length, outgoingRequests.length),
        badge: incomingRequests.length > 0 ? incomingRequests.length : null,
      },
    } as const;

    return CONNECTION_TILE_DEFS.map((def) => {
      const override = connectionOverrides[def.key];
      const fallback = defaults[def.key];
      const description = override?.description ?? fallback.description;
      const candidateBadge =
        typeof override?.badge === "number" ? override.badge : fallback.badge;
      const badge = typeof candidateBadge === "number" && candidateBadge > 0 ? candidateBadge : null;
      return {
        key: def.key,
        title: def.title,
        icon: def.icon,
        description,
        badge,
      } satisfies ConnectionTile;
    });
  }, [
    connectedFriends,
    totalFriendsForSummary,
    incomingRequests.length,
    outgoingRequests.length,
    chatUnreadCount,
    lastChatTimestamp,
    connectionOverrides,
    chatTicker,
    partySummary,
  ]);

  const handleFriendNameClick = React.useCallback(
    (identifier: string) =>
      setActiveFriendTarget((prev) => (prev === identifier ? null : identifier)),
    [],
  );

  const handleFriendRemove = React.useCallback(
    async (friend: FriendItem, identifier: string) => {
      setFriendActionPendingId(identifier);
      try {
        await removeFriend(friend);
      } catch (error) {
        console.error("Friend remove error", error);
      } finally {
        setFriendActionPendingId((prev) => (prev === identifier ? null : prev));
        setActiveFriendTarget(null);
      }
    },
    [removeFriend],
  );

  const handleStartChat = React.useCallback(
    (friend: FriendItem) => {
      if (!friend.userId) return;
      try {
        const result = startChatSession({
          userId: friend.userId,
          name: friend.name || "Friend",
          avatar: friend.avatar ?? null,
        });
        if (result) {
          setActiveRailTab("chats");
          setRailMode("connections");
        }
      } catch (error) {
        console.error("Friend chat start error", error);
      }
    },
    [setActiveRailTab, setRailMode, startChatSession],
  );

  const handleAccept = React.useCallback(
    async (id: string) => {
      try {
        await acceptRequest(id);
      } catch (error) {
        console.error("Friend request accept error", error);
      }
    },
    [acceptRequest],
  );

  const handleDecline = React.useCallback(
    async (id: string) => {
      try {
        await declineRequest(id);
      } catch (error) {
        console.error("Friend request decline error", error);
      }
    },
    [declineRequest],
  );

  const handleCancel = React.useCallback(
    async (id: string) => {
      try {
        await cancelRequest(id);
      } catch (error) {
        console.error("Friend request cancel error", error);
      }
    },
    [cancelRequest],
  );

  React.useEffect(() => {
    setRailMode("tiles");
    setActiveRailTab("friends");
    setActiveFriendTarget(null);
    setFriendActionPendingId(null);
  }, [pathname]);

  const partyButtonLabel =
    partyStatus === "loading"
      ? "Connecting..."
      : partySession
        ? "Party Live"
        : "Party Voice";
  const partyButtonDisabled = partyStatus === "loading";
  const isPartyActive = activeRailTab === "party";
  const showPartyLivePill = Boolean(partySession);

  return (
    <div className={`${homeStyles.railConnections} ${homeStyles.railConnectionsOuter}`.trim()}>
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
                {tile.badge !== null ? (
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
            {/* Quick actions on the right when viewing connections */}
            <div className={homeStyles.railHeaderAction}>
              <button
                type="button"
                className={friendsStyles.chatActionButton}
                onClick={handleOpenGroupCreator}
                disabled={!hasEligibleFriends}
                aria-label="Start a group chat"
              >
                <UsersThree size={18} weight="duotone" />
                <span>Group Chat</span>
              </button>
              <button
                type="button"
                className={`${friendsStyles.chatActionButton} ${
                  isPartyActive ? friendsStyles.chatActionButtonActive : ""
                }`.trim()}
                onClick={handlePartyButtonClick}
                disabled={partyButtonDisabled}
                aria-label="Open party voice panel"
              >
                <MicrophoneStage size={18} weight="duotone" />
                <span>{partyButtonLabel}</span>
                {showPartyLivePill ? <span className={friendsStyles.livePill}>LIVE</span> : null}
              </button>
            </div>
          </div>
          <div className={homeStyles.railTabs} role="tablist" aria-label="Connections">
            {CONNECTION_TILE_DEFS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeRailTab === tab.key}
                className={`${homeStyles.railTab} ${
                  activeRailTab === tab.key ? homeStyles.railTabActive : ""
                }`.trim()}
                onClick={() => setActiveRailTab(tab.key)}
              >
                <span className={homeStyles.railTabIcon} aria-hidden>
                  {tab.icon}
                </span>
                <span>{tab.title}</span>
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
              onStartChat={(friend) => {
                handleStartChat(friend);
              }}
            />
          </div>
          <div className={homeStyles.railPanel} hidden={activeRailTab !== "party"}>
            <PartyPanel
              friends={friends}
              friendTargets={friendTargetMap}
              onShowFriends={handlePartyShowFriends}
              variant="compact"
            />
          </div>
          <div className={homeStyles.railPanel} hidden={activeRailTab !== "chats"}>
            <ChatPanel
              variant="rail"
              emptyNotice={<p>No chats yet. Start a conversation from your friends list.</p>}
              onInviteToGroup={handleInviteToGroup}
            />
          </div>
          <div className={homeStyles.railPanel} hidden={activeRailTab !== "requests"}>
            <RequestsList
              incoming={incomingRequests}
              outgoing={outgoingRequests}
              onAccept={handleAccept}
              onDecline={handleDecline}
              onCancel={handleCancel}
            />
          </div>
          {/* Overlay for group chat create/invite */}
          <GroupChatOverlay
            open={groupFlow !== null}
            mode={groupFlow?.mode ?? "create"}
            friends={friends}
            disabledIds={overlayDisabledIds}
            busy={groupBusy}
            error={groupError}
            onClose={closeGroupFlow}
            onSubmit={handleGroupSubmit}
            {...(overlayHeading ? { heading: overlayHeading } : {})}
          />
        </div>
      )}
    </div>
  );
}

export default ConnectionsRail;
