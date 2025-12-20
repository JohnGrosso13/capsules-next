"use client";

import * as React from "react";

import { PrompterInputBar } from "@/components/prompter/PrompterInputBar";
import prompterStyles from "@/components/prompter/prompter.module.css";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { PromptIntent } from "@/lib/ai/intent";

import type { AssistantMessage } from "../assistantTypes";
import styles from "./AssistantPrompter.module.css";

type AssistantPrompterProps = {
  conversation: AssistantMessage[];
  draft: string;
  placeholder: string;
  busy?: boolean;
  onDraftChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSend: () => void;
};

export function AssistantPrompter({
  conversation,
  draft,
  placeholder,
  busy = false,
  onDraftChange,
  onKeyDown,
  onSend,
}: AssistantPrompterProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const chatLogRef = React.useRef<HTMLDivElement | null>(null);
  const [attachments, setAttachments] = React.useState<
    Array<{ id: string; name: string; size: number; formattedSize: string }>
  >([]);
  const makeAttachmentId = React.useCallback(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);
  const noop = React.useCallback(() => {}, []);
  const handleRemoveAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => prev.filter((file) => file.id !== id));
  }, []);
  const handleAttachClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileChange = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>((event) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${makeAttachmentId()}`,
        name: file.name,
        size: file.size,
        formattedSize: `${(file.size / 1024).toFixed(1)} KB`,
      })),
    ]);
    event.target.value = "";
  }, [makeAttachmentId]);
  const handleSelectIntent = React.useCallback<
    (intent: PromptIntent | null, postMode?: "ai" | "manual" | null) => void
  >(() => {}, []);
  const buttonDisabled = draft.trim().length === 0 || busy;
  const { supported: voiceSupported, status: voiceStatus, start: startVoice, stop: stopVoice } = useSpeechRecognition({
    onFinalResult: (_full, chunk) => {
      const addition = chunk.trim();
      if (!addition.length) return;
      const next = draft.trim().length ? `${draft} ${addition}` : addition;
      onDraftChange(next);
    },
  });
  const handleVoiceToggle = React.useCallback(() => {
    if (voiceStatus === "listening" || voiceStatus === "stopping") {
      stopVoice();
    } else {
      startVoice();
    }
  }, [startVoice, stopVoice, voiceStatus]);

  React.useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTo({
        top: chatLogRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [conversation]);

  return (
    <section className={styles.stage} aria-label="Assistant prompter">
      <div className={`${prompterStyles.prompter} ${styles.surface}`}>
        <div className={styles.chatShell}>
          <div className={styles.chatLog} role="log" aria-live="polite" ref={chatLogRef}>
            {conversation.map((message) => {
              const bubbleClass =
                message.sender === "ai"
                  ? styles.chatBubble
                  : `${styles.chatBubble} ${styles.chatBubbleUser}`;
              const label = message.sender === "ai" ? "Assistant" : "You";
              return (
                <div key={message.id} className={bubbleClass}>
                  <span className={styles.chatLabel}>{label}</span>
                  <p>{message.text}</p>
                </div>
              );
            })}
          </div>

          <PrompterInputBar
            inputRef={inputRef}
            value={draft}
            placeholder={placeholder}
            onChange={onDraftChange}
            onKeyDown={onKeyDown}
            buttonLabel="Send"
            buttonClassName={prompterStyles.genBtn ?? ""}
            buttonDisabled={buttonDisabled}
            onGenerate={onSend}
            dataIntent="ladder_naming"
            fileInputRef={fileInputRef}
        uploading={false}
        onAttachClick={handleAttachClick}
        onFileChange={handleFileChange}
        manualIntent={null}
        manualPostMode={null}
        menuOpen={false}
        onToggleMenu={noop}
        onSelect={handleSelectIntent}
            anchorRef={anchorRef}
            menuRef={menuRef}
            voiceSupported={voiceSupported}
            voiceStatus={voiceStatus}
            onVoiceToggle={handleVoiceToggle}
            voiceLabel={
              voiceSupported
                ? voiceStatus === "listening"
                  ? "Stop voice capture"
                  : "Start voice capture"
                : "Voice input not supported"
            }
            showAttachmentButton
            showVoiceButton
            showIntentMenu={false}
            multiline={false}
            submitVariant="icon"
          />
          {attachments.length ? (
            <div className={styles.attachmentTray}>
              {attachments.map((file) => (
                <span key={file.id} className={styles.attachmentPill}>
                  <span className={styles.attachmentName}>{file.name}</span>
                  <span className={styles.attachmentSize}>{file.formattedSize}</span>
                  <button
                    type="button"
                    className={styles.attachmentRemove}
                    onClick={() => handleRemoveAttachment(file.id)}
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

      </div>
    </section>
  );
}
