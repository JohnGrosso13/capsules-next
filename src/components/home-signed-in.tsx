"use client";

import * as React from "react";

import styles from "./home-feed.module.css";

import { AppShell } from "./app-shell";
import { PromoRow } from "./promo-row";
import { HomeFeedList } from "./home-feed-list";
import { FeedSurface } from "./feed-surface";
import { HomeLoadingProvider, HOME_LOADING_SECTIONS } from "./home-loading";
import { useHomeFeed } from "@/hooks/useHomeFeed";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Props = {
  showPromoRow?: boolean;
  showPrompter?: boolean;
  initialPosts?: HomeFeedPost[];
  initialCursor?: string | null;
  hydrationKey?: string | null;
};

export function HomeSignedIn({
  showPromoRow = true,
  showPrompter = true,
  initialPosts,
  initialCursor,
  hydrationKey,
}: Props) {
  const searchParams = useSearchParams();
  const [focusPostId, setFocusPostId] = useState<string | null>(() => {
    const raw = searchParams?.get("postId");
    return raw && raw.trim().length ? raw.trim() : null;
  });
  const [externalPost, setExternalPost] = useState<HomeFeedPost | null>(null);
  const [externalLoading, setExternalLoading] = useState(false);

  useEffect(() => {
    const raw = searchParams?.get("postId");
    setFocusPostId((prev) => {
      const next = raw && raw.trim().length ? raw.trim() : null;
      return prev === next ? prev : next;
    });
  }, [searchParams]);

  const feedOptions = React.useMemo(
    () =>
      ({
        skipInitialRefresh: initialPosts !== undefined || initialCursor !== undefined,
        ...(initialPosts !== undefined ? { initialPosts } : {}),
        ...(initialCursor !== undefined ? { initialCursor } : {}),
        ...(hydrationKey !== undefined ? { hydrationKey } : {}),
      } satisfies Parameters<typeof useHomeFeed>[0]),
    [initialPosts, initialCursor, hydrationKey],
  );

  const {
    posts,
    items,
    likePending,
    memoryPending,
    friendMessage,
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
    loadMore,
    hasMore,
    isLoadingMore,
  } = useHomeFeed(feedOptions);

  const postsWithExternal = useMemo(() => {
    if (externalPost && !posts.some((post) => post.id === externalPost.id)) {
      return [externalPost, ...posts];
    }
    return posts;
  }, [externalPost, posts]);

  const itemsWithExternal = useMemo(() => {
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

  useEffect(() => {
    const handleLightboxOpen = async (event: Event) => {
      const detail = (event as CustomEvent<{ postId?: string }>).detail;
      const postId = detail?.postId;
      if (typeof postId !== "string" || !postId.trim().length) return;
      setFocusPostId(postId.trim());

      if (posts.some((post) => post.id === postId)) {
        return;
      }

      if (externalLoading) return;
      setExternalLoading(true);
      try {
        const response = await fetch("/api/posts/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: postId }),
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

    window.addEventListener("capsules:lightbox:open", handleLightboxOpen as EventListener);
    return () => {
      window.removeEventListener("capsules:lightbox:open", handleLightboxOpen as EventListener);
    };
  }, [externalLoading, posts]);

  useEffect(() => {
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

  return (
    <HomeLoadingProvider
      sections={
        showPromoRow
          ? HOME_LOADING_SECTIONS
          : HOME_LOADING_SECTIONS.filter((section) => section !== "promos")
      }
    >
      <AppShell
        activeNav="home"
        showPrompter={showPrompter}
        promoSlot={showPromoRow ? <PromoRow /> : null}
      >
        <FeedSurface variant="home">
          {friendMessage && hasFetched ? (
            <div className={styles.postFriendNotice}>{friendMessage}</div>
          ) : null}
          <HomeFeedList
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
            posts={postsWithExternal}
            items={itemsWithExternal}
            focusPostId={focusPostId}
            promoInterval={10}
            onLoadMore={loadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />
        </FeedSurface>
      </AppShell>
    </HomeLoadingProvider>
  );
}
