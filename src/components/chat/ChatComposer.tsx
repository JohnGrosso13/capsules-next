"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Paperclip,
  Gif,
  PaperPlaneTilt,
  Trash,
  Plus,
} from "@phosphor-icons/react/dist/ssr";

import type { ChatSessionType } from "@/components/providers/ChatProvider";
import type { LocalAttachment } from "@/hooks/useAttachmentUpload";
import type { GifPickerProps, GifPickerSelection } from "./GifPicker";
import { chatCopy } from "./copy";
import { formatAttachmentSize } from "./utils";

import styles from "./chat.module.css";

const GifPicker = dynamic<GifPickerProps>(
  () => import("./GifPicker").then((mod) => mod.GifPicker),
  {
    ssr: false,
    loading: () => (
      <div className={styles.gifPickerFallback} role="status" aria-live="polite">
        Loading GIFs&hellip;
      </div>
    ),
  },
);

export type PendingAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  storageKey: string | null;
  sessionId: string | null;
};

export type ComposerStatus = {
  variant: "uploading" | "ready";
  text: string;
};

export type ChatComposerProps = {
  error: string | null;
  draft: string;
  sending: boolean;
  disableSend: boolean;
  hasAttachmentBlock: boolean;
  queuedAttachments: PendingAttachment[];
  uploadingAttachment: LocalAttachment | null;
  attachmentProgress: number;
  composerStatus: ComposerStatus | null;
  attachmentError: string | null;
  isDraggingFile: boolean;
  isGifPickerOpen: boolean;
  sessionType: ChatSessionType;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onDragEnter: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onDraftChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onDraftBlur: () => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveQueuedAttachment: (attachmentId: string) => void;
  onRemoveUploadingAttachment: () => void;
  onAttachmentButtonClick: () => void;
  onGifButtonClick: () => void;
  onGifSelect: (gif: GifPickerSelection) => void;
  onGifClose: () => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  plusMenuItems?: PlusMenuItem[];
};

type PlusMenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

export function ChatComposer({
  error,
  draft,
  sending,
  disableSend,
  hasAttachmentBlock,
  queuedAttachments,
  uploadingAttachment,
  attachmentProgress,
  composerStatus,
  attachmentError,
  isDraggingFile,
  isGifPickerOpen,
  sessionType,
  messageInputRef,
  fileInputRef,
  onSubmit,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onDraftChange,
  onDraftBlur,
  onPaste,
  onRemoveQueuedAttachment,
  onRemoveUploadingAttachment,
  onAttachmentButtonClick,
  onGifButtonClick,
  onGifSelect,
  onGifClose,
  onFileInputChange,
  placeholder,
  plusMenuItems,
}: ChatComposerProps) {
  const [isPlusOpen, setIsPlusOpen] = React.useState(false);
  const plusMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleDocumentClick(e: MouseEvent) {
      if (!isPlusOpen) return;
      const target = e.target as Node | null;
      if (plusMenuRef.current && target && !plusMenuRef.current.contains(target)) {
        setIsPlusOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [isPlusOpen]);

  const menuItems = React.useMemo(() => {
    const items: PlusMenuItem[] = [
      {
        key: "attachment",
        label: "Attach file",
        icon: <Paperclip size={16} weight="bold" />,
        onSelect: onAttachmentButtonClick,
      },
      {
        key: "gif",
        label: "Add GIF",
        icon: <Gif size={16} weight="bold" />,
        onSelect: onGifButtonClick,
      },
    ];
    if (Array.isArray(plusMenuItems) && plusMenuItems.length) {
      for (const item of plusMenuItems) {
        if (!item) continue;
        const existing = items.find((entry) => entry.key === item.key);
        if (existing) {
          items.push({ ...item, key: `${item.key}-extra` });
        } else {
          items.push(item);
        }
      }
    }
    return items;
  }, [onAttachmentButtonClick, onGifButtonClick, plusMenuItems]);

  const resolvedPlaceholder =
    placeholder ?? (sessionType === "group" ? "Message the group" : "Type a message");

  return (
    <>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      <form
        className={styles.composer}
        onSubmit={onSubmit}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-dragging={isDraggingFile ? "true" : undefined}
      >
        <div
          className={styles.composerInputArea}
          data-has-attachment={hasAttachmentBlock ? "true" : undefined}
        >
          <div className={styles.composerField}>
            <button
              type="button"
              className={styles.composerPlusButton}
              aria-label="More options"
              aria-expanded={isPlusOpen}
              onClick={() => setIsPlusOpen((v) => !v)}
            >
              <Plus size={18} weight="bold" />
            </button>
            <textarea
              ref={messageInputRef}
              className={styles.messageInput}
              value={draft}
              onChange={onDraftChange}
              onBlur={onDraftBlur}
              onPaste={onPaste}
              placeholder={resolvedPlaceholder}
              disabled={sending}
              aria-label="Message"
              rows={1}
            />
            <button
              type="submit"
              className={styles.composerSendAdornment}
              aria-label="Send message"
              disabled={disableSend}
            >
              <PaperPlaneTilt size={18} weight="fill" className={styles.sendButtonIcon} />
            </button>
            {isPlusOpen ? (
              <div
                ref={plusMenuRef}
                className={`${styles.chatMenuPanel} ${styles.composerPlusMenu}`}
                role="menu"
              >
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.chatMenuItem}
                    role="menuitem"
                    onClick={() => {
                      if (item.disabled) return;
                      setIsPlusOpen(false);
                      item.onSelect();
                    }}
                    disabled={item.disabled}
                    aria-disabled={item.disabled}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {item.icon} {item.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {queuedAttachments.length > 0 ? (
            <div className={styles.composerAttachmentList}>
              {queuedAttachments.map((attachment) => (
                <div key={attachment.id} className={styles.composerAttachment} data-status="ready">
                  <div className={styles.composerAttachmentInfo}>
                    <span className={styles.composerAttachmentName}>{attachment.name}</span>
                    <span className={styles.composerAttachmentMeta}>
                      {formatAttachmentSize(attachment.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.composerAttachmentRemove}
                    onClick={() => onRemoveQueuedAttachment(attachment.id)}
                    aria-label="Remove attachment"
                  >
                    <Trash size={14} weight="duotone" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {uploadingAttachment ? (
            <div className={styles.composerAttachment} data-status={uploadingAttachment.status}>
              <div className={styles.composerAttachmentInfo}>
                <span className={styles.composerAttachmentName}>{uploadingAttachment.name}</span>
                <span className={styles.composerAttachmentMeta}>
                  {uploadingAttachment.status === "uploading"
                    ? uploadingAttachment.phase === "finalizing"
                      ? "Finishing upload..."
                      : `Uploading ${Math.round(attachmentProgress * 100)}%`
                    : formatAttachmentSize(uploadingAttachment.size)}
                </span>
              </div>
              <button
                type="button"
                className={styles.composerAttachmentRemove}
                onClick={onRemoveUploadingAttachment}
                aria-label="Remove attachment"
              >
                <Trash size={14} weight="duotone" />
              </button>
            </div>
          ) : null}
          {composerStatus ? (
            <div
              className={styles.composerStatus}
              data-variant={composerStatus.variant}
              role="status"
              aria-live="polite"
            >
              {composerStatus.text}
            </div>
          ) : null}
          {attachmentError ? (
            <div className={styles.composerAttachmentError} role="alert">
              {attachmentError}
            </div>
          ) : null}
          {isDraggingFile ? (
            <div className={styles.composerDropHint}>{chatCopy.composer.dropHint}</div>
          ) : null}
        </div>
        {isGifPickerOpen ? (
          <div className={styles.composerGifPanel}>
            <GifPicker onSelect={onGifSelect} onClose={onGifClose} />
          </div>
        ) : null}
        <input ref={fileInputRef} type="file" multiple hidden onChange={onFileInputChange} />
      </form>
    </>
  );
}
