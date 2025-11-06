"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MicrophoneStage, UsersThree } from "@phosphor-icons/react/dist/ssr";

import { type FriendItem } from "@/hooks/useFriendsData";
import { FriendsTabs } from "@/components/friends/FriendsTabs";
import { RequestsList } from "@/components/friends/RequestsList";
import { useFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { ChatPanel } from "@/components/chat/ChatPanel";
import {
  GroupChatOverlay,
  type GroupChatOverlaySubmitPayload,
} from "@/components/chat/GroupChatOverlay";
import {
  useChatContext,
  type ChatFriendTarget,
  type ChatSession,
} from "@/components/providers/ChatProvider";
import { PartyPanel } from "@/components/party/PartyPanel";
import { usePartyContext } from "@/components/providers/PartyProvider";
import { FriendsList } from "@/components/friends/FriendsList";

import styles from "./friends.module.css";

const tabs = ["Friends", "Party", "Chats", "Requests"] as const;
type Tab = (typeof tabs)[number];

type TabStateHook = [Tab, (tab: Tab) => void];

type GroupFlowState = { mode: "create" } | { mode: "invite"; sessionId: string };

function useTabFromSearch(): TabStateHook {
  const searchParams = useSearchParams();
  const router = useRouter();

  const requestedTab = searchParams.get("tab");
  const normalized = React.useMemo<Tab>(() => {
    if (!requestedTab) return "Friends";
    const match = tabs.find((tab) => tab.toLowerCase() === requestedTab.toLowerCase());
    return match ?? "Friends";
  }, [requestedTab]);

  const [active, setActive] = React.useState<Tab>(normalized);
  React.useEffect(() => {
    setActive(normalized);
  }, [normalized]);

  const selectTab = React.useCallback(
    (tab: Tab) => {
      setActive(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "Friends") {
        params.delete("tab");
      } else {
        params.set("tab", tab.toLowerCase());
      }
      const query = params.toString();
      const url = query ? `?${query}` : "";
      router.replace(url, { scroll: false });
    },
    [router, searchParams],
  );

  return [active, selectTab];
}

function mergeCounters(
  friends: number,
  party: number,
  chats: number,
  requests: number,
): Record<Tab, number> {
  return {
    Friends: friends,
    Party: party,
    Chats: chats,
    Requests: requests,
  } satisfies Record<Tab, number>;
}

export function FriendsClient() {
  const {
    friends,
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
  } = useFriendsDataContext();
  const {
    startChat: startChatSession,
    unreadCount: chatUnreadCount,
    startGroupChat,
    addParticipantsToGroup,
    sessions: chatSessions,
  } = useChatContext();
  const party = usePartyContext();

  const [activeTab, selectTab] = useTabFromSearch();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [chatNotice, setChatNotice] = React.useState<string | null>(null);
  const [groupFlow, setGroupFlow] = React.useState<GroupFlowState | null>(null);
  const [groupBusy, setGroupBusy] = React.useState(false);
  const [groupError, setGroupError] = React.useState<string | null>(null);
  const searchParams = useSearchParams();
  const focusParam = searchParams.get("focus");
  const lastFocusRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  React.useEffect(() => {
    if (!chatNotice) return;
    const timer = window.setTimeout(() => setChatNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [chatNotice]);

  React.useEffect(() => {
    if (!focusParam) {
      if (highlightId !== null) {
        setHighlightId(null);
      }
      lastFocusRef.current = null;
      return;
    }

    if (loading) return;
    if (focusParam === lastFocusRef.current && highlightId) return;

    if (activeTab !== "Friends") {
      selectTab("Friends");
    }

    const match = friends.find((friend) => {
      const identifiers = [
        friend.userId ?? null,
        friend.key ?? null,
        friend.id ? String(friend.id) : null,
      ];
      return identifiers.some((identifier) => identifier === focusParam);
    });

    if (match) {
      const resolvedId =
        match.userId ?? match.key ?? (match.id ? String(match.id) : focusParam);
      lastFocusRef.current = focusParam;
      setHighlightId(resolvedId ?? focusParam);
      setNotice(`Focusing on ${match.name}`);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          if (typeof document === "undefined") return;
          const identifier = resolvedId ?? focusParam;
          if (!identifier) return;
          const escaped =
            typeof CSS !== "undefined" && typeof CSS.escape === "function"
              ? CSS.escape(identifier)
              : identifier.replace(/["\\]/g, "\\$&");
          const element = document.querySelector<HTMLElement>(`[data-friend-id="${escaped}"]`);
          element?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
        window.setTimeout(() => {
          setHighlightId((current) => (current === (resolvedId ?? focusParam) ? null : current));
        }, 4000);
      }
    } else {
      if (lastFocusRef.current !== focusParam) {
        setNotice("Friend not found.");
        lastFocusRef.current = focusParam;
      }
      setHighlightId(null);
    }
  }, [activeTab, focusParam, friends, highlightId, loading, selectTab, setNotice]);

  const hasEligibleFriends = React.useMemo(
    () => friends.some((friend) => Boolean(friend.userId)),
    [friends],
  );

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
            .filter((target): target is ChatFriendTarget => Boolean(target));
          if (!targets.length) {
            throw new Error("Those friends are unavailable right now.");
          }
          await startGroupChat({
            name,
            participants: targets,
            activate: true,
          });
          closeGroupFlow();
          setChatNotice(`Group chat${name ? ` “${name}”` : ""} created.`);
          selectTab("Chats");
        } else {
          const session = chatSessions.find((entry) => entry.id === groupFlow.sessionId);
          if (!session) {
            throw new Error("That chat is no longer available.");
          }
          const existingIds = new Set(session.participants.map((participant) => participant.id));
          const targets = participantIds
            .filter((id) => !existingIds.has(id))
            .map((id) => friendTargetMap.get(id))
            .filter((target): target is ChatFriendTarget => Boolean(target));
          if (!targets.length) {
            throw new Error("Select at least one new friend to add.");
          }
          await addParticipantsToGroup(session.id, targets);
          closeGroupFlow();
          setChatNotice("Added new members to the group.");
          selectTab("Chats");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update that group chat.";
        setGroupError(message);
      } finally {
        setGroupBusy(false);
      }
    },
    [
      addParticipantsToGroup,
      chatSessions,
      closeGroupFlow,
      friendTargetMap,
      groupFlow,
      selectTab,
      setChatNotice,
      startGroupChat,
    ],
  );

  const withPendingAction = React.useCallback(
    async (
      friend: FriendItem,
      identifier: string,
      perform: () => Promise<void>,
      successMessage: string,
    ) => {
      setPendingId(identifier);
      setError(null);
      try {
        await perform();
        setNotice(successMessage);
      } catch (err) {
        const message = err instanceof Error ? err.message : "That action failed.";
        setNotice(message);
      } finally {
        setPendingId((prev) => (prev === identifier ? null : prev));
      }
    },
    [setError],
  );

  const handleRemove = React.useCallback(
    async (friend: FriendItem, identifier: string) => {
      await withPendingAction(
        friend,
        identifier,
        () => removeFriend(friend),
        `${friend.name || "Friend"} removed.`,
      );
    },
    [removeFriend, withPendingAction],
  );

  const handleBlock = React.useCallback(
    async (friend: FriendItem, identifier: string) => {
      await withPendingAction(
        friend,
        identifier,
        () => blockFriend(friend),
        `${friend.name || "Friend"} blocked.`,
      );
    },
    [blockFriend, withPendingAction],
  );

  const handleView = React.useCallback((friend: FriendItem) => {
    const label = friend.name || "Friend";
    setNotice(`Viewing ${label} is coming soon.`);
  }, []);

  const handleStartChat = React.useCallback(
    (friend: FriendItem) => {
      const label = friend.name || "Friend";
      if (!friend.userId) {
        setNotice(`${label} is not ready for chat yet.`);
        return;
      }
      try {
        const result = startChatSession({
          userId: friend.userId,
          name: label,
          avatar: friend.avatar ?? null,
        });
        if (!result) {
          setNotice("We couldn't open that chat. Please try again.");
          return;
        }
        setNotice(null);
        selectTab("Chats");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Chat is unavailable right now.";
        setNotice(message);
      }
    },
    [selectTab, setNotice, startChatSession],
  );

  const handleAccept = React.useCallback(
    async (requestId: string) => {
      try {
        await acceptRequest(requestId);
        setNotice("Request accepted.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't accept that request.";
        setNotice(message);
      }
    },
    [acceptRequest],
  );

  const handleDecline = React.useCallback(
    async (requestId: string) => {
      try {
        await declineRequest(requestId);
        setNotice("Request declined.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't decline that request.";
        setNotice(message);
      }
    },
    [declineRequest],
  );

  const handleCancel = React.useCallback(
    async (requestId: string) => {
      try {
        await cancelRequest(requestId);
        setNotice("Request cancelled.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't cancel that request.";
        setNotice(message);
      }
    },
    [cancelRequest],
  );

  const handleAcceptInvite = React.useCallback(
    async (inviteId: string) => {
      try {
        const invite = await acceptPartyInvite(inviteId);
        if (!invite?.partyId) {
          throw new Error("Party invite did not include a party id.");
        }
        setNotice("Joining party...");
        await party.joinParty(invite.partyId, { displayName: null });
        selectTab("Party");
        setNotice(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't join that party.";
        setNotice(message);
      }
    },
    [acceptPartyInvite, party, selectTab],
  );

  const handleDeclineInvite = React.useCallback(
    async (inviteId: string) => {
      try {
        await declinePartyInvite(inviteId);
        setNotice("Invite dismissed.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't dismiss that invite.";
        setNotice(message);
      }
    },
    [declinePartyInvite],
  );

  const inviteSession =
    groupFlow?.mode === "invite"
      ? (chatSessions.find((entry) => entry.id === groupFlow.sessionId) ?? null)
      : null;

  React.useEffect(() => {
    if (groupFlow?.mode === "invite" && !inviteSession) {
      closeGroupFlow();
    }
  }, [closeGroupFlow, groupFlow, inviteSession]);

  const partyBadgeCount = React.useMemo(() => (party.session ? 1 : 0), [party.session]);

  const tabCounters = React.useMemo(
    () => mergeCounters(counters.friends, partyBadgeCount, chatUnreadCount, counters.requests),
    [counters.friends, chatUnreadCount, counters.requests, partyBadgeCount],
  );

  if (loading && friends.length === 0) {
    return <div className={styles.empty}>Loading friends...</div>;
  }

  if (error) {
    return (
      <div className={`${styles.empty} ${styles.error}`} role="alert">
        <div>{error}</div>
        <button
          type="button"
          className={styles.retryButton}
          onClick={() => {
            setError(null);
            void refresh();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const listNotice = notice;
  // Show the Group Chat action across tabs to keep it visible on desktop and mobile
  const showGroupButton = true;
  const groupButtonDisabled = !hasEligibleFriends;
  const partyButtonDisabled = false;
  const isPartyActive = activeTab === "Party";
  const partyButtonLabel = party.session ? "Party Live" : "Party Voice";
  const overlayDisabledIds = inviteSession
    ? inviteSession.participants.map((participant) => participant.id)
    : [];
  const overlayHeading = inviteSession ? `Add people to ${inviteSession.title}` : undefined;
  const overlayDescription = inviteSession
    ? "Choose friends to drop into this thread. They'll catch up from the latest message."
    : undefined;

  return (
    <>
      <section className={styles.friendsSection}>
        <div className={styles.tabsHeader}>
          <div className={styles.tabsHeaderTabs}>
            <FriendsTabs active={activeTab} counters={tabCounters} onSelect={selectTab} />
          </div>
          {showGroupButton ? (
            <div className={styles.tabsHeaderAction}>
              <button
                type="button"
                className={`${styles.chatActionButton} ${styles.groupActionButton}`}
                onClick={handleOpenGroupCreator}
                disabled={groupButtonDisabled}
              >
                <UsersThree size={18} weight="duotone" />
                <span>Group Chat</span>
              </button>
              <button
                type="button"
                className={`${styles.chatActionButton} ${styles.partyActionButton} ${
                  isPartyActive ? styles.chatActionButtonActive : ""
                }`.trim()}
                onClick={() => selectTab("Party")}
                disabled={partyButtonDisabled}
              >
                <MicrophoneStage size={18} weight="duotone" />
                <span>{partyButtonLabel}</span>
                {party.session ? <span className={styles.livePill}>LIVE</span> : null}
              </button>
            </div>
          ) : null}
        </div>

        <div
          id="panel-friends"
          role="tabpanel"
          aria-labelledby="tab-friends"
          hidden={activeTab !== "Friends"}
          className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
        >
          <FriendsList
            items={friends}
            pendingId={pendingId}
            notice={listNotice}
            highlightId={highlightId}
            onDelete={(friend, identifier) => {
              void handleRemove(friend, identifier);
            }}
            onBlock={(friend, identifier) => {
              void handleBlock(friend, identifier);
            }}
            onView={(friend) => handleView(friend)}
            onStartChat={(friend) => handleStartChat(friend)}
          />
        </div>

        <div
          id="panel-party"
          role="tabpanel"
          aria-labelledby="tab-party"
          hidden={activeTab !== "Party"}
          className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
        >
          <PartyPanel
            friends={friends}
            friendTargets={friendTargetMap}
            onShowFriends={() => selectTab("Friends")}
          />
        </div>

        <div
          id="panel-chats"
          role="tabpanel"
          aria-labelledby="tab-chats"
          hidden={activeTab !== "Chats"}
          className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
        >
          {chatNotice ? <div className={styles.notice}>{chatNotice}</div> : null}
          <ChatPanel
            variant="page"
            emptyNotice={<p>No chats yet. Start a conversation from your friends list.</p>}
            onInviteToGroup={handleInviteToGroup}
          />
        </div>

        <div
          id="panel-requests"
          role="tabpanel"
          aria-labelledby="tab-requests"
          hidden={activeTab !== "Requests"}
          className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
        >
          <RequestsList
            incoming={incomingRequests}
            outgoing={outgoingRequests}
            partyInvites={partyInvites}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onCancel={handleCancel}
            onAcceptInvite={handleAcceptInvite}
            onDeclineInvite={handleDeclineInvite}
          />
        </div>
      </section>

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
        {...(overlayDescription ? { description: overlayDescription } : {})}
      />
    </>
  );
}
