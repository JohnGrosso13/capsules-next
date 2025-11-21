"use client";

import * as React from "react";
import styles from "./prompter.module.css";
import cm from "@/components/ui/context-menu.module.css";
import { intentLabel } from "@/lib/ai/intent";
import type { PromptIntent } from "@/lib/ai/intent";

type PostModeOverride = "ai" | "manual" | null;

type IntentSelectionHandler = (
  intent: PromptIntent | null,
  postMode?: PostModeOverride,
) => void;

export function IntentOverrideMenu({
  manualIntent,
  manualPostMode,
  open,
  anchorRef,
  menuRef,
  onToggle,
  onSelect,
  className,
  renderTrigger = true,
}: {
  manualIntent: PromptIntent | null;
  manualPostMode: PostModeOverride;
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onToggle(): void;
  onSelect: IntentSelectionHandler;
  className?: string;
  renderTrigger?: boolean;
}) {
  const manualLabel =
    manualIntent === "post" && manualPostMode === "ai"
      ? "Draft"
      : manualIntent === "post" && manualPostMode === "manual"
        ? "Post"
        : manualIntent
          ? intentLabel(manualIntent)
          : "Auto";

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
          {manualIntent ? manualLabel : "Auto"}
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
            onClick={() => onSelect(null, null)}
            role="option"
            aria-selected={manualIntent === null}
          >
            Auto (AI decide)
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("chat", null)}
            role="option"
            aria-selected={manualIntent === "chat"}
          >
            Chat
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("post", "ai")}
            role="option"
            aria-selected={manualIntent === "post" && manualPostMode === "ai"}
          >
            Draft a post (AI write)
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("post", "manual")}
            role="option"
            aria-selected={manualIntent === "post" && manualPostMode === "manual"}
          >
            Post now (publish)
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("navigate", null)}
            role="option"
            aria-selected={manualIntent === "navigate"}
          >
            Go
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("style", null)}
            role="option"
            aria-selected={manualIntent === "style"}
          >
            Style
          </button>
          <button
            type="button"
            className={cm.item}
            onClick={() => onSelect("generate", null)}
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
