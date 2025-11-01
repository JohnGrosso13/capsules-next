"use client";

import * as React from "react";
import { Heart } from "@phosphor-icons/react/dist/ssr";

import styles from "../home-feed.module.css";

export type ActionKey = "like" | "comment" | "share";

export type FeedCardAction = {
  key: ActionKey;
  label: string;
  icon: React.ReactNode;
  count: number;
  active?: boolean;
  pending?: boolean;
  handler?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

type FeedCardActionsProps = {
  actions: FeedCardAction[];
  formatCount: (value?: number | null) => string;
};

export function FeedCardActions({ actions, formatCount }: FeedCardActionsProps) {
  return (
    <footer className={styles.actionBar}>
      {actions.map((action) => {
        const isLike = action.key === "like";
        return (
          <button
            key={action.key}
            className={styles.actionBtn}
            type="button"
            data-action-key={action.key}
            data-variant={action.key}
            data-active={action.active ? "true" : "false"}
            aria-label={`${action.label} (${formatCount(action.count)} so far)`}
            onClick={action.handler}
            disabled={isLike ? action.pending : false}
            aria-pressed={isLike ? action.active : undefined}
            aria-busy={isLike && action.pending ? true : undefined}
          >
            <span className={styles.actionMeta}>
              <span className={styles.actionIcon} aria-hidden>
                {isLike ? <Heart weight={action.active ? "fill" : "duotone"} /> : action.icon}
              </span>
              <span className={styles.actionLabel}>{action.label}</span>
            </span>
            <span className={styles.actionCount}>{formatCount(action.count)}</span>
          </button>
        );
      })}
    </footer>
  );
}
