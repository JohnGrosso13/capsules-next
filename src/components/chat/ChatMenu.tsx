﻿"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import styles from "./chat.module.css";

type ChatMenuProps = { onDelete: () => void };

export function ChatMenu({ onDelete }: ChatMenuProps) {
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
    setOpen((prev) => {
      const next = !prev;
      if (next) updateCoords();
      return next;
    });
  }, [updateCoords]);

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

  const handleDelete = React.useCallback(() => {
    onDelete();
    setOpen(false);
  }, [onDelete]);

  return (
    <div className={styles.chatMenuContainer} ref={containerRef}>
      <button
        type="button"
        className={styles.chatMenuTrigger}
        aria-haspopup="menu"
        aria-label="Open chat actions"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        ref={triggerRef}
      >
        <span className={styles.chatMenuIcon} aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className={styles.chatMenuPanel}
              role="menu"
              style={{
                position: "fixed",
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                transform: "translateX(-100%)",
                zIndex: 1600,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={`${styles.chatMenuItem} ${styles.chatMenuDanger}`.trim()}
                role="menuitem"
                onClick={handleDelete}
              >
                Delete chat
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
