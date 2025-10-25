"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Paperclip,
  Gif,
  PaperPlaneTilt,
  Trash,
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

type ChatComposerProps = {
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
}: ChatComposerProps) {
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
          <textarea
            ref={messageInputRef}
            className={styles.messageInput}
            value={draft}
            onChange={onDraftChange}
            onBlur={onDraftBlur}
            onPaste={onPaste}
            placeholder={sessionType === "group" ? "Message the group" : "Type a message"}
            disabled={sending}
            aria-label="Message"
            rows={1}
          />
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
                    ? `Uploading ${Math.round(attachmentProgress * 100)}%`
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
        <div className={styles.composerActions}>
          <button
            type="button"
            className={styles.composerAttachButton}
            onClick={onAttachmentButtonClick}
            aria-label="Attach file"
          >
            <Paperclip size={18} weight="bold" />
          </button>
          <button
            type="button"
            className={`${styles.composerGifButton} ${
              isGifPickerOpen ? styles.composerGifButtonActive : ""
            }`.trim()}
            onClick={onGifButtonClick}
            aria-label="Add GIF"
            aria-expanded={isGifPickerOpen}
          >
            <Gif size={18} weight="bold" />
          </button>
          <button type="submit" className={styles.sendButton} disabled={disableSend}>
            <PaperPlaneTilt size={18} weight="fill" className={styles.sendButtonIcon} />
            <span>Send</span>
          </button>
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
