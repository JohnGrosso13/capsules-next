"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";
import { normalizeMediaUrl } from "@/lib/media";

export type HomeFeedAttachment = {
  id: string;
  url: string;
  mimeType: string | null;
  name: string | null;
  thumbnailUrl: string | null;
};

export type HomeFeedPost = {
  id: string;
  dbId?: string | null;
  user_name?: string | null;
  user_avatar?: string | null;
  content?: string | null;
  media_url?: string | null;
  mediaUrl?: string | null;
  created_at?: string | null;
  owner_user_id?: string | null;
  ownerUserId?: string | null;
  owner_user_key?: string | null;
  ownerKey?: string | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  viewer_liked?: boolean | null;
  viewerLiked?: boolean | null;
  viewer_remembered?: boolean | null;
  viewerRemembered?: boolean | null;
  attachments?: HomeFeedAttachment[];
};

const fallbackPosts: HomeFeedPost[] = [
  {
    id: "sample-feed",
    dbId: "sample-feed",
    user_name: "Capsules AI",
    content: "Ask your Capsule AI to design posts, polls, and shopping drops for your community.",
    media_url: null,
    created_at: null,
    likes: 128,
    comments: 14,
    shares: 6,
    viewerLiked: false,
    attachments: [],
  },
];

export function formatFeedCount(value?: number | null): string {
  const count =
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

type FriendTarget = Record<string, unknown> | null;

function buildFriendTarget(post: HomeFeedPost): FriendTarget {
  const userId = post.owner_user_id ?? post.ownerUserId ?? null;
  const userKey = post.owner_user_key ?? post.ownerKey ?? null;
  if (!userId && !userKey) return null;
  const target: Record<string, unknown> = {};
  if (userId) target.userId = userId;
  if (userKey) target.userKey = userKey;
  if (post.user_name) target.name = post.user_name;
  if (post.user_avatar) target.avatar = post.user_avatar;
  return target;
}

export function useHomeFeed() {
  const { user } = useCurrentUser();
  const canRemember = Boolean(user);
  const [posts, setPosts] = React.useState<HomeFeedPost[]>(fallbackPosts);
  const [activeFriendTarget, setActiveFriendTarget] = React.useState<string | null>(null);
  const [friendActionPending, setFriendActionPending] = React.useState<string | null>(null);
  const [friendMessage, setFriendMessage] = React.useState<string | null>(null);
  const [likePending, setLikePending] = React.useState<Record<string, boolean>>({});
  const [memoryPending, setMemoryPending] = React.useState<Record<string, boolean>>({});
  const postsRef = React.useRef<HomeFeedPost[]>(posts);
  const refreshGeneration = React.useRef(0);

  React.useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  React.useEffect(() => {
    if (!friendMessage) return;
    const timer = window.setTimeout(() => setFriendMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [friendMessage]);

  const refreshPosts = React.useCallback(async (signal?: AbortSignal) => {
    const requestToken = ++refreshGeneration.current;
    try {
      const response = await fetch("/api/posts?limit=30", signal ? { signal } : undefined);
      if (!response.ok) {
        throw new Error(`Feed request failed (${response.status})`);
      }
      const data = (await response.json().catch(() => null)) as { posts?: unknown };
      const arr = Array.isArray(data?.posts) ? data.posts : [];
      if (!arr.length) {
        if (refreshGeneration.current === requestToken) {
          setPosts(fallbackPosts);
          setLikePending({});
          setMemoryPending({});
        }
        return;
      }
      const normalized: HomeFeedPost[] = arr.map((raw: unknown) => {
        const record = raw as Record<string, unknown>;
        let media =
          normalizeMediaUrl(record["mediaUrl"]) ?? normalizeMediaUrl(record["media_url"]) ?? null;
        const createdAt =
          typeof record["created_at"] === "string"
            ? (record["created_at"] as string)
            : typeof record["ts"] === "string"
              ? (record["ts"] as string)
              : null;
        const ownerId =
          typeof record["ownerUserId"] === "string"
            ? (record["ownerUserId"] as string)
            : typeof record["owner_user_id"] === "string"
              ? (record["owner_user_id"] as string)
              : null;
        const ownerKey =
          typeof record["ownerKey"] === "string"
            ? (record["ownerKey"] as string)
            : typeof record["owner_user_key"] === "string"
              ? (record["owner_user_key"] as string)
              : null;
        const identifier =
          typeof record["id"] === "string"
            ? record["id"]
            : typeof record["client_id"] === "string"
              ? record["client_id"]
              : (ownerId ?? crypto.randomUUID());
        const likes =
          typeof record["likes"] === "number"
            ? (record["likes"] as number)
            : typeof record["likes_count"] === "number"
              ? (record["likes_count"] as number)
              : 0;
        const comments =
          typeof record["comments"] === "number"
            ? (record["comments"] as number)
            : typeof record["comments_count"] === "number"
              ? (record["comments_count"] as number)
              : 0;
        const shares =
          typeof record["shares"] === "number"
            ? (record["shares"] as number)
            : typeof record["share_count"] === "number"
              ? (record["share_count"] as number)
              : 0;
        const viewerLiked =
          typeof record["viewerLiked"] === "boolean"
            ? (record["viewerLiked"] as boolean)
            : typeof record["viewer_liked"] === "boolean"
              ? (record["viewer_liked"] as boolean)
              : false;
        const viewerRemembered =
          typeof record["viewerRemembered"] === "boolean"
            ? (record["viewerRemembered"] as boolean)
            : typeof record["viewer_remembered"] === "boolean"
              ? (record["viewer_remembered"] as boolean)
              : false;

        const attachmentsRaw = Array.isArray(record["attachments"])
          ? (record["attachments"] as Array<Record<string, unknown>>)
          : [];
        const seenAttachmentUrls = new Set<string>();
        const attachments: HomeFeedAttachment[] = attachmentsRaw
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const data = entry as Record<string, unknown>;
            const url = normalizeMediaUrl(data["url"]);
            if (!url || seenAttachmentUrls.has(url)) return null;
            seenAttachmentUrls.add(url);
            const mime =
              typeof data["mimeType"] === "string"
                ? (data["mimeType"] as string)
                : typeof data["mime_type"] === "string"
                  ? (data["mime_type"] as string)
                  : null;
            const name =
              typeof data["name"] === "string"
                ? (data["name"] as string)
                : typeof data["title"] === "string"
                  ? (data["title"] as string)
                  : null;
            const thumbSource =
              typeof data["thumbnailUrl"] === "string"
                ? (data["thumbnailUrl"] as string)
                : typeof data["thumbnail_url"] === "string"
                  ? (data["thumbnail_url"] as string)
                  : typeof data["thumbUrl"] === "string"
                    ? (data["thumbUrl"] as string)
                    : null;
            const thumbnailUrl = normalizeMediaUrl(thumbSource);
            const identifier = data["id"];
            const id =
              typeof identifier === "string"
                ? identifier
                : typeof identifier === "number"
                  ? String(identifier)
                  : crypto.randomUUID();
            return {
              id,
              url,
              mimeType: mime ?? null,
              name: name ?? null,
              thumbnailUrl: thumbnailUrl ?? null,
            } satisfies HomeFeedAttachment;
          })
          .filter((value): value is HomeFeedAttachment => Boolean(value));
        if (!media && attachments.length) {
          const primary = attachments[0] ?? null;
          if (primary) {
            media = normalizeMediaUrl(primary.thumbnailUrl ?? primary.url) ?? primary.url;
          }
        }

        return {
          id: String(identifier),
          dbId:
            typeof record["dbId"] === "string"
              ? (record["dbId"] as string)
              : typeof record["db_id"] === "string"
                ? (record["db_id"] as string)
                : null,
          user_name:
            typeof record["user_name"] === "string"
              ? (record["user_name"] as string)
              : typeof record["userName"] === "string"
                ? (record["userName"] as string)
                : "Capsules AI",
          user_avatar:
            typeof record["user_avatar"] === "string"
              ? (record["user_avatar"] as string)
              : typeof record["userAvatar"] === "string"
                ? (record["userAvatar"] as string)
                : null,
          content: typeof record["content"] === "string" ? (record["content"] as string) : null,
          media_url: media,
          mediaUrl: media,
          created_at: createdAt,
          owner_user_id: ownerId,
          ownerUserId: ownerId,
          owner_user_key: ownerKey,
          ownerKey: ownerKey,
          likes,
          comments,
          shares,
          viewerLiked,
          viewer_remembered: viewerRemembered,
          viewerRemembered,
          attachments,
        } satisfies HomeFeedPost;
      });
      if (refreshGeneration.current === requestToken) {
        setPosts(normalized.length ? normalized : fallbackPosts);
        setLikePending({});
        setMemoryPending({});
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      console.error("Posts refresh failed", error);
    }
  }, []);

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
  }, []);

  const handleToggleMemory = React.useCallback(
    async (post: HomeFeedPost, desired?: boolean) => {
      if (!user) {
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

      let mediaUrl = normalizeMediaUrl(post.media_url) ?? normalizeMediaUrl(post.mediaUrl) ?? null;
      if (!mediaUrl && Array.isArray(post.attachments)) {
        const firstAttachment = post.attachments.find((attachment) => attachment && attachment.url);
        if (firstAttachment) {
          mediaUrl =
            normalizeMediaUrl(firstAttachment.thumbnailUrl ?? firstAttachment.url) ??
            firstAttachment.url;
        }
      }

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
    [user],
  );

  const timeAgo = React.useCallback((iso?: string | null) => {
    if (!iso) return "just now";
    const then = new Date(iso).getTime();
    const now = Date.now();
    const seconds = Math.max(1, Math.floor((now - then) / 1000));
    if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
  }, []);

  const exactTime = React.useCallback((iso?: string | null) => {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      } as Intl.DateTimeFormatOptions);
    } catch {
      return iso;
    }
  }, []);

  const handleDelete = React.useCallback((id: string) => {
    fetch(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleFriendRequest = React.useCallback(async (post: HomeFeedPost, identifier: string) => {
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
  }, []);

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
    handleDelete,
    setActiveFriendTarget,
    formatCount: formatFeedCount,
    timeAgo,
    exactTime,
    canRemember,
  };
}
