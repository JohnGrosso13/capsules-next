"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import styles from "@/app/(authenticated)/friends/friends.module.css";

type TriggerRenderProps = {
  ref: React.Ref<HTMLButtonElement>;
  open: boolean;
  pending: boolean;
  toggle(): void;
};

type PostMenuProps = {
  canTarget: boolean;
  pending?: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  onAddFriend?: () => void | Promise<void>;
  onStartChat?: () => void;
  onBlock?: () => void;
  onRemoveFriend?: () => void | Promise<void>;
  renderTrigger?: (props: TriggerRenderProps) => React.ReactNode;
};

export function PostMenu({
  canTarget,
  pending = false,
  open,
  onOpenChange,
  onAddFriend,
  onStartChat,
  onBlock,
  onRemoveFriend,
  renderTrigger,
}: PostMenuProps) {
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

  const closeMenu = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleToggle = React.useCallback(() => {
    if (pending) return;
    const next = !open;
    if (next) updateCoords();
    onOpenChange(next);
  }, [open, pending, updateCoords, onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const insideTrigger = containerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) {
        closeMenu();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
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
  }, [open, closeMenu, updateCoords]);

  const disableActions = !canTarget || pending;

  const invokeAndClose = React.useCallback(
    (fn?: (() => void | Promise<void>) | null) => {
      if (!fn) {
        closeMenu();
        return;
      }
      const result = fn();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>).finally(() => {
          closeMenu();
        });
      } else {
        closeMenu();
      }
    },
    [closeMenu],
  );

  const trigger = renderTrigger
    ? renderTrigger({ ref: triggerRef, open, pending, toggle: handleToggle })
    : (
        <button
          type="button"
          className={styles.friendMenuTrigger}
          aria-haspopup="menu"
          aria-label="Open post menu"
          aria-expanded={open}
          onClick={handleToggle}
          disabled={Boolean(pending)}
          ref={triggerRef}
        >
          <span className={styles.friendMenuIcon} aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </button>
      );

  return (
    <div className={styles.friendMenuContainer} ref={containerRef}>
      {trigger}
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
                onClick={() => {
                  if (disableActions) return;
                  invokeAndClose(onAddFriend ?? null);
                }}
                disabled={disableActions}
              >
                {pending ? "Sending..." : "Add Friend"}
              </button>
              <button
                type="button"
                className={styles.friendMenuItem}
                role="menuitem"
                onClick={() => invokeAndClose(onStartChat ?? null)}
              >
                Start Chat
              </button>
              <div className={styles.friendMenuSeparator} aria-hidden />
              <button
                type="button"
                className={styles.friendMenuItem}
                role="menuitem"
                onClick={() => invokeAndClose(onBlock ?? null)}
              >
                Block
              </button>
              <button
                type="button"
                className={`${styles.friendMenuItem} ${styles.friendMenuDanger}`.trim()}
                role="menuitem"
                onClick={() => invokeAndClose(onRemoveFriend ?? null)}
              >
                {pending ? "Removing..." : "Remove"}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default PostMenu;
