"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";

import type { HomeFeedPost } from "./useHomeFeed/types";
import { homeFeedStore } from "./useHomeFeed/homeFeedStore";
import { formatExactTime, formatTimeAgo } from "./useHomeFeed/time";
import { formatFeedCount } from "./useHomeFeed/utils";

export { formatFeedCount } from "./useHomeFeed/utils";
export type { HomeFeedAttachment, HomeFeedPost } from "./useHomeFeed/types";

const FEED_LIMIT = 30;
const MESSAGE_TIMEOUT_MS = 4_000;

type HomeFeedSnapshot = ReturnType<typeof homeFeedStore.getState>;


function useHomeFeedData(): HomeFeedSnapshot {
  const subscribe = React.useCallback(homeFeedStore.subscribe, []);
  const getState = React.useCallback(homeFeedStore.getState, []);
  return React.useSyncExternalStore(subscribe, getState, getState);
}

function useHomeFeedActions(canRemember: boolean) {
  const {
    refresh,
    toggleLike,
    toggleMemory,
    requestFriend,
    removeFriend,
    deletePost,
    setActiveFriendTarget,
    clearFriendMessage,
  } = homeFeedStore.actions;
  const getState = homeFeedStore.getState;

  return React.useMemo(() => {
    const refreshPosts = (signal?: AbortSignal) => refresh({ limit: FEED_LIMIT, signal });
    const handleToggleLike = (postId: string) => toggleLike(postId);
    const handleToggleMemory = (post: HomeFeedPost, desired?: boolean) =>
      toggleMemory(post.id, { desired, canRemember });
    const handleFriendRequest = (post: HomeFeedPost, identifier: string) =>
      requestFriend(post.id, identifier);
    const handleFriendRemove = (post: HomeFeedPost, identifier: string) =>
      removeFriend(post.id, identifier);
    const handleDelete = (postId: string) => deletePost(postId);
    const setActiveFriendTargetSafe = (next: React.SetStateAction<string | null>) => {
      const current = getState().activeFriendTarget;
      const value = typeof next === "function" ? (next as (prev: string | null) => string | null)(current) : next;
      setActiveFriendTarget(value);
    };

    return {
      refreshPosts,
      handleToggleLike,
      handleToggleMemory,
      handleFriendRequest,
      handleFriendRemove,
      handleDelete,
      setActiveFriendTarget: setActiveFriendTargetSafe,
      clearFriendMessage,
    } satisfies {
      refreshPosts: (signal?: AbortSignal) => Promise<void>;
      handleToggleLike: (postId: string) => Promise<void>;
      handleToggleMemory: (post: HomeFeedPost, desired?: boolean) => Promise<boolean>;
      handleFriendRequest: (post: HomeFeedPost, identifier: string) => Promise<void>;
      handleFriendRemove: (post: HomeFeedPost, identifier: string) => Promise<void>;
      handleDelete: (postId: string) => Promise<void>;
      setActiveFriendTarget: (next: React.SetStateAction<string | null>) => void;
      clearFriendMessage: () => void;
    };
  }, [canRemember, deletePost, getState, refresh, removeFriend, requestFriend, setActiveFriendTarget, toggleLike, toggleMemory, clearFriendMessage]);
}

export function useHomeFeed() {
  const { user } = useCurrentUser();
  const canRemember = Boolean(user);

  const state = useHomeFeedData();
  const actions = useHomeFeedActions(canRemember);

  React.useEffect(() => {
    const controller = new AbortController();
    void actions.refreshPosts(controller.signal);
    return () => controller.abort();
  }, [actions]);

  React.useEffect(() => {
    const handleRefresh = () => {
      void actions.refreshPosts();
    };
    window.addEventListener("posts:refresh", handleRefresh);
    return () => {
      window.removeEventListener("posts:refresh", handleRefresh);
    };
  }, [actions]);

  React.useEffect(() => {
    if (!state.friendMessage) {
      return undefined;
    }
    const timer = window.setTimeout(() => actions.clearFriendMessage(), MESSAGE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state.friendMessage, actions]);

  return {
    posts: state.posts,
    likePending: state.likePending,
    memoryPending: state.memoryPending,
    friendMessage: state.friendMessage,
    activeFriendTarget: state.activeFriendTarget,
    friendActionPending: state.friendActionPending,
    refreshPosts: actions.refreshPosts,
    handleToggleLike: actions.handleToggleLike,
    handleToggleMemory: actions.handleToggleMemory,
    handleFriendRequest: actions.handleFriendRequest,
    handleFriendRemove: actions.handleFriendRemove,
    handleDelete: actions.handleDelete,
    setActiveFriendTarget: actions.setActiveFriendTarget,
    formatCount: formatFeedCount,
    timeAgo: formatTimeAgo,
    exactTime: formatExactTime,
    canRemember,
    hasFetched: state.hasFetched,
    isRefreshing: state.isRefreshing,
  };
}
