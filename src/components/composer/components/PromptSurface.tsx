"use client";

import * as React from "react";

import { Plus, ArrowUp, Paperclip, Microphone } from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";
import menuStyles from "@/components/ui/context-menu.module.css";
import type { ComposerVoiceResult } from "../hooks/useComposerVoice";

type PromptOption = { label: string; prompt: string };

type PromptVoiceControls = Pick<
  ComposerVoiceResult,
  "isActive" | "status" | "buttonLabel" | "buttonDisabled" | "toggle" | "errorMessage" | "hint" | "hintState"
>;

type PromptSurfaceProps = {
  loading: boolean;
  attachmentUploading: boolean;
  onAttachClick: () => void;
  onAttachmentSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  promptInputRef: React.RefObject<HTMLInputElement | null>;
  promptValue: string;
  placeholder: string;
  onPromptChange: React.Dispatch<React.SetStateAction<string>>;
  onPromptPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  onPromptSubmit: () => void;
  quickPromptOptions: PromptOption[];
  onQuickPromptSelect: (prompt: string) => void;
  showQuickPrompts: boolean;
  voiceControls: PromptVoiceControls;
};

export function PromptSurface({
  loading,
  attachmentUploading,
  onAttachClick,
  onAttachmentSelect,
  fileInputRef,
  promptInputRef,
  promptValue,
  placeholder,
  onPromptChange,
  onPromptPaste,
  onPromptSubmit,
  quickPromptOptions,
  onQuickPromptSelect,
  showQuickPrompts,
  voiceControls,
}: PromptSurfaceProps) {
  const hasQuickPrompts = showQuickPrompts && quickPromptOptions.length > 0;
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const actionsRef = React.useRef<HTMLDivElement | null>(null);
  const { isActive, buttonLabel, buttonDisabled, toggle } = voiceControls;

  React.useEffect(() => {
    if (!actionsOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (actionsRef.current && target && !actionsRef.current.contains(target)) {
        setActionsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [actionsOpen]);

  React.useEffect(() => {
    if (loading || attachmentUploading) {
      setActionsOpen(false);
    }
  }, [attachmentUploading, loading]);

  const handleToggleActions = React.useCallback(() => {
    if (loading || attachmentUploading) return;
    setActionsOpen((open) => !open);
  }, [attachmentUploading, loading]);

  const handleAttachmentSelect = React.useCallback(() => {
    setActionsOpen(false);
    onAttachClick();
  }, [onAttachClick]);

  const handleVoiceSelect = React.useCallback(() => {
    setActionsOpen(false);
    toggle();
  }, [toggle]);

  const voiceMenuLabel = isActive ? "Stop dictation" : "Dictate message";
  const voiceMenuDisabled = buttonDisabled;

  return (
    <div
      className={styles.composerBottom}
      data-has-presets={hasQuickPrompts ? "true" : undefined}
    >
      <div className={styles.promptSurface}>
        <div className={styles.promptActions} ref={actionsRef}>
          <button
            type="button"
            className={styles.promptIconBtn}
            aria-label="More composer actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            onClick={handleToggleActions}
            disabled={loading || attachmentUploading}
          >
            <Plus size={18} weight="bold" />
          </button>
          {actionsOpen ? (
            <div
              className={`${menuStyles.menu} ${styles.promptActionsMenu}`.trim()}
              role="menu"
            >
              <button
                type="button"
                className={menuStyles.item}
                role="menuitem"
                onClick={handleAttachmentSelect}
                disabled={loading || attachmentUploading}
                aria-disabled={loading || attachmentUploading}
              >
                <Paperclip size={16} weight="bold" /> Upload attachment
              </button>
              <button
                type="button"
                className={menuStyles.item}
                role="menuitemcheckbox"
                onClick={handleVoiceSelect}
                aria-checked={isActive}
                aria-label={buttonLabel}
                disabled={voiceMenuDisabled}
                aria-disabled={voiceMenuDisabled}
                data-active={isActive ? "true" : undefined}
              >
                <Microphone size={16} weight="bold" /> {voiceMenuLabel}
              </button>
            </div>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          className={styles.hiddenFileInput}
          onChange={onAttachmentSelect}
          disabled={loading || attachmentUploading}
        />
        <input
          ref={promptInputRef}
          className={styles.promptInput}
          placeholder={placeholder}
          value={promptValue}
          onPaste={onPromptPaste}
          onChange={(event) => onPromptChange(event.target.value)}
          disabled={loading}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onPromptSubmit();
            }
          }}
        />
        <button
          type="button"
          className={styles.promptSendBtn}
          onClick={onPromptSubmit}
          disabled={loading || attachmentUploading || !promptValue.trim()}
          aria-label="Send"
        >
          <ArrowUp size={18} weight="bold" />
        </button>
      </div>

      {voiceControls.hint ? (
        <div
          className={styles.voiceStatus}
          data-state={voiceControls.hintState ?? undefined}
          role="status"
          aria-live="polite"
        >
          {voiceControls.hint}
        </div>
      ) : null}

      {hasQuickPrompts ? (
        <div className={styles.promptPresets}>
          {quickPromptOptions.map((option) => (
            <button
              key={option.prompt}
              type="button"
              className={styles.promptPresetBtn}
              onClick={() => onQuickPromptSelect(option.prompt)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
