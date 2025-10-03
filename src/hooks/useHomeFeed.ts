"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";

import type { HomeFeedPost } from "./useHomeFeed/types";
import { useFeedRefreshState } from "./useHomeFeed/useFeedRefreshState";
import { usePostActions } from "./useHomeFeed/usePostActions";
import { formatExactTime, formatTimeAgo } from "./useHomeFeed/time";
import { formatFeedCount, normalizePosts } from "./useHomeFeed/utils";

export { formatFeedCount } from "./useHomeFeed/utils";
export type { HomeFeedAttachment, HomeFeedPost } from "./useHomeFeed/types";

const fallbackPosts: HomeFeedPost[] = [
  {
    id: "sample-feed",
    dbId: "sample-feed",
    user_name: "Capsules AI",
    content: "Ask your Capsule AI to design posts, polls, and shopping drops for your community.",
    mediaUrl: null,
    created_at: null,
    likes: 128,
    comments: 14,
    shares: 6,
    viewerLiked: false,
    attachments: [],
  },
];

export function useHomeFeed() {
  const { user } = useCurrentUser();
  const canRemember = Boolean(user);

  const [activeFriendTarget, setActiveFriendTarget] = React.useState<string | null>(null);
  const [friendMessage, setFriendMessage] = React.useState<string | null>(null);

  const {
    items: posts,
    setItems: setPosts,
    itemsRef: postsRef,
    beginRefresh,
    completeRefresh,
    failRefresh,
    hasFetched,
    isRefreshing,
  } = useFeedRefreshState<HomeFeedPost[]>(fallbackPosts);

  React.useEffect(() => {
    if (!friendMessage) return;
    const timer = window.setTimeout(() => setFriendMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [friendMessage]);

  const {
    likePending,
    memoryPending,
    friendActionPending,
    handleToggleLike,
    handleToggleMemory,
    handleFriendRequest,
    handleFriendRemove,
    handleDelete,
    resetPendingStates,
  } = usePostActions({
    postsRef,
    setPosts,
    canRemember,
    setFriendMessage,
    setActiveFriendTarget,
  });

  const refreshPosts = React.useCallback(
    async (signal?: AbortSignal) => {
      const token = beginRefresh();
      try {
        const response = await fetch("/api/posts?limit=30", signal ? { signal } : undefined);
        if (!response.ok) {
          throw new Error(`Feed request failed (${response.status})`);
        }
        const data = (await response.json().catch(() => null)) as { posts?: unknown };
        const arr = Array.isArray(data?.posts) ? data.posts : [];
        if (!arr.length) {
          if (completeRefresh(token, fallbackPosts)) {
            resetPendingStates();
          }
          return;
        }
        const normalized = normalizePosts(arr);
        if (completeRefresh(token, normalized.length ? normalized : fallbackPosts)) {
          resetPendingStates();
        }
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        failRefresh(token);
        console.error("Posts refresh failed", error);
      }
    },
    [beginRefresh, completeRefresh, failRefresh, resetPendingStates],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void refreshPosts(controller.signal);
    return () => controller.abort();
  }, [refreshPosts]);

  React.useEffect(() => {
    const handleRefresh = () => {
      void refreshPosts();
    };
    window.addEventListener("posts:refresh", handleRefresh);
    return () => {
      window.removeEventListener("posts:refresh", handleRefresh);
    };
  }, [refreshPosts]);

  return {
    posts,
    likePending,
    memoryPending,
    friendMessage,
    activeFriendTarget,
    friendActionPending,
    refreshPosts,
    handleToggleLike,
    handleToggleMemory,
    handleFriendRequest,
    handleFriendRemove,
    handleDelete,
    setActiveFriendTarget,
    formatCount: formatFeedCount,
    timeAgo: formatTimeAgo,
    exactTime: formatExactTime,
    canRemember,
    hasFetched,
    isRefreshing,
  };
}
