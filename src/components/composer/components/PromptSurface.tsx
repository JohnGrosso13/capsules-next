"use client";

import * as React from "react";

import { Plus, Sparkle, CaretDown } from "@phosphor-icons/react/dist/ssr";

import styles from "../../ai-composer.module.css";
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
  return (
    <div className={styles.composerBottom}>
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
          className={styles.promptGenerateBtn}
          onClick={onPromptSubmit}
          disabled={loading || attachmentUploading || !promptValue.trim()}
        >
          <span className={styles.generateIcon}>
            <Sparkle size={16} weight="fill" />
          </span>
          <span className={styles.generateLabel}>Generate</span>
          <CaretDown size={14} weight="bold" />
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

      {showQuickPrompts ? (
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



