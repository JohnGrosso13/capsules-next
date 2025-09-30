"use client";

import * as React from "react";

import styles from "@/app/(authenticated)/friends/friends.module.css";

type FriendMenuProps = {
  canTarget: boolean;
  pending?: boolean;
  onDelete: () => void;
  onBlock?: (() => void) | null;
  onView?: (() => void) | null;
  onStartChat?: (() => void) | null;
};

export function FriendMenu({ canTarget, pending, onDelete, onBlock, onView, onStartChat }: FriendMenuProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const toggle = React.useCallback(() => {
    if (pending) return;
    setOpen((prev) => !prev);
  }, [pending]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const disableActions = !canTarget || Boolean(pending);

  const handleAction = React.useCallback(
    (fn?: (() => void) | null) => {
      if (!fn || disableActions) return;
      fn();
      setOpen(false);
    },
    [disableActions],
  );

  return (
    <div className={styles.friendMenuContainer} ref={containerRef}>
      <button
        type="button"
        className={styles.friendMenuTrigger}
        aria-haspopup="menu"
        aria-label="Open friend menu"
        aria-expanded={open}
        onClick={toggle}
        disabled={Boolean(pending)}
      >
        <span className={styles.friendMenuIcon} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open ? (
        <div className={styles.friendMenuPanel} role="menu">
          <button
            type="button"
            className={styles.friendMenuItem}
            role="menuitem"
            onClick={() => handleAction(onView ?? null)}
            disabled={disableActions}
          >
            View profile
          </button>
          <button
            type="button"
            className={styles.friendMenuItem}
            role="menuitem"
            onClick={() => handleAction(onStartChat ?? null)}
            disabled={disableActions}
          >
            Start chat
          </button>
          <div className={styles.friendMenuSeparator} aria-hidden />
          <button
            type="button"
            className={styles.friendMenuItem}
            role="menuitem"
            onClick={() => handleAction(onBlock ?? null)}
            disabled={disableActions}
          >
            Block
          </button>
          <button
            type="button"
            className={`${styles.friendMenuItem} ${styles.friendMenuDanger}`.trim()}
            role="menuitem"
            onClick={() => {
              if (disableActions) return;
              onDelete();
              setOpen(false);
            }}
            disabled={disableActions}
          >
            {pending ? "Removing..." : "Remove"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default FriendMenu;
