"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useFriendsData, type FriendItem } from "@/hooks/useFriendsData";
import { FriendsTabs } from "@/components/friends/FriendsTabs";
import { FriendsList } from "@/components/friends/FriendsList";
import { RequestsList } from "@/components/friends/RequestsList";

import styles from "./friends.module.css";

const tabs = ["Friends", "Chats", "Requests"] as const;
type Tab = (typeof tabs)[number];

type TabStateHook = [Tab, (tab: Tab) => void];

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

function mergeCounters(friends: number, requests: number): Record<Tab, number> {
  return {
    Friends: friends,
    Chats: 0,
    Requests: requests,
  } satisfies Record<Tab, number>;
}

export function FriendsClient() {
  const {
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
  } = useFriendsData();

  const [activeTab, selectTab] = useTabFromSearch();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
      await withPendingAction(friend, identifier, () => removeFriend(friend), `${friend.name || "Friend"} removed.`);
    },
    [removeFriend, withPendingAction],
  );

  const handleBlock = React.useCallback(
    async (friend: FriendItem, identifier: string) => {
      await withPendingAction(friend, identifier, () => blockFriend(friend), `${friend.name || "Friend"} blocked.`);
    },
    [blockFriend, withPendingAction],
  );

  const handleView = React.useCallback((friend: FriendItem) => {
    const label = friend.name || "Friend";
    setNotice(`Viewing ${label} is coming soon.`);
  }, []);

  const handleStartChat = React.useCallback((friend: FriendItem) => {
    const label = friend.name || "Friend";
    setNotice(`Chat with ${label} is coming soon.`);
  }, []);

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

  const tabCounters = React.useMemo(
    () => mergeCounters(counters.friends, counters.requests),
    [counters.friends, counters.requests],
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

  return (
    <section className={styles.friendsSection}>
      <FriendsTabs active={activeTab} counters={tabCounters} onSelect={selectTab} />

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
        id="panel-chats"
        role="tabpanel"
        aria-labelledby="tab-chats"
        hidden={activeTab !== "Chats"}
        className={`${styles.tabPanel} ${styles.panelFull}`.trim()}
      >
        <div className={styles.empty}>Chats are coming soon.</div>
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
          onAccept={handleAccept}
          onDecline={handleDecline}
          onCancel={handleCancel}
        />
      </div>
    </section>
  );
}
