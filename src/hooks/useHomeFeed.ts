"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";
import { fetchHomeFeed, type FeedFetchOptions } from "@/services/feed/client";

import type { HomeFeedPost } from "./useHomeFeed/types";
import {
  createHomeFeedStore,
  homeFeedStore,
  type HomeFeedStore,
} from "./useHomeFeed/homeFeedStore";
import { formatExactTime, formatTimeAgo } from "./useHomeFeed/time";
import { formatFeedCount } from "./useHomeFeed/utils";

export { formatFeedCount } from "./useHomeFeed/utils";
export type { HomeFeedAttachment, HomeFeedPost } from "./useHomeFeed/types";

const FEED_LIMIT = 30;
const MESSAGE_TIMEOUT_MS = 4_000;

type FeedSnapshot = ReturnType<HomeFeedStore["getState"]>;

function useFeedData(store: HomeFeedStore): FeedSnapshot {
  const subscribe = React.useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getState = React.useCallback(() => store.getState(), [store]);
  return React.useSyncExternalStore(subscribe, getState, getState);
}

function useFeedActions(store: HomeFeedStore, canRemember: boolean) {
  const {
    refresh,
    toggleLike,
    toggleMemory,
    requestFriend,
    removeFriend,
    deletePost,
    setActiveFriendTarget,
    clearFriendMessage,
  } = store.actions;
  const getState = store.getState;

  return React.useMemo(() => {
    const refreshPosts = (signal?: AbortSignal) => {
      const options: FeedFetchOptions = { limit: FEED_LIMIT };
      if (signal) options.signal = signal;
      return refresh(options);
    };
    const handleToggleLike = (postId: string) => toggleLike(postId);
    const handleToggleMemory = (post: HomeFeedPost, desired?: boolean) => {
      const options: { canRemember: boolean; desired?: boolean } = { canRemember };
      if (typeof desired === "boolean") options.desired = desired;
      return toggleMemory(post.id, options);
    };
    const handleFriendRequest = (post: HomeFeedPost, identifier: string) =>
      requestFriend(post.id, identifier);
    const handleFriendRemove = (post: HomeFeedPost, identifier: string) =>
      removeFriend(post.id, identifier);
    const handleDelete = (postId: string) => deletePost(postId);
    const setActiveFriendTargetSafe = (next: React.SetStateAction<string | null>) => {
      const current = getState().activeFriendTarget;
      const value =
        typeof next === "function"
          ? (next as (prev: string | null) => string | null)(current)
          : next;
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
  }, [
    canRemember,
    deletePost,
    getState,
    refresh,
    removeFriend,
    requestFriend,
    setActiveFriendTarget,
    toggleLike,
    toggleMemory,
    clearFriendMessage,
  ]);
}

type UseFeedOptions = {
  refreshKey?: unknown;
  refreshEnabled?: boolean;
};

function useFeed(store: HomeFeedStore, options: UseFeedOptions = {}) {
  const { refreshKey, refreshEnabled = true } = options;
  const { user } = useCurrentUser();
  const canRemember = Boolean(user);

  const state = useFeedData(store);
  const actions = useFeedActions(store, canRemember);

  React.useEffect(() => {
    if (!refreshEnabled) return undefined;
    const controller = new AbortController();
    void actions.refreshPosts(controller.signal);
    return () => controller.abort();
  }, [actions, refreshEnabled, refreshKey]);

  React.useEffect(() => {
    if (!refreshEnabled) return undefined;
    const handleRefresh = () => {
      void actions.refreshPosts();
    };
    window.addEventListener("posts:refresh", handleRefresh);
    return () => {
      window.removeEventListener("posts:refresh", handleRefresh);
    };
  }, [actions, refreshEnabled]);

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

export function useHomeFeed() {
  return useFeed(homeFeedStore, { refreshEnabled: true });
}

export function useCapsuleFeed(capsuleId: string | null | undefined) {
  const trimmedCapsuleId = React.useMemo(() => {
    if (typeof capsuleId !== "string") return null;
    const value = capsuleId.trim();
    return value.length ? value : null;
  }, [capsuleId]);

  const capsuleStore = React.useMemo(
    () =>
      createHomeFeedStore({
        fallbackPosts: [],
        client: {
          fetch: async (options) => {
            if (!trimmedCapsuleId) {
              return { posts: [], cursor: null };
            }
            return fetchHomeFeed({ ...options, capsuleId: trimmedCapsuleId });
          },
        },
      }),
    [trimmedCapsuleId],
  );

  return useFeed(capsuleStore, {
    refreshKey: trimmedCapsuleId ?? "__no_capsule__",
    refreshEnabled: Boolean(trimmedCapsuleId),
  });
}

