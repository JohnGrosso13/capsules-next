"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { X, StackSimple, Smiley, Paperclip } from "@phosphor-icons/react/dist/ssr";

import styles from "./comment-panel.module.css";
import { ChatComposer, type PendingAttachment, type ComposerStatus } from "@/components/chat/ChatComposer";
import type { GifPickerSelection } from "@/components/chat/GifPicker";
import type { EmojiPickerProps } from "@/components/chat/EmojiPicker";
import { chatCopy } from "@/components/chat/copy";
import { formatAttachmentSize } from "@/components/chat/utils";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import { safeRandomUUID } from "@/lib/random";
// AI composer not used in the redesigned UI
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { useCurrentUser } from "@/services/auth/client";
import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import { ComposerMemoryPicker, type MemoryPickerTab } from "@/components/composer/components/ComposerMemoryPicker";
import type { CommentThreadState, CommentSubmitPayload, CommentAttachment } from "./types";

const EmojiPicker = dynamic<EmojiPickerProps>(
  () => import("@/components/chat/EmojiPicker").then((mod) => mod.EmojiPicker),
  { ssr: false },
);

type CommentPanelProps = {
  post: HomeFeedPost;
  anchorEl: HTMLElement | null;
  visible: boolean;
  thread: CommentThreadState;
  submitting: boolean;
  onClose(): void;
  onLoad(postId: string): Promise<void>;
  onReload(postId: string): Promise<void>;
  onSubmit(payload: CommentSubmitPayload): Promise<void>;
  timeAgo(value?: string | null): string;
  exactTime(value?: string | null): string;
};

const GIF_SIZE_LIMIT_BYTES = 7 * 1024 * 1024;
const GIF_FLAG = (process.env.NEXT_PUBLIC_GIFS_ENABLED || "").trim().toLowerCase();
const GIF_PROVIDER = (process.env.NEXT_PUBLIC_GIF_PROVIDER || "").trim().toLowerCase();
const GIF_SUPPORT_ENABLED =
  GIF_FLAG === "false"
    ? false
    : GIF_FLAG === "true"
      ? true
      : GIF_PROVIDER === "none"
        ? false
        : true;

function initialsFrom(name: string | null | undefined): string {
  if (!name || !name.trim().length) return "??";
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function sanitizeAttachmentForSend(attachment: PendingAttachment): CommentAttachment {
  return {
    id: attachment.id,
    name: attachment.name ?? null,
    mimeType: attachment.mimeType ?? null,
    size: attachment.size ?? null,
    url: attachment.url,
    thumbnailUrl: attachment.thumbnailUrl ?? null,
    storageKey: attachment.storageKey ?? null,
    sessionId: attachment.sessionId ?? null,
    source: null,
  };
}

// Removed attachment builder used only by the old AI compose header button.

export function CommentPanel({
  post,
  anchorEl: _anchorEl,
  visible,
  thread,
  submitting,
  onClose,
  onLoad,
  onReload,
  onSubmit,
  timeAgo,
  exactTime,
}: CommentPanelProps) {
  const { user } = useCurrentUser();
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isGifPickerOpen, setGifPickerOpen] = React.useState(false);
  const [isEmojiPickerOpen, setEmojiPickerOpen] = React.useState(false);
  const messageInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading: attachmentUploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentFile,
    attachRemoteAttachment,
  } = useAttachmentUpload();
  const [queuedAttachments, setQueuedAttachments] = React.useState<PendingAttachment[]>([]);
  const [pendingFileCount, setPendingFileCount] = React.useState(0);
  const pendingFilesRef = React.useRef<File[]>([]);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const [memoryPickerOpen, setMemoryPickerOpen] = React.useState(false);
  const [memoryPickerTab, setMemoryPickerTab] = React.useState<MemoryPickerTab>("uploads");

  const memoryUploads = useMemoryUploads("upload");
  const memoryAssets = useMemoryUploads(null);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.createElement("div");
    el.setAttribute("data-comment-panel-root", "true");
    document.body.appendChild(el);
    setPortalEl(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  React.useEffect(() => {
    if (!visible) {
      setDraft("");
      setQueuedAttachments([]);
      setGifPickerOpen(false);
      setEmojiPickerOpen(false);
      setError(null);
      pendingFilesRef.current = [];
      setPendingFileCount(0);
      clearAttachment();
      return;
    }
    if (thread.status === "idle") {
      void onLoad(post.id).catch((err) => {
        console.error("Comment load failed", err);
      });
    }
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, [visible, thread.status, onLoad, post.id, clearAttachment]);

  React.useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && visible) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, onClose]);

  const processNextQueuedFile = React.useCallback(async () => {
    if (attachmentUploading || attachment) return;
    const next = pendingFilesRef.current.shift();
    setPendingFileCount(pendingFilesRef.current.length);
    if (!next) return;
    try {
      await handleAttachmentFile(next);
    } catch (uploadError) {
      console.error("comment attachment upload failed", uploadError);
    }
  }, [attachment, attachmentUploading, handleAttachmentFile]);

  const enqueueFiles = React.useCallback(
    (files: File[]) => {
      if (!files.length) return;
      pendingFilesRef.current.push(...files);
      setPendingFileCount(pendingFilesRef.current.length);
      void processNextQueuedFile();
    },
    [processNextQueuedFile],
  );

  React.useEffect(() => {
    return () => {
      pendingFilesRef.current = [];
      setPendingFileCount(0);
    };
  }, []);

  React.useEffect(() => {
    if (!readyAttachment || readyAttachment.status !== "ready") return;
    const readyUrl = readyAttachment.url;
    if (!readyUrl) return;
    setQueuedAttachments((previous) => {
      if (previous.some((item) => item.id === readyAttachment.id)) {
        return previous;
      }
      const normalized: PendingAttachment = {
        id: readyAttachment.id,
        name: readyAttachment.name,
        mimeType: readyAttachment.mimeType,
        size:
          typeof readyAttachment.size === "number" && Number.isFinite(readyAttachment.size)
            ? readyAttachment.size
            : 0,
        url: readyUrl,
        thumbnailUrl: readyAttachment.thumbUrl ?? null,
        storageKey: readyAttachment.key ?? null,
        sessionId: readyAttachment.sessionId ?? null,
      };
      return [...previous, normalized];
    });
    clearAttachment();
  }, [readyAttachment, clearAttachment]);

  React.useEffect(() => {
    if (!attachment && !attachmentUploading) {
      void processNextQueuedFile();
    }
  }, [attachment, attachmentUploading, processNextQueuedFile]);

  const uploadingAttachment = attachment && attachment.status !== "ready" ? attachment : null;
  const attachmentError =
    attachment?.status === "error" ? attachment.error ?? "Upload failed" : null;
  const attachmentProgress =
    typeof attachment?.progress === "number"
      ? Math.max(0, Math.min(1, attachment.progress))
      : 0;
  const hasQueuedAttachments = queuedAttachments.length > 0;
  const isAttachmentBusy =
    Boolean(uploadingAttachment) || attachmentUploading || pendingFileCount > 0;
  const composerStatus: ComposerStatus | null = React.useMemo(() => {
    if (attachmentError) return null;
    if (uploadingAttachment) {
      if (uploadingAttachment.phase === "finalizing") {
        return {
          variant: "uploading",
          text: chatCopy.composer.finishing(uploadingAttachment.name),
        };
      }
      const percent = Math.max(0, Math.min(100, Math.round(attachmentProgress * 100)));
      return {
        variant: "uploading",
        text: chatCopy.composer.uploading(uploadingAttachment.name, percent),
      };
    }
    if (hasQueuedAttachments) {
      return {
        variant: "ready",
        text: chatCopy.composer.attachmentsReady(queuedAttachments.length),
      };
    }
    return null;
  }, [
    attachmentError,
    attachmentProgress,
    hasQueuedAttachments,
    queuedAttachments.length,
    uploadingAttachment,
  ]);

  const trimmedDraft = React.useMemo(() => draft.replace(/\s+/g, " ").trim(), [draft]);
  const hasTypedContent = trimmedDraft.length > 0;
  const hasAttachmentBlock =
    hasQueuedAttachments || Boolean(uploadingAttachment) || pendingFileCount > 0;
  const disableSend =
    submitting ||
    isAttachmentBusy ||
    (!hasTypedContent && !hasQueuedAttachments) ||
    Boolean(attachmentError);

  const handleAttachmentButtonClick = React.useCallback(() => {
    handleAttachClick();
  }, [handleAttachClick]);

  const handleGifButtonClick = React.useCallback(() => {
    setGifPickerOpen((current) => !current);
  }, []);

  const handleGifSelect = React.useCallback(
    (gif: GifPickerSelection) => {
      if (!GIF_SUPPORT_ENABLED) return;
      const size =
        typeof gif.size === "number" && Number.isFinite(gif.size) && gif.size > 0 ? gif.size : null;
      if (size !== null && size > GIF_SIZE_LIMIT_BYTES) {
        setError(
          `GIF is too large (${formatAttachmentSize(size)}). Limit is ${formatAttachmentSize(GIF_SIZE_LIMIT_BYTES)}.`,
        );
        return;
      }
      setError(null);
      attachRemoteAttachment({
        url: gif.url,
        thumbUrl: gif.previewUrl,
        name: gif.title || "GIF",
        mimeType: "image/gif",
        size: size ?? 0,
      });
      setGifPickerOpen(false);
    },
    [attachRemoteAttachment],
  );

  React.useEffect(() => {
    if (!GIF_SUPPORT_ENABLED && isGifPickerOpen) {
      setGifPickerOpen(false);
    }
  }, [isGifPickerOpen]);

  const handleFileInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      if (event.target.value) event.target.value = "";
      if (!files.length) return;
      enqueueFiles(files);
    },
    [enqueueFiles],
  );

  const handleRemoveQueuedAttachment = React.useCallback((attachmentId: string) => {
    setQueuedAttachments((previous) => previous.filter((item) => item.id !== attachmentId));
  }, []);

  const handleRemoveUploadingAttachment = React.useCallback(() => {
    pendingFilesRef.current = [];
    setPendingFileCount(0);
    clearAttachment();
  }, [clearAttachment]);

  const handleDraftChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value);
  }, []);

  const handleDraftBlur = React.useCallback(() => {
    // no-op placeholder for parity
  }, []);

  const handlePaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!event.clipboardData) return;
      const files: File[] = [];
      for (const item of Array.from(event.clipboardData.items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length) {
        event.preventDefault();
        enqueueFiles(files);
      }
    },
    [enqueueFiles],
  );

  const handleDragEnter = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(true);
  }, []);

  const handleDragOver = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingFile) {
      setIsDraggingFile(true);
    }
  }, [isDraggingFile]);

  const handleDragLeave = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === event.target) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingFile(false);
      const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
      if (files.length) {
        enqueueFiles(files);
      }
    },
    [enqueueFiles],
  );

  const adjustTextareaHeight = React.useCallback(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 220;
    const nextHeight = Math.min(maxHeight, Math.max(56, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }, []);

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, draft.length, hasAttachmentBlock]);

  const handleEmojiSelect = React.useCallback(
    (emoji: string) => {
      setDraft((previous) => {
        const textarea = messageInputRef.current;
        if (!textarea) return `${previous}${emoji}`;
        const start = textarea.selectionStart ?? previous.length;
        const end = textarea.selectionEnd ?? previous.length;
        const before = previous.slice(0, start);
        const after = previous.slice(end);
        requestAnimationFrame(() => {
          textarea.focus();
          const cursor = start + emoji.length;
          textarea.setSelectionRange(cursor, cursor);
          adjustTextareaHeight();
        });
        return `${before}${emoji}${after}`;
      });
      setEmojiPickerOpen(false);
    },
    [adjustTextareaHeight],
  );

  const handleMemorySelect = React.useCallback(
    (memory: DisplayMemoryUpload) => {
      const label = memory.title?.trim() || memory.description?.trim() || "Memory asset";
      attachRemoteAttachment({
        url: memory.fullUrl,
        thumbUrl: memory.displayUrl,
        name: label,
        mimeType: memory.media_type ?? null,
      });
      setMemoryPickerOpen(false);
    },
    [attachRemoteAttachment],
  );

  const postId = post.id;
  const postCapsuleId =
    (post as { capsuleId?: string | null; capsule_id?: string | null }).capsuleId ??
    (post as { capsule_id?: string | null }).capsule_id ??
    null;

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = trimmedDraft;
      const attachmentsForSend = queuedAttachments.map((attachment) =>
        sanitizeAttachmentForSend(attachment),
      );
      if (!trimmed && attachmentsForSend.length === 0) return;
      if (attachmentUploading || attachmentError) return;
      const clientId = safeRandomUUID();
      const now = new Date().toISOString();
      setError(null);
      try {
        await onSubmit({
          clientId,
          postId: postId,
          content: trimmed,
          attachments: attachmentsForSend,
          capsuleId: postCapsuleId,
          userName: user?.name ?? user?.email ?? null,
          userAvatar: user?.avatarUrl ?? null,
          ts: now,
        });
        setDraft("");
        setQueuedAttachments([]);
        pendingFilesRef.current = [];
        setPendingFileCount(0);
        clearAttachment();
        adjustTextareaHeight();
        setGifPickerOpen(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to submit comment.";
        setError(message);
      }
    },
    [
      trimmedDraft,
      queuedAttachments,
      attachmentUploading,
      attachmentError,
      onSubmit,
      postId,
      postCapsuleId,
      user?.name,
      user?.email,
      user?.avatarUrl,
      clearAttachment,
      adjustTextareaHeight,
    ],
  );

  const commentCount = thread.comments.length;
  const postMediaUrl = React.useMemo(() => {
    if (typeof post.mediaUrl !== "string") return null;
    const trimmed = post.mediaUrl.trim();
    return trimmed.length ? trimmed : null;
  }, [post.mediaUrl]);
  const postContentText = React.useMemo(() => {
    if (typeof post.content !== "string") return null;
    const trimmed = post.content.trim();
    return trimmed.length ? trimmed : null;
  }, [post.content]);

  const memoryOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );
  const uploadMemories = React.useMemo(
    () => computeDisplayUploads(memoryUploads.items, { origin: memoryOrigin, cloudflareEnabled: true }),
    [memoryUploads.items, memoryOrigin],
  );
  const assetMemories = React.useMemo(
    () =>
      computeDisplayUploads(
        memoryAssets.items.filter((item) => (item.kind ?? "").toLowerCase() !== "upload"),
        { origin: memoryOrigin, cloudflareEnabled: true },
      ),
    [memoryAssets.items, memoryOrigin],
  );

  const plusMenuItems = React.useMemo(
    () => [
      {
        key: "emoji",
        label: "Add emoji",
        icon: <Smiley size={16} weight="bold" />,
        onSelect: () => {
          setEmojiPickerOpen(true);
          setGifPickerOpen(false);
        },
      },
      {
        key: "memories",
        label: "Browse memories",
        icon: <StackSimple size={16} weight="bold" />,
        onSelect: () => {
          setMemoryPickerOpen(true);
          setGifPickerOpen(false);
          setEmojiPickerOpen(false);
        },
      },
    ],
    [],
  );

  const panelWidth = React.useMemo(() => {
    if (typeof window === "undefined") return 720;
    // Match CSS width: clamp(680px, 72vw, 960px)
    const vwWidth = Math.round(window.innerWidth * 0.72);
    return Math.min(960, Math.max(680, vwWidth));
  }, []);

  const panelPosition = React.useMemo(() => {
    if (typeof window === "undefined") {
      return { top: 48, left: 0, width: panelWidth };
    }
    const margin = 24;
    const availableWidth = window.innerWidth;
    const width = Math.min(panelWidth, availableWidth - margin * 2);
    const left = Math.max(margin, Math.round((availableWidth - width) / 2));
    const top = Math.max(margin, Math.round(window.innerHeight * 0.06));
    return { top, left, width };
  }, [panelWidth]);

  const commentList = React.useMemo(() => {
    if (!Array.isArray(thread.comments)) return [];
    return thread.comments;
  }, [thread.comments]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!portalEl) return null;

  return createPortal(
    <div className={styles.overlay} data-visible={visible ? "true" : "false"}>
      <div className={styles.backdrop} role="presentation" onClick={handleBackdropClick} />
      <div
        className={styles.panel}
        style={{ top: `${panelPosition.top}px`, left: `${panelPosition.left}px`, width: `${panelPosition.width}px` }}
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 className={styles.title}>{post.user_name?.trim() || "Post"}</h2>
            <p className={styles.subtitle}>{commentCount === 1 ? "1 comment" : `${commentCount} comments`}</p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </header>
        <div className={styles.commentScroll}>
          {(postMediaUrl || postContentText) ? (
            <div className={styles.postPreview}>
              {postMediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.postMedia} src={postMediaUrl} alt="Post media" />
              ) : null}
              {postContentText ? (
                <p className={styles.postText}>{postContentText}</p>
              ) : null}
            </div>
          ) : null}
          {(() => {
            const likeCount = typeof post.likes === "number" ? Math.max(0, post.likes) : 0;
            const baseCommentCount = typeof post.comments === "number" ? Math.max(0, post.comments) : 0;
            const shareCount = typeof post.shares === "number" ? Math.max(0, post.shares) : 0;
            const totalComments = Math.max(commentCount, baseCommentCount);
            return (
              <div className={styles.engagementBar}>
                <div className={styles.engagementCounts}>
                  <span>{likeCount} Likes</span>
                  <span>{totalComments} Comments</span>
                  <span>{shareCount} Shares</span>
                </div>
                <div className={styles.engagementActions}>
                  <button type="button" className={styles.engageBtn}>Like</button>
                  <button type="button" className={styles.engageBtn}>Comment</button>
                  <button type="button" className={styles.engageBtn}>Share</button>
                </div>
              </div>
            );
          })()}
          {thread.status === "loading" && !commentList.length ? (
            <p className={styles.loadingState}>Loading comments…</p>
          ) : null}
          {thread.status === "error" ? (
            <div className={styles.errorState} role="alert">
              <p style={{ margin: 0 }}>{thread.error ?? "Failed to load comments."}</p>
              <button
                type="button"
                className={styles.headerButton}
                style={{ marginTop: 12 }}
                onClick={() => {
                  void onReload(post.id);
                }}
              >
                Retry
              </button>
              </div>
          ) : null}
          {thread.status !== "error" && !commentList.length && thread.status === "loaded" ? (
            <p className={styles.emptyState}>
              Be the first to start the conversation and share your perspective.
            </p>
          ) : null}
          <div className={styles.commentList}>
            {commentList.map((comment) => {
              const userName =
                comment.userName?.trim() ||
                comment.userAvatar?.trim() ||
                (comment.pending ? "Sending…" : "Capsule member");
              const content = comment.content?.trim() || "";
              const timeLabel = timeAgo(comment.ts);
              return (
                <div
                  key={comment.id}
                  className={styles.commentItem}
                  data-pending={comment.pending ? "true" : undefined}
                  data-error={comment.error ? "true" : undefined}
                >
                  <div className={styles.commentAvatar} aria-hidden>
                    {comment.userAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={comment.userAvatar} alt="" />
                    ) : (
                      initialsFrom(comment.userName ?? userName)
                    )}
                  </div>
                  <div className={styles.commentBubble}>
                    <div className={styles.commentHeader}>
                      <span className={styles.commentName}>{userName}</span>
                      <time
                        className={styles.commentTimestamp}
                        dateTime={comment.ts}
                        title={exactTime(comment.ts)}
                      >
                        {timeLabel}
                      </time>
                    </div>
                    {content ? <p className={styles.commentContent}>{content}</p> : null}
                    {Array.isArray(comment.attachments) && comment.attachments.length ? (
                      <div className={styles.commentAttachments}>
                        {comment.attachments.map((attachmentEntry) => {
                          const label = attachmentEntry.name?.trim() || attachmentEntry.url;
                          return (
                            <a
                              key={`${comment.id}-${attachmentEntry.id}`}
                              className={styles.attachmentLink}
                              href={attachmentEntry.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Paperclip size={14} weight="bold" /> {label}
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                    {comment.pending ? (
                      <span className={styles.commentTimestamp}>Sending…</span>
                    ) : null}
                    {comment.error ? (
                      <span className={styles.commentTimestamp} role="alert">
                        {comment.error}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className={styles.composerSection}>
          <p className={styles.composerHint}>
            <span className={styles.composerHintStrong}>Tip:</span> Attach memories, drop in a GIF,
            or ask Capsule AI for suggestions before you send.
          </p>
          <div style={{ position: "relative" }}>
            {isEmojiPickerOpen ? (
              <div className={styles.floatingEmojiPicker}>
                <EmojiPicker
                  onSelect={handleEmojiSelect}
                  onClose={() => setEmojiPickerOpen(false)}
                  anchorLabel="Add emoji"
                />
              </div>
            ) : null}
            <ChatComposer
              error={error}
              draft={draft}
              sending={submitting}
              disableSend={disableSend}
              hasAttachmentBlock={hasAttachmentBlock}
              queuedAttachments={queuedAttachments}
              uploadingAttachment={uploadingAttachment}
              attachmentProgress={attachmentProgress}
              composerStatus={composerStatus}
              attachmentError={attachmentError}
              isDraggingFile={isDraggingFile}
              isGifPickerOpen={isGifPickerOpen}
              sessionType="direct"
              messageInputRef={messageInputRef}
              fileInputRef={fileInputRef}
              onSubmit={handleSubmit}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDraftChange={handleDraftChange}
              onDraftBlur={handleDraftBlur}
              onPaste={handlePaste}
              onRemoveQueuedAttachment={handleRemoveQueuedAttachment}
              onRemoveUploadingAttachment={handleRemoveUploadingAttachment}
              onAttachmentButtonClick={handleAttachmentButtonClick}
              onGifButtonClick={handleGifButtonClick}
              onGifSelect={handleGifSelect}
              onGifClose={() => setGifPickerOpen(false)}
              onFileInputChange={handleFileInputChange}
              placeholder="Write a comment"
              plusMenuItems={plusMenuItems}
            />
          </div>
        </div>
      </div>
      <ComposerMemoryPicker
        open={memoryPickerOpen}
        activeTab={memoryPickerTab}
        onTabChange={setMemoryPickerTab}
        uploads={uploadMemories}
        uploadsLoading={memoryUploads.loading}
        uploadsError={memoryUploads.error}
        assets={assetMemories}
        assetsLoading={memoryAssets.loading}
        assetsError={memoryAssets.error}
        onSelect={handleMemorySelect}
        onClose={() => setMemoryPickerOpen(false)}
      />
    </div>,
    portalEl,
  );
}

export type { CommentSubmitPayload };
