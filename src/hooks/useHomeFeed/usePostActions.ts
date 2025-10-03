"use client";

import * as React from "react";

import { broadcastFriendsGraphRefresh } from "@/hooks/useFriendsGraph";

import type { HomeFeedPost } from "./types";
import { buildFriendTarget, resolvePostMediaUrl } from "./utils";

type PostsRef = React.MutableRefObject<HomeFeedPost[]>;

export type UsePostActionsOptions = {
  postsRef: PostsRef;
  setPosts: React.Dispatch<React.SetStateAction<HomeFeedPost[]>>;
  canRemember: boolean;
  setFriendMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveFriendTarget: React.Dispatch<React.SetStateAction<string | null>>;
};

export type PostActions = {
  likePending: Record<string, boolean>;
  memoryPending: Record<string, boolean>;
  friendActionPending: string | null;
  handleToggleLike: (postKey: string) => Promise<void>;
  handleToggleMemory: (post: HomeFeedPost, desired?: boolean) => Promise<boolean>;
  handleFriendRequest: (post: HomeFeedPost, identifier: string) => Promise<void>;
  handleFriendRemove: (post: HomeFeedPost, identifier: string) => Promise<void>;
  handleDelete: (id: string) => void;
  resetPendingStates: () => void;
};

export function usePostActions(options: UsePostActionsOptions): PostActions {
  const { postsRef, setPosts, canRemember, setFriendMessage, setActiveFriendTarget } = options;

  const [likePending, setLikePending] = React.useState<Record<string, boolean>>({});
  const [memoryPending, setMemoryPending] = React.useState<Record<string, boolean>>({});
  const [friendActionPending, setFriendActionPending] = React.useState<string | null>(null);

  const resetPendingStates = React.useCallback(() => {
    setLikePending({});
    setMemoryPending({});
    setFriendActionPending(null);
  }, []);

  const handleToggleLike = React.useCallback(async (postKey: string) => {
    const currentPosts = postsRef.current;
    const target = currentPosts.find((item) => item.id === postKey);
    if (!target) return;

    const previousLiked = Boolean(target.viewerLiked);
    const baseLikes = typeof target.likes === "number" ? target.likes : 0;
    const nextLiked = !previousLiked;
    const optimisticLikes = Math.max(0, nextLiked ? baseLikes + 1 : baseLikes - 1);
    const requestId =
      typeof target.dbId === "string" && target.dbId?.trim() ? target.dbId : target.id;

    setLikePending((prev) => ({ ...prev, [postKey]: true }));
    setPosts((prev) =>
      prev.map((item) =>
        item.id === postKey ? { ...item, viewerLiked: nextLiked, likes: optimisticLikes } : item,
      ),
    );

    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(requestId)}/like`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextLiked ? "like" : "unlike" }),
      });
      if (!response.ok) {
        throw new Error(`Like request failed (${response.status})`);
      }
      const payload = await response.json().catch(() => null);
      const confirmedLikes = typeof payload?.likes === "number" ? payload.likes : optimisticLikes;
      setPosts((prev) =>
        prev.map((item) =>
          item.id === postKey ? { ...item, viewerLiked: nextLiked, likes: confirmedLikes } : item,
        ),
      );
    } catch (error) {
      console.error("Like toggle failed", error);
      setPosts((prev) =>
        prev.map((item) =>
          item.id === postKey ? { ...item, viewerLiked: previousLiked, likes: baseLikes } : item,
        ),
      );
    } finally {
      setLikePending((prev) => {
        const next = { ...prev };
        delete next[postKey];
        return next;
      });
    }
  }, [postsRef, setPosts]);

  const handleToggleMemory = React.useCallback(
    async (post: HomeFeedPost, desired?: boolean) => {
      if (!canRemember) {
        throw new Error("Authentication required");
      }

      const postKey = post.id;
      const previousRemembered = Boolean(post.viewerRemembered ?? post.viewer_remembered);
      const nextRemembered = typeof desired === "boolean" ? desired : !previousRemembered;

      if (nextRemembered === previousRemembered) {
        return previousRemembered;
      }

      const requestId =
        typeof post.dbId === "string" && post.dbId.trim().length ? post.dbId : post.id;

      const mediaUrl = resolvePostMediaUrl(post);

      setMemoryPending((prev) => ({ ...prev, [postKey]: true }));
      setPosts((prev) =>
        prev.map((item) =>
          item.id === postKey
            ? {
                ...item,
                viewerRemembered: nextRemembered,
                viewer_remembered: nextRemembered,
              }
            : item,
        ),
      );

      try {
        const response = await fetch(`/api/posts/${encodeURIComponent(requestId)}/memory`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            nextRemembered
              ? {
                  action: "remember",
                  payload: {
                    mediaUrl,
                    content: typeof post.content === "string" ? post.content : null,
                    userName: post.user_name ?? null,
                  },
                }
              : { action: "forget" },
          ),
        });

        if (!response.ok) {
          throw new Error(`Memory request failed (${response.status})`);
        }

        const payload = (await response.json().catch(() => null)) as {
          remembered?: boolean;
        } | null;
        const confirmed =
          typeof payload?.remembered === "boolean" ? payload.remembered : nextRemembered;

        setPosts((prev) =>
          prev.map((item) =>
            item.id === postKey
              ? {
                  ...item,
                  viewerRemembered: confirmed,
                  viewer_remembered: confirmed,
                }
              : item,
          ),
        );

        return confirmed;
      } catch (error) {
        console.error("Memory toggle failed", error);
        setPosts((prev) =>
          prev.map((item) =>
            item.id === postKey
              ? {
                  ...item,
                  viewerRemembered: previousRemembered,
                  viewer_remembered: previousRemembered,
                }
              : item,
          ),
        );
        throw error;
      } finally {
        setMemoryPending((prev) => {
          const next = { ...prev };
          delete next[postKey];
          return next;
        });
      }
    },
    [canRemember, setPosts],
  );

  const handleDelete = React.useCallback((id: string) => {
    fetch(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, [setPosts]);

  const handleFriendRequest = React.useCallback(
    async (post: HomeFeedPost, identifier: string) => {
      const target = buildFriendTarget(post);
      if (!target) {
        setFriendMessage("That profile isn't ready for requests yet.");
        return;
      }
      setFriendActionPending(identifier);
      try {
        const res = await fetch("/api/friends/update", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request", target }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (data && typeof data?.message === "string" && data.message) ||
            (data && typeof data?.error === "string" && data.error) ||
            "Could not send that friend request.";
          throw new Error(message);
        }
        setFriendMessage(`Friend request sent to ${post.user_name || "this member"}.`);
        setActiveFriendTarget(null);
        broadcastFriendsGraphRefresh();
      } catch (error) {
        console.error("Post friend request error", error);
        setFriendMessage(
          error instanceof Error && error.message
            ? error.message
            : "Couldn't send that friend request.",
        );
      } finally {
        setFriendActionPending(null);
      }
    },
    [setFriendMessage, setActiveFriendTarget],
  );

  const handleFriendRemove = React.useCallback(
    async (post: HomeFeedPost, identifier: string) => {
      const target = buildFriendTarget(post);
      if (!target) {
        setFriendMessage("That profile isn't ready for removal yet.");
        return;
      }
      setFriendActionPending(identifier);
      try {
        const res = await fetch("/api/friends/update", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", target }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (data && typeof data?.message === "string" && data.message) ||
            (data && typeof data?.error === "string" && data.error) ||
            "Couldn't remove that friend.";
          throw new Error(message);
        }
        setFriendMessage(`${post.user_name || "Friend"} removed.`);
        setActiveFriendTarget(null);
        broadcastFriendsGraphRefresh();
      } catch (error) {
        console.error("Post friend removal error", error);
        setFriendMessage(
          error instanceof Error && error.message ? error.message : "Couldn't remove that friend.",
        );
      } finally {
        setFriendActionPending(null);
      }
    },
    [setFriendMessage, setActiveFriendTarget],
  );

  return {
    likePending,
    memoryPending,
    friendActionPending,
    handleToggleLike,
    handleToggleMemory,
    handleFriendRequest,
    handleFriendRemove,
    handleDelete,
    resetPendingStates,
  };
}
