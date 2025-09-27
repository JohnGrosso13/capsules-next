"use client";

import * as React from "react";
import styles from "@/components/home.module.css";
import { Paperclip } from "@phosphor-icons/react/dist/ssr";
import { IntentOverrideMenu } from "@/components/prompter/IntentOverrideMenu";
import type { PromptIntent } from "@/lib/ai/intent";

export function PrompterInputBar({
  inputRef,
  value,
  placeholder,
  onChange,
  buttonLabel,
  buttonClassName,
  buttonDisabled,
  onGenerate,
  dataIntent,
  // attachments inline
  fileInputRef,
  uploading,
  onAttachClick,
  onFileChange,
  // intent menu inside Generate split button
  manualIntent,
  menuOpen,
  onToggleMenu,
  onSelect,
  anchorRef,
  menuRef,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  buttonLabel: string;
  buttonClassName: string;
  buttonDisabled: boolean;
  onGenerate: () => void;
  dataIntent?: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  onAttachClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  manualIntent: PromptIntent | null;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: (intent: PromptIntent | null) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className={styles.promptBar}>
      <button
        type="button"
        className={styles.promptAttachBtn}
        aria-label="Attach image"
        onClick={onAttachClick}
        disabled={uploading}
      >
        <Paperclip size={20} weight="duotone" className={styles.promptAttachIcon} />
      </button>
      <input
        className={styles.input}
        placeholder={placeholder}
        ref={inputRef}
        id="ai-prompter-input"
        // Prevent browser suggestions/auto-fill bubbles
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={styles.attachInput}
        onChange={onFileChange}
      />
      <div className={styles.genSplit} role="group">
        <button
          className={`${buttonClassName} ${styles.genSplitMain}`.trim()}
          type="button"
          onClick={onGenerate}
          disabled={buttonDisabled}
          data-intent={dataIntent}
        >
          <span className={styles.genLabel}>{buttonLabel}</span>
        </button>
        <button
          type="button"
          className={styles.genSplitCaret}
          aria-label="Change intent"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={onToggleMenu}
          ref={anchorRef}
        >
          <span className={styles.caretGlyph} aria-hidden>▾</span>
        </button>
        <IntentOverrideMenu
          manualIntent={manualIntent}
          open={menuOpen}
          anchorRef={anchorRef}
          menuRef={menuRef}
          onToggle={onToggleMenu}
          onSelect={onSelect}
          className={styles.intentOverrideInline}
          renderTrigger={false}
        />
      </div>
    </div>
  );
}
