"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FeedSurface } from "@/components/feed-surface";
import { HomeFeedList } from "@/components/home-feed-list";
import feedStyles from "@/components/home-feed.module.css";
import { useCapsuleFeed } from "@/hooks/useHomeFeed";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";

type CapsuleFeedProps = {
  capsuleId: string | null;
  capsuleName: string | null;
};

const LIGHTBOX_EVENT_NAME = "capsules:lightbox:open";

export function CapsuleFeed({ capsuleId, capsuleName }: CapsuleFeedProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [focusPostId, setFocusPostId] = React.useState<string | null>(() => {
    const raw = searchParams?.get("postId");
    return raw && raw.trim().length ? raw.trim() : null;
  });
  const [clearedQueryParam, setClearedQueryParam] = React.useState(false);
  const [externalPost, setExternalPost] = React.useState<HomeFeedPost | null>(null);
  const [externalLoading, setExternalLoading] = React.useState(false);

  React.useEffect(() => {
    if (!capsuleId) {
      setFocusPostId(null);
      return;
    }
    const raw = searchParams?.get("postId");
    const normalized = raw && raw.trim().length ? raw.trim() : null;
    setFocusPostId((previous) => (previous === normalized ? previous : normalized));
    if (normalized) {
      setClearedQueryParam(false);
    }
  }, [capsuleId, searchParams]);

  const searchParamsString = searchParams?.toString() ?? "";
  React.useEffect(() => {
    if (!focusPostId || clearedQueryParam) return;
    if (!pathname) return;
    if (!searchParamsString.includes("postId=")) {
      setClearedQueryParam(true);
      return;
    }
    const params = new URLSearchParams(searchParamsString);
    if (!params.has("postId")) {
      setClearedQueryParam(true);
      return;
    }
    params.delete("postId");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    setClearedQueryParam(true);
  }, [focusPostId, clearedQueryParam, pathname, router, searchParamsString]);

  React.useEffect(() => {
    setExternalPost(null);
  }, [capsuleId]);

  const {
    posts,
    likePending,
    memoryPending,
    activeFriendTarget,
    friendActionPending,
    handleToggleLike,
    handleToggleMemory,
    handleFriendRequest,
    handleDelete,
    handleFriendRemove,
    handleFollowUser,
    handleUnfollowUser,
    setActiveFriendTarget,
    formatCount,
    timeAgo,
    exactTime,
    canRemember,
    hasFetched,
    isRefreshing,
    friendMessage,
    items,
    loadMore,
    hasMore,
    isLoadingMore,
  } = useCapsuleFeed(capsuleId);

  React.useEffect(() => {
    const handleLightboxOpen = async (event: Event) => {
      const detail = (event as CustomEvent<{ postId?: string }>).detail;
      const postId = detail?.postId;
      if (typeof postId !== "string" || !postId.trim().length) return;
      const normalized = postId.trim();
      setFocusPostId(normalized);

      if (posts.some((post) => post.id === normalized)) {
        return;
      }

      if (externalLoading) return;
      setExternalLoading(true);
      try {
        const response = await fetch("/api/posts/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: normalized }),
        });
        if (!response.ok) {
          console.warn("Lightbox fetch failed", response.status);
          return;
        }
        const data = (await response.json()) as { post?: HomeFeedPost };
        if (data?.post && typeof data.post.id === "string") {
          setExternalPost(data.post);
        }
      } catch (error) {
        console.warn("Lightbox fetch error", error);
      } finally {
        setExternalLoading(false);
      }
    };

    window.addEventListener(LIGHTBOX_EVENT_NAME, handleLightboxOpen as EventListener);
    return () => {
      window.removeEventListener(LIGHTBOX_EVENT_NAME, handleLightboxOpen as EventListener);
    };
  }, [externalLoading, posts]);

  React.useEffect(() => {
    const target = focusPostId?.trim();
    if (!target) return;
    if (externalLoading) return;
    if (externalPost?.id === target) return;
    if (posts.some((post) => post.id === target)) return;

    let cancelled = false;
    const fetchPost = async () => {
      setExternalLoading(true);
      try {
        const response = await fetch("/api/posts/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: target }),
        });
        if (!response.ok) {
          console.warn("Lightbox fetch failed", response.status);
          return;
        }
        const data = (await response.json()) as { post?: HomeFeedPost };
        if (!cancelled && data?.post && typeof data.post.id === "string") {
          setExternalPost(data.post);
        }
      } catch (error) {
        console.warn("Lightbox fetch error", error);
      } finally {
        if (!cancelled) {
          setExternalLoading(false);
        }
      }
    };

    void fetchPost();
    return () => {
      cancelled = true;
    };
  }, [externalLoading, externalPost?.id, focusPostId, posts]);

  const postsWithExternal = React.useMemo(() => {
    if (externalPost && !posts.some((post) => post.id === externalPost.id)) {
      return [externalPost, ...posts];
    }
    return posts;
  }, [externalPost, posts]);

  const itemsWithExternal = React.useMemo(() => {
    if (!externalPost) return items;
    const existing = items ?? [];
    const alreadyPresent = existing.some(
      (entry) => entry.type === "post" && entry.post.id === externalPost.id,
    );
    if (alreadyPresent) return existing;
    const injected = {
      id: externalPost.id,
      type: "post" as const,
      post: externalPost,
      score: null,
      slotInterval: null,
      pinnedAt: null,
      payload: null,
    };
    return [injected, ...existing];
  }, [externalPost, items]);

  const emptyMessage = capsuleName
    ? `No posts in ${capsuleName} yet. Be the first to share an update.`
    : "No posts in this capsule yet. Be the first to share an update.";

  return (
    <FeedSurface variant="capsule">
      {friendMessage && hasFetched ? (
        <div className={feedStyles.postFriendNotice}>{friendMessage}</div>
      ) : null}
      <HomeFeedList
        posts={postsWithExternal}
        items={itemsWithExternal}
        likePending={likePending}
        memoryPending={memoryPending}
        activeFriendTarget={activeFriendTarget}
        friendActionPending={friendActionPending}
        onToggleLike={handleToggleLike}
        onToggleMemory={handleToggleMemory}
        onFriendRequest={handleFriendRequest}
        onDelete={handleDelete}
        onRemoveFriend={handleFriendRemove}
        onFollowUser={handleFollowUser}
        onUnfollowUser={handleUnfollowUser}
        onToggleFriendTarget={setActiveFriendTarget}
        formatCount={formatCount}
        timeAgo={timeAgo}
        exactTime={exactTime}
        canRemember={canRemember}
        hasFetched={hasFetched}
        isRefreshing={isRefreshing}
        emptyMessage={emptyMessage}
        focusPostId={focusPostId}
        promoInterval={null}
        onLoadMore={loadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
      />
    </FeedSurface>
  );
}
