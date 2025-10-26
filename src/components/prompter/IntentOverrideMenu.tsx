"use client";

import * as React from "react";
import styles from "./prompter.module.css";
import cm from "@/components/ui/context-menu.module.css";
import { intentLabel } from "@/lib/ai/intent";
import type { PromptIntent } from "@/lib/ai/intent";

export function IntentOverrideMenu({
  manualIntent,
  open,
  anchorRef,
  menuRef,
  onToggle,
  onSelect,
  className,
  renderTrigger = true,
}: {
  manualIntent: PromptIntent | null;
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onToggle(): void;
  onSelect(intent: PromptIntent | null): void;
  className?: string;
  renderTrigger?: boolean;
}) {
  return (
    <div className={`${styles.intentOverride} ${className ?? ""}`.trim()} ref={menuRef}>
      {renderTrigger ? (
        <button
          type="button"
          className={
            manualIntent ? `${styles.intentChip} ${styles.intentChipActive}` : styles.intentChip
          }
          onClick={onToggle}
          aria-expanded={open}
          aria-haspopup="listbox"
          ref={anchorRef}
          data-intent={manualIntent ?? undefined}
        >
          {manualIntent ? intentLabel(manualIntent) : "Auto"}
          {manualIntent ? " (override)" : ""}
          <span className={styles.intentCaret} aria-hidden>
            v
          </span>
        </button>
      ) : null}
      {open ? (
        <div className={cm.menu} role="listbox" style={{ top: "calc(100% + 8px)", right: 0 }}>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect(null)}
            role="option"
            aria-selected={manualIntent === null}
          >
            Auto (AI decide)
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("post")}
            role="option"
            aria-selected={manualIntent === "post"}
          >
            Post
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("navigate")}
            role="option"
            aria-selected={manualIntent === "navigate"}
          >
            Go
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("style")}
            role="option"
            aria-selected={manualIntent === "style"}
          >
            Style
          </button>
          <button
            type="button"
            className={cm.item}
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
