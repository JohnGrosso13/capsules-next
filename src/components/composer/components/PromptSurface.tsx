"use client";

import * as React from "react";

import { Plus, ArrowUp } from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";
import { VoiceRecorder } from "./VoiceRecorder";
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

  return (
    <div
      className={styles.composerBottom}
      data-has-presets={hasQuickPrompts ? "true" : undefined}
    >
      <div className={styles.promptSurface}>
        <button
          type="button"
          className={styles.promptIconBtn}
          aria-label="Attach file"
          onClick={onAttachClick}
          disabled={loading || attachmentUploading}
        >
          <Plus size={18} weight="bold" />
        </button>
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
        <VoiceRecorder
          isActive={voiceControls.isActive}
          status={voiceControls.status}
          buttonLabel={voiceControls.buttonLabel}
          buttonDisabled={voiceControls.buttonDisabled}
          onToggle={voiceControls.toggle}
          errorMessage={voiceControls.errorMessage}
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
