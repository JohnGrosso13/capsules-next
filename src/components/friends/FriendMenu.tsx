"use client";

import * as React from "react";
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

  React.useEffect(() => {
    function onDocPointerDown(e: MouseEvent | PointerEvent) {
      if (!open) return;
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
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
      {open ? (
        <>
          <div className={cm.backdrop} onClick={() => setOpen(false)} />
          <div className={cm.menu} role="menu" style={{ top: "calc(100% + 8px)", right: 0 }}>
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
        </>
      ) : null}
    </div>
  );
}

export default FriendMenu;




