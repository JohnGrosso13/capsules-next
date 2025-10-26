"use client";

import * as React from "react";

import styles from "./home-feed.module.css";

import { AppShell } from "./app-shell";
import { PromoRow } from "./promo-row";
import { HomeFeedList } from "./home-feed-list";
import { useHomeFeed } from "@/hooks/useHomeFeed";

type Props = {
  showPromoRow?: boolean;
  showPrompter?: boolean;
};

export function HomeSignedIn({ showPromoRow = true, showPrompter = true }: Props) {
  const {
    posts,
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
    setActiveFriendTarget,
    formatCount,
    timeAgo,
    exactTime,
    canRemember,
    hasFetched,
    isRefreshing,
  } = useHomeFeed();

  return (
    <AppShell
      activeNav="home"
      showPrompter={showPrompter}
      promoSlot={showPromoRow ? <PromoRow /> : null}
    >
      <section className={styles.feed}>
        {friendMessage && hasFetched ? (
          <div className={styles.postFriendNotice}>{friendMessage}</div>
        ) : null}
        <HomeFeedList
          posts={posts}
          likePending={likePending}
          memoryPending={memoryPending}
          activeFriendTarget={activeFriendTarget}
          friendActionPending={friendActionPending}
          onToggleLike={handleToggleLike}
          onToggleMemory={handleToggleMemory}
          onFriendRequest={handleFriendRequest}
          onDelete={handleDelete}
          onRemoveFriend={handleFriendRemove}
          onToggleFriendTarget={setActiveFriendTarget}
          formatCount={formatCount}
          timeAgo={timeAgo}
          exactTime={exactTime}
          canRemember={canRemember}
          hasFetched={hasFetched}
          isRefreshing={isRefreshing}
        />
      </section>
    </AppShell>
  );
}
