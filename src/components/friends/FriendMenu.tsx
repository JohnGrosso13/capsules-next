"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import styles from "@/app/(authenticated)/friends/friends.module.css";

type FriendMenuProps = {
  canTarget: boolean;
  pending?: boolean;
  immutable?: boolean;
  onDelete: () => void;
  onBlock?: (() => void) | null;
  onView?: (() => void) | null;
  onStartChat?: (() => void) | null;
  isFollowing?: boolean;
  onFollow?: (() => void) | null;
  onUnfollow?: (() => void) | null;
};

export function FriendMenu({
  canTarget,
  pending,
  immutable,
  onDelete,
  onBlock,
  onView,
  onStartChat,
  isFollowing,
  onFollow,
  onUnfollow,
}: FriendMenuProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);

  const updateCoords = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: Math.round(rect.bottom + 8), left: Math.round(rect.right) });
  }, []);

  const toggle = React.useCallback(() => {
    if (pending) return;
    setOpen((prev) => {
      const next = !prev;
      if (next) updateCoords();
      return next;
    });
  }, [pending, updateCoords]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const insideTrigger = containerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    const handleLayoutChange = () => updateCoords();
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);
    updateCoords();
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [open, updateCoords]);

  const disableActions = !canTarget || Boolean(pending);
  const hideDestructive = immutable === true;
  const followHandlers =
    typeof isFollowing === "boolean"
      ? isFollowing
        ? { handler: onUnfollow ?? null, label: "Unfollow" }
        : { handler: onFollow ?? null, label: "Follow" }
      : null;
  const followDisabled = disableActions || !followHandlers?.handler;

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
        ref={triggerRef}
      >
        <span className={styles.friendMenuIcon} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className={styles.friendMenuPanel}
              role="menu"
              style={{
                position: "fixed",
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                right: "auto",
                transform: "translateX(-100%)",
                zIndex: 1400,
              }}
            >
              <button
                type="button"
                className={styles.friendMenuItem}
                role="menuitem"
                onClick={() => handleAction(onView ?? null)}
                disabled={disableActions}
            >
              View profile
            </button>
              {followHandlers ? (
                <button
                  type="button"
                  className={styles.friendMenuItem}
                  role="menuitem"
                  onClick={() => handleAction(followHandlers.handler)}
                  disabled={followDisabled}
                >
                  {followHandlers.label}
                </button>
              ) : null}
            <button
              type="button"
                className={styles.friendMenuItem}
                role="menuitem"
                onClick={() => handleAction(onStartChat ?? null)}
                disabled={disableActions}
              >
                Start chat
              </button>
              {hideDestructive ? null : (
                <>
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
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default FriendMenu;
