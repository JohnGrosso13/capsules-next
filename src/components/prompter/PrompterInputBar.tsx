"use client";

import * as React from "react";
import styles from "./prompter.module.css";
import { Plus, Microphone, MicrophoneSlash, ArrowUp } from "@phosphor-icons/react/dist/ssr";
import { IntentOverrideMenu } from "@/components/prompter/IntentOverrideMenu";
import type { PromptIntent } from "@/lib/ai/intent";
import type { RecognitionStatus } from "@/hooks/useSpeechRecognition";

type Props = {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  buttonLabel: string;
  buttonClassName: string;
  buttonDisabled: boolean;
  onGenerate: () => void;
  dataIntent?: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  onAttachClick: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  manualIntent: PromptIntent | null;
  manualPostMode: "ai" | "manual" | null;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: (intent: PromptIntent | null, postMode?: "ai" | "manual" | null) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  voiceSupported: boolean;
  voiceStatus: RecognitionStatus;
  onVoiceToggle: () => void;
  voiceDisabled?: boolean;
  voiceLabel?: string;
  showAttachmentButton?: boolean;
  showVoiceButton?: boolean;
  showIntentMenu?: boolean;
  multiline?: boolean;
  submitVariant?: "default" | "icon";
};

export function PrompterInputBar({
  inputRef,
  value,
  placeholder,
  onChange,
  onKeyDown,
  onPaste,
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
  manualPostMode,
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
  showAttachmentButton = true,
  showVoiceButton = true,
  showIntentMenu = true,
  multiline = false,
  submitVariant = "default",
}: Props) {
  const isListening = voiceStatus === "listening" || voiceStatus === "stopping";
  const [isCompact, setIsCompact] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 480px)");
    const handle = () => setIsCompact(mq.matches);
    handle();
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", handle);
    else mq.addListener(handle);
    return () => {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", handle);
      else mq.removeListener(handle);
    };
  }, []);

  const computedLabel =
    voiceLabel ??
    (!voiceSupported
      ? "Voice input not supported in this browser"
      : isListening
        ? "Stop voice capture"
        : "Start voice capture");
  const voiceButtonDisabled = voiceDisabled || !voiceSupported || voiceStatus === "stopping";
  const showSend = isCompact && value.trim().length > 0;
  const useIconSubmit = submitVariant === "icon";

  return (
    <div className={styles.promptBar}>
      {showAttachmentButton ? (
        <button
          type="button"
          className={styles.promptAttachBtn}
          aria-label="Attach file"
          onClick={onAttachClick}
          disabled={uploading}
        >
          <Plus size={20} weight="bold" className={styles.promptAttachIcon} />
        </button>
      ) : null}
      {multiline ? (
        <textarea
          className={`${styles.input} ${styles.multilineInput}`.trim()}
          placeholder={placeholder}
          ref={inputRef as React.RefObject<HTMLTextAreaElement | null>}
          id="ai-prompter-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
        />
    ) : (
      <input
        className={styles.input}
        placeholder={placeholder}
          ref={inputRef as React.RefObject<HTMLInputElement | null>}
          id="ai-prompter-input"
          // Prevent browser suggestions/auto-fill bubbles
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        enterKeyHint="go"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
      />
    )}
      {showAttachmentButton ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          className={styles.attachInput}
          onChange={onFileChange}
        />
      ) : null}
      {showVoiceButton ? (
        showSend ? (
          <button
            type="button"
            className={`${styles.promptAttachBtn} ${styles.voiceBtn}`.trim()}
            aria-label="Send"
            title="Send"
            onClick={onGenerate}
            data-status={voiceStatus}
          >
            <ArrowUp size={18} weight="bold" className={styles.voiceIcon} />
          </button>
        ) : (
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
        )
      ) : null}
      {!isCompact && useIconSubmit ? (
        <button
          type="button"
          className={styles.sendIconBtn}
          aria-label="Send"
          onClick={onGenerate}
          disabled={buttonDisabled}
          data-intent={dataIntent}
        >
          <ArrowUp size={18} weight="bold" />
        </button>
      ) : !isCompact && showIntentMenu ? (
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
              v
            </span>
          </button>
          <IntentOverrideMenu
            manualIntent={manualIntent}
            manualPostMode={manualPostMode}
            open={menuOpen}
            anchorRef={anchorRef}
            menuRef={menuRef}
            onToggle={onToggleMenu}
            onSelect={onSelect}
            className={styles.intentOverrideInline ?? ""}
            renderTrigger={false}
          />
        </div>
      ) : !isCompact ? (
        <button
          className={buttonClassName}
          type="button"
          onClick={onGenerate}
          disabled={buttonDisabled}
          data-intent={dataIntent}
        >
          <span className={styles.genLabel}>{buttonLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
