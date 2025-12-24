"use client";

import * as React from "react";
import styles from "./prompter.module.css";
import { Plus, Microphone, ArrowUp, Paperclip } from "@phosphor-icons/react/dist/ssr";
import { IntentOverrideMenu } from "@/components/prompter/IntentOverrideMenu";
import cm from "@/components/ui/context-menu.module.css";
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
      ? "Dictation not supported in this browser"
      : isListening
        ? "Stop dictation"
        : "Dictate message");
  const voiceButtonDisabled = voiceDisabled || !voiceSupported || voiceStatus === "stopping";
  const useIconSubmit = submitVariant === "icon";
  const showCompactSendButton = isCompact && useIconSubmit;
  const compactSendDisabled = buttonDisabled || value.trim().length === 0;
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [actionsPlacement, setActionsPlacement] = React.useState<"above" | "below">("below");
  const actionsRef = React.useRef<HTMLDivElement | null>(null);

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
    if (uploading) {
      setActionsOpen(false);
    }
  }, [uploading]);

  const handleToggleActions = React.useCallback(() => {
    if (uploading) return;

    if (!actionsOpen && typeof window !== "undefined") {
      const root = actionsRef.current;
      const trigger = root ? (root.querySelector("button") as HTMLButtonElement | null) : null;
      const rect = trigger ? trigger.getBoundingClientRect() : null;
      if (rect) {
        const viewportHeight =
          typeof window.innerHeight === "number"
            ? window.innerHeight
            : document.documentElement.clientHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const estimatedMenuHeight = 180; // approximate context menu height
        if (spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight) {
          setActionsPlacement("above");
        } else {
          setActionsPlacement("below");
        }
      } else {
        setActionsPlacement("below");
      }
    }

    setActionsOpen((open) => !open);
  }, [actionsOpen, uploading]);

  const handleAttachmentSelect = React.useCallback(() => {
    setActionsOpen(false);
    onAttachClick();
  }, [onAttachClick]);

  const handleVoiceSelect = React.useCallback(() => {
    setActionsOpen(false);
    onVoiceToggle();
  }, [onVoiceToggle]);

  const voiceMenuLabel = isListening ? "Stop dictation" : "Dictate message";
  const showVoiceAction = showVoiceButton && !isCompact;

  return (
    <div className={styles.promptBar}>
      <div className={styles.promptActions} ref={actionsRef}>
        <button
          type="button"
          className={styles.promptAttachBtn}
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          onClick={handleToggleActions}
          disabled={uploading}
        >
          <Plus size={20} weight="bold" className={styles.promptAttachIcon} />
        </button>
        {actionsOpen ? (
          <div
            className={`${cm.menu} ${styles.promptActionsMenu}`.trim()}
            role="menu"
            data-placement={actionsPlacement}
          >
            {showAttachmentButton ? (
              <button
                type="button"
                className={cm.item}
                role="menuitem"
                onClick={handleAttachmentSelect}
                disabled={uploading}
                aria-disabled={uploading}
              >
                <Paperclip size={16} weight="bold" /> Upload attachment
              </button>
            ) : null}
            {showVoiceAction ? (
              <button
                type="button"
                className={cm.item}
                role="menuitemcheckbox"
                onClick={handleVoiceSelect}
                aria-checked={isListening}
                aria-label={computedLabel}
                disabled={voiceButtonDisabled}
                aria-disabled={voiceButtonDisabled}
                data-active={isListening ? "true" : undefined}
              >
                <Microphone size={16} weight="bold" /> {voiceMenuLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
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
      {showCompactSendButton ? (
        <button
          type="button"
          className={`${styles.promptAttachBtn} ${styles.voiceBtn}`.trim()}
          aria-label="Send"
          title="Send"
          onClick={onGenerate}
          data-status={voiceStatus}
          disabled={compactSendDisabled}
        >
          <ArrowUp size={18} weight="bold" className={styles.voiceIcon} />
        </button>
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
      ) : !useIconSubmit && showIntentMenu ? (
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
      ) : !useIconSubmit ? (
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
