"use client";

import * as React from "react";

import styles from "./home.module.css";

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
    friendMessage,
    activeFriendTarget,
    friendActionPending,
    handleToggleLike,
    handleFriendRequest,
    handleDelete,
    setActiveFriendTarget,
    formatCount,
    timeAgo,
    exactTime,
  } = useHomeFeed();

  return (
    <AppShell
      activeNav="home"
      showPrompter={showPrompter}
      promoSlot={showPromoRow ? <PromoRow /> : null}
    >
      <section className={styles.feed}>
        {friendMessage ? <div className={styles.postFriendNotice}>{friendMessage}</div> : null}
        <HomeFeedList
          posts={posts}
          likePending={likePending}
          activeFriendTarget={activeFriendTarget}
          friendActionPending={friendActionPending}
          onToggleLike={handleToggleLike}
          onFriendRequest={handleFriendRequest}
          onDelete={handleDelete}
          onToggleFriendTarget={setActiveFriendTarget}
          formatCount={formatCount}
          timeAgo={timeAgo}
          exactTime={exactTime}
        />
      </section>
    </AppShell>
  );
}
