"use client";

import * as React from "react";
import styles from "@/app/(authenticated)/friends/friends.module.css";

type FriendMenuProps = {
  canTarget: boolean;
  pending?: boolean;
  onDelete: () => void;
};

export function FriendMenu({ canTarget, pending, onDelete }: FriendMenuProps) {
  return (
    <div className={styles.friendActions}>
      <button
        type="button"
        className={styles.friendActionButton}
        onClick={onDelete}
        disabled={!canTarget || Boolean(pending)}
        aria-busy={Boolean(pending)}
      >
        {pending ? "Removing..." : "Delete"}
      </button>
    </div>
  );
}

export default FriendMenu;
