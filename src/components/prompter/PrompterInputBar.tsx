"use client";

import * as React from "react";
import styles from "@/components/home.module.css";
import { Paperclip, Microphone, MicrophoneSlash } from "@phosphor-icons/react/dist/ssr";
import { IntentOverrideMenu } from "@/components/prompter/IntentOverrideMenu";
import type { PromptIntent } from "@/lib/ai/intent";
import type { RecognitionStatus } from "@/hooks/useSpeechRecognition";

type Props = {
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
  voiceSupported: boolean;
  voiceStatus: RecognitionStatus;
  onVoiceToggle: () => void;
  voiceDisabled?: boolean;
  voiceLabel?: string;
};

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
  fileInputRef,
  uploading,
  onAttachClick,
  onFileChange,
  manualIntent,
  menuOpen,
  onToggleMenu,
  onSelect,
  anchorRef,
  menuRef,
  voiceSupported,
  voiceStatus,
  onVoiceToggle,
  voiceDisabled = false,
  voiceLabel,
}: Props) {
  const isListening = voiceStatus === "listening" || voiceStatus === "stopping";
  const computedLabel =
    voiceLabel ??
    (!voiceSupported
      ? "Voice input not supported in this browser"
      : isListening
        ? "Stop voice capture"
        : "Start voice capture");
  const voiceButtonDisabled = voiceDisabled || !voiceSupported || voiceStatus === "stopping";

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
        accept="image/*,video/*"
        className={styles.attachInput}
        onChange={onFileChange}
      />
      <button
        type="button"
        className={`${styles.promptAttachBtn} ${styles.voiceBtn}`.trim()}
        aria-label={computedLabel}
        title={computedLabel}
        aria-pressed={isListening}
        onClick={onVoiceToggle}
        disabled={voiceButtonDisabled}
        data-status={voiceStatus}
        data-active={isListening || undefined}
      >
        <span className={styles.voicePulse} aria-hidden />
        {isListening ? (
          <MicrophoneSlash size={18} weight="fill" className={styles.voiceIcon} />
        ) : (
          <Microphone size={18} weight="duotone" className={styles.voiceIcon} />
        )}
      </button>
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
          <span className={styles.caretGlyph} aria-hidden>
            ▾
          </span>
        </button>
        <IntentOverrideMenu
          manualIntent={manualIntent}
          open={menuOpen}
          anchorRef={anchorRef}
          menuRef={menuRef}
          onToggle={onToggleMenu}
          onSelect={onSelect}
          className={styles.intentOverrideInline ?? ""}
          renderTrigger={false}
        />
      </div>
    </div>
  );
}
