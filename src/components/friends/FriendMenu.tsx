"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import styles from "@/app/(authenticated)/friends/friends.module.css";
import cm from "@/components/ui/context-menu.module.css";

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
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState<{ top: number; right: number } | null>(null);

  React.useEffect(() => {
    function onDocPointerDown(e: MouseEvent | PointerEvent) {
      if (!open) return;
      const container = containerRef.current;
      const menu = menuRef.current;
      const target = e.target as Node | null;
      if (!target) return;
      const insideContainer = !!(container && container.contains(target));
      const insideMenu = !!(menu && menu.contains(target));
      if (!insideContainer && !insideMenu) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Recompute fixed position for the portal-based menu
  const recomputePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spacing = 8;
    // Prefer bottom alignment; fallback to above if overflowing viewport
    let top = rect.bottom + spacing;
    let right = Math.max(8, window.innerWidth - rect.right);

    // If we have menu size, nudge above when it would overflow bottom
    const menu = menuRef.current;
    if (menu) {
      const h = menu.offsetHeight || 0;
      if (top + h + 8 > window.innerHeight) {
        top = Math.max(8, rect.top - spacing - h);
      }
    }
    setPosition({ top, right });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    recomputePosition();
    const onScroll = () => recomputePosition();
    const onResize = () => recomputePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, recomputePosition]);

  const disabledAll = !canTarget || Boolean(pending);

  return (
    <div className={styles.friendMenuContainer} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.friendMenuTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open friend menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg className={styles.friendMenuIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open
        ? createPortal(
          <><div
              ref={menuRef}
              className={cm.menu}
              role="menu"
              style={{ position: "fixed", top: position?.top ?? 0, right: position?.right ?? 0 }}
            >
              <button
                type="button"
                className={cm.item}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onView?.();
                }}
                disabled={disabledAll}
              >
                View
              </button>
              <button
                type="button"
                className={cm.item}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onStartChat?.();
                }}
                disabled={true /* disabled for now per spec */}
                aria-disabled="true"
                title="Chat coming soon"
              >
                Start chat
              </button>
              <div className={cm.separator} aria-hidden />
              <button
                type="button"
                className={cm.item}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onBlock?.();
                }}
                disabled={disabledAll}
              >
                Block
              </button>
              <button
                type="button"
                className={`${cm.item} ${cm.danger}`.trim()}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                disabled={disabledAll}
                aria-busy={Boolean(pending)}
              >
                {pending ? "Removing..." : "Delete"}
              </button>
            </div>
          </>,
          document.body,
        )
        : null}
    </div>
  );
}

export default FriendMenu;


