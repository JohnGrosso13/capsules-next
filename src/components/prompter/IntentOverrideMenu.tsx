"use client";

import * as React from "react";
import styles from "@/components/home.module.css";
import { intentLabel } from "@/lib/ai/intent";
import type { PromptIntent } from "@/lib/ai/intent";

export function IntentOverrideMenu({
  manualIntent,
  open,
  anchorRef,
  menuRef,
  onToggle,
  onSelect,
}: {
  manualIntent: PromptIntent | null;
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onToggle(): void;
  onSelect(intent: PromptIntent | null): void;
}) {
  return (
    <div className={styles.intentOverride} ref={menuRef}>
      <button
        type="button"
        className={
          manualIntent ? `${styles.intentChip} ${styles.intentChipActive}` : styles.intentChip
        }
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        ref={anchorRef}
      >
        {manualIntent ? intentLabel(manualIntent) : "Auto"}
        {manualIntent ? " (override)" : ""}
        <span className={styles.intentCaret} aria-hidden>
          v
        </span>
      </button>
      {open ? (
        <div className={styles.intentMenu} role="listbox">
          <button
            type="button"
            onClick={() => onSelect(null)}
            role="option"
            aria-selected={manualIntent === null}
          >
            Auto (AI decide)
          </button>
          <button
            type="button"
            onClick={() => onSelect("post")}
            role="option"
            aria-selected={manualIntent === "post"}
          >
            Post
          </button>
          <button
            type="button"
            onClick={() => onSelect("navigate")}
            role="option"
            aria-selected={manualIntent === "navigate"}
          >
            Navigate
          </button>
          <button
            type="button"
            onClick={() => onSelect("style")}
            role="option"
            aria-selected={manualIntent === "style"}
          >
            Style
          </button>
          <button
            type="button"
            onClick={() => onSelect("generate")}
            role="option"
            aria-selected={manualIntent === "generate"}
          >
            Generate
          </button>
        </div>
      ) : null}
    </div>
  );
}
