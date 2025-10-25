"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  PaperPlaneTilt,
  Trash,
  UserPlus,
  Smiley,
  NotePencil,
  Paperclip,
  Gif,
} from "@phosphor-icons/react/dist/ssr";

import type {
  ChatMessage,
  ChatParticipant,
  ChatSession,
} from "@/components/providers/ChatProvider";
import { useCurrentUser } from "@/services/auth/client";

import type { ChatMessageSendInput } from "@/components/providers/ChatProvider";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import type { EmojiPickerProps } from "./EmojiPicker";
import type { GifPickerProps, GifPickerSelection } from "./GifPicker";

import styles from "./chat.module.css";

const EmojiPicker = dynamic<EmojiPickerProps>(
  () => import("./EmojiPicker").then((mod) => mod.EmojiPicker),
  {
    ssr: false,
    loading: () => (
      <div className={styles.emojiPickerLoading} role="status" aria-live="polite">
        Loading emoji&hellip;
      </div>
    ),
  },
);

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

function formatMessageTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatPresence(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < 45_000) return "Active now";
  if (diff < hour) return `Active ${Math.max(1, Math.round(diff / minute))}m ago`;
  if (diff < 24 * hour) return `Active ${Math.max(1, Math.round(diff / hour))}h ago`;
  if (diff < 7 * day) return `Active ${Math.max(1, Math.round(diff / day))}d ago`;
  return `Active on ${new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function initialsFrom(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function typingDisplayName(participant: ChatParticipant): string {
  const name = typeof participant.name === "string" ? participant.name.trim() : "";
  if (name) return name;
  const id = typeof participant.id === "string" ? participant.id.trim() : "";
  return id || "Someone";
}

function describeTypingParticipants(participants: ChatParticipant[]): string {
  const names = participants.map(typingDisplayName);
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing...`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing...`;
}

function isContinuationOf(previous: ChatMessage | null | undefined, current: ChatMessage): boolean {
  if (!previous) return false;
  if ((previous.authorId ?? null) !== (current.authorId ?? null)) return false;
  const previousTime = Date.parse(previous.sentAt);
  const currentTime = Date.parse(current.sentAt);
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return false;
  return Math.abs(currentTime - previousTime) < MESSAGE_GROUP_WINDOW_MS;
}

type ReactionPickerFloatingProps = {
  anchorRect: DOMRect;
  anchorLabel: string | null;
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

function ReactionPickerFloating({
  anchorRect,
  anchorLabel,
  onSelect,
  onClose,
}: ReactionPickerFloatingProps) {
  const portalRef = React.useRef<HTMLElement | null>(null);
  const isBrowser = typeof document !== "undefined" && typeof window !== "undefined";

  React.useEffect(() => {
    if (!isBrowser) return;
    if (!portalRef.current) return;
    document.body.appendChild(portalRef.current);
    return () => {
      portalRef.current?.remove();
    };
  }, [isBrowser]);

  if (!isBrowser) {
    return null;
  }

  if (!portalRef.current) {
    portalRef.current = document.createElement("div");
  }

  const node = portalRef.current;
  if (!node) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const estimatedWidth = Math.min(320, viewportWidth - 24);
  const halfWidth = estimatedWidth / 2;
  let centerX = anchorRect.left + anchorRect.width / 2;
  centerX = Math.max(halfWidth + 12, Math.min(viewportWidth - halfWidth - 12, centerX));
  const estimatedHeight = 320;
  const openAbove = anchorRect.top >= estimatedHeight + 24 || anchorRect.top > viewportHeight / 2;
  const top = openAbove ? anchorRect.top : anchorRect.bottom;
  const transform = openAbove
    ? "translate(-50%, calc(-100% - 12px))"
    : "translate(-50%, 12px)";

  return createPortal(
    <div
      className={styles.reactionPickerFloating}
      style={{ top, left: centerX, transform }}
      data-role="reaction-picker"
    >
      <div className={styles.messageReactionPicker} data-role="reaction-picker">
        <EmojiPicker
          onSelect={onSelect}
          onClose={onClose}
          anchorLabel={anchorLabel ?? undefined}
        />
      </div>
    </div>,
    node,
  );
}

type PendingAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl: string | null;
  storageKey: string | null;
  sessionId: string | null;
};

const MESSAGE_GROUP_WINDOW_MS = 5 * 60_000;
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

const GIF_SIZE_LIMIT_BYTES = 7 * 1024 * 1024;
const REACTION_PICKER_LONG_PRESS_MS = 450;
const GIF_TELEMETRY_ENDPOINT = "/api/telemetry/chat-gif";

type GifTelemetryPayload = {
  action: "select" | "oversize_rejected";
  provider: string;
  gifId: string;
  size: number | null;
};


type ChatConversationProps = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  onSend: (input: ChatMessageSendInput) => Promise<void>;
  onBack?: () => void;
  onDelete?: () => void;
  onInviteParticipants?: () => void;
  onRenameGroup?: () => void;
  onTypingChange?: (conversationId: string, typing: boolean) => void;
  onToggleReaction?: (conversationId: string, messageId: string, emoji: string) => Promise<void>;
};

function renderConversationAvatar(
  session: ChatSession,
  remoteParticipants: ChatParticipant[],
  title: string,
) {
  if (session.avatar) {
    return (
      <Image
        src={session.avatar}
        alt=""
        width={44}
        height={44}
        className={styles.conversationAvatarImage}
        sizes="44px"
      />
    );
  }
  if (session.type === "group") {
    const visible = (remoteParticipants.length ? remoteParticipants : session.participants).slice(
      0,
      3,
    );
    return (
      <span className={styles.conversationAvatarGroup} aria-hidden>
        {visible.map((participant, index) =>
          participant.avatar ? (
            <Image
              key={`${participant.id}-${index}`}
              src={participant.avatar}
              alt=""
              width={44}
              height={44}
              className={styles.conversationAvatarImage}
              sizes="44px"
            />
          ) : (
            <span key={`${participant.id}-${index}`} className={styles.conversationAvatarFallback}>
              {initialsFrom(participant.name)}
            </span>
          ),
        )}
        {session.participants.length > visible.length ? (
          <span
            className={`${styles.conversationAvatarFallback} ${styles.conversationAvatarOverflow}`.trim()}
          >
            +{session.participants.length - visible.length}
          </span>
        ) : null}
      </span>
    );
  }
  const primary = remoteParticipants[0] ?? session.participants[0];
  if (primary?.avatar) {
    return (
      <Image
        src={primary.avatar}
        alt=""
        width={44}
        height={44}
        className={styles.conversationAvatarImage}
        sizes="44px"
      />
    );
  }
  return (
    <span className={styles.conversationAvatarFallback}>
      {initialsFrom(primary?.name ?? title)}
    </span>
  );
}

function formatAttachmentSize(value: number | null | undefined): string {
  const size = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  if (size > 0) {
    return `${size} B`;
  }
  return "";
}

function renderStatus(message: ChatMessage): React.ReactNode {
  if (message.status === "failed") {
    return (
      <span className={`${styles.messageStatus} ${styles.messageStatusFailed}`.trim()}>
        Failed to send
      </span>
    );
  }
  if (message.status === "pending") {
    return <span className={styles.messageStatus}>Sending...</span>;
  }
  return null;
}

export function ChatConversation({
  session,
  currentUserId,
  selfClientId,
  onSend,
  onBack,
  onDelete,
  onInviteParticipants,
  onRenameGroup,
  onToggleReaction,
  onTypingChange,
}: ChatConversationProps) {
  const { user } = useCurrentUser();
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reactionTargetId, setReactionTargetId] = React.useState<string | null>(null);
  const [reactionAnchorEl, setReactionAnchorEl] = React.useState<HTMLElement | null>(null);
  const [reactionAnchorRect, setReactionAnchorRect] = React.useState<DOMRect | null>(null);
  const [reactionAnchorLabel, setReactionAnchorLabel] = React.useState<string | null>(null);
  const [isGifPickerOpen, setGifPickerOpen] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement | null>(null);
  const messageInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const reactionLongPressTimerRef = React.useRef<number | null>(null);
  const reactionLongPressTriggeredRef = React.useRef(false);

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
  const pendingFilesRef = React.useRef<File[]>([]);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);

  const clearReactionLongPress = React.useCallback(() => {
    if (reactionLongPressTimerRef.current !== null) {
      if (typeof window !== "undefined") {
        window.clearTimeout(reactionLongPressTimerRef.current);
      }
      reactionLongPressTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      clearReactionLongPress();
    };
  }, [clearReactionLongPress]);

  const sendGifTelemetry = React.useCallback(
    (payload: GifTelemetryPayload) => {
      const body = JSON.stringify({
        ...payload,
        conversationId: session.id,
        timestamp: new Date().toISOString(),
      });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        try {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(GIF_TELEMETRY_ENDPOINT, blob);
          return;
        } catch {
          // Fallback to fetch below if sendBeacon fails.
        }
      }
      if (typeof fetch === "function") {
        void fetch(GIF_TELEMETRY_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    },
    [session.id],
  );

  const processNextQueuedFile = React.useCallback(async () => {
    if (attachmentUploading || attachment) return;
    const next = pendingFilesRef.current.shift();
    if (!next) return;
    try {
      await handleAttachmentFile(next);
    } catch (uploadError) {
      console.error("attachment upload failed", uploadError);
    }
  }, [attachment, attachmentUploading, handleAttachmentFile]);

  const enqueueFiles = React.useCallback(
    (files: File[]) => {
      if (!files.length) return;
      pendingFilesRef.current.push(...files);
      void processNextQueuedFile();
    },
    [processNextQueuedFile],
  );

  React.useEffect(() => {
    return () => {
      pendingFilesRef.current = [];
    };
  }, []);

  React.useEffect(() => {
    if (!readyAttachment || readyAttachment.status !== "ready" || !readyAttachment.url) return;
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
        url: readyAttachment.url!,
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

  const adjustTextareaHeight = React.useCallback(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 220;
    const nextHeight = Math.min(maxHeight, Math.max(56, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }, []);

  const uploadingAttachment =
    attachment && attachment.status !== "ready" ? attachment : null;
  const attachmentError =
    attachment?.status === "error" ? attachment.error ?? "Upload failed" : null;
  const attachmentProgress =
    typeof attachment?.progress === "number"
      ? Math.max(0, Math.min(1, attachment.progress))
      : 0;
  const hasQueuedAttachments = queuedAttachments.length > 0;
  const trimmedDraft = React.useMemo(() => draft.replace(/\s+/g, " ").trim(), [draft]);
  const hasTypedContent = trimmedDraft.length > 0;
  const hasAttachmentBlock = hasQueuedAttachments || Boolean(uploadingAttachment);
  const disableSend =
    sending ||
    attachmentUploading ||
    (!hasTypedContent && !hasQueuedAttachments) ||
    Boolean(attachmentError);

  const selfIdentifiers = React.useMemo(() => {
    const ids = new Set<string>();
    if (currentUserId) ids.add(currentUserId);
    if (selfClientId) ids.add(selfClientId);
    return ids;
  }, [currentUserId, selfClientId]);

  const participantMap = React.useMemo(() => {
    const map = new Map<string, ChatParticipant>();
    session.participants.forEach((participant) => {
      map.set(participant.id, participant);
    });
    return map;
  }, [session.participants]);

  const closeReactionPicker = React.useCallback(() => {
    setReactionTargetId(null);
    setReactionAnchorEl(null);
    setReactionAnchorRect(null);
    setReactionAnchorLabel(null);
    reactionLongPressTriggeredRef.current = false;
    clearReactionLongPress();
  }, [clearReactionLongPress]);

  React.useEffect(() => {
    closeReactionPicker();
  }, [closeReactionPicker, session.id]);

  React.useEffect(() => {
    if (!reactionTargetId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeReactionPicker();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeReactionPicker, reactionTargetId]);

  // Close the emoji picker if user clicks outside of it.
  React.useEffect(() => {
    if (!reactionTargetId) return;
    const onPointerDown = (event: MouseEvent) => {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (el.closest('[data-role="reaction-picker"]')) return;
      if (el.closest('[data-role="reaction-button"]')) return;
      closeReactionPicker();
    };
    window.addEventListener("mousedown", onPointerDown, { capture: true } as AddEventListenerOptions);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, { capture: true } as AddEventListenerOptions);
    };
  }, [closeReactionPicker, reactionTargetId]);

  React.useEffect(() => {
    if (!reactionAnchorEl) {
      setReactionAnchorRect(null);
      return;
    }
    const update = () => {
      setReactionAnchorRect(reactionAnchorEl.getBoundingClientRect());
    };
    update();
    const scrollContainer = messagesRef.current;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    scrollContainer?.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      scrollContainer?.removeEventListener("scroll", update);
    };
  }, [reactionAnchorEl]);

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, draft.length, hasAttachmentBlock]);

  const typingParticipants = React.useMemo(() => {
    if (!Array.isArray(session.typing) || session.typing.length === 0) {
      return [] as ChatParticipant[];
    }
    const seen = new Set<string>();
    const unique: ChatParticipant[] = [];
    session.typing.forEach((participant) => {
      if (!participant || typeof participant.id !== "string") return;
      if (selfIdentifiers.has(participant.id)) return;
      const key = participant.id.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      unique.push(participant);
    });
    return unique;
  }, [session.typing, selfIdentifiers]);

  const typingText = React.useMemo(
    () => (typingParticipants.length ? describeTypingParticipants(typingParticipants) : ""),
    [typingParticipants],
  );
  const primaryTypingParticipant = typingParticipants[0] ?? null;
  const typingRemainderCount = typingParticipants.length > 1 ? typingParticipants.length - 1 : 0;

  const handleToggleReaction = React.useCallback(
    (messageId: string, emoji: string) => {
      if (!onToggleReaction) return;
      void onToggleReaction(session.id, messageId, emoji).catch((error) => {
        console.error("chat reaction toggle failed", error);
      });
    },
    [onToggleReaction, session.id],
  );

  const handleReactionPickerToggle = React.useCallback(
    (messageId: string, anchor: HTMLElement | null, label: string) => {
      if (reactionTargetId === messageId) {
        closeReactionPicker();
        return;
      }
      setReactionTargetId(messageId);
      setReactionAnchorEl(anchor ?? null);
      setReactionAnchorLabel(label);
      if (anchor) {
        setReactionAnchorRect(anchor.getBoundingClientRect());
      } else {
        setReactionAnchorRect(null);
      }
    },
    [closeReactionPicker, reactionTargetId],
  );

  const handleReactionAddClick = React.useCallback(
    (messageId: string, anchor: HTMLButtonElement, label: string) => {
      if (reactionLongPressTriggeredRef.current) {
        reactionLongPressTriggeredRef.current = false;
        return;
      }
      handleReactionPickerToggle(messageId, anchor, label);
    },
    [handleReactionPickerToggle],
  );

  const handleReactionAddPointerDown = React.useCallback(
    (messageId: string, label: string, event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      reactionLongPressTriggeredRef.current = false;
      clearReactionLongPress();
      if (typeof window === "undefined") return;
      const anchor = event.currentTarget;
      reactionLongPressTimerRef.current = window.setTimeout(() => {
        reactionLongPressTimerRef.current = null;
        reactionLongPressTriggeredRef.current = true;
        handleReactionPickerToggle(messageId, anchor, label);
      }, REACTION_PICKER_LONG_PRESS_MS);
    },
    [clearReactionLongPress, handleReactionPickerToggle],
  );

  const handleReactionAddPointerComplete = React.useCallback(() => {
    clearReactionLongPress();
  }, [clearReactionLongPress]);

  const handleReactionAddContextMenu = React.useCallback(
    (messageId: string, label: string, event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      reactionLongPressTriggeredRef.current = true;
      handleReactionPickerToggle(messageId, event.currentTarget, label);
    },
    [handleReactionPickerToggle],
  );

  const handleReactionSelect = React.useCallback(
    (emoji: string) => {
      if (!reactionTargetId) return;
      handleToggleReaction(reactionTargetId, emoji);
      closeReactionPicker();
    },
    [closeReactionPicker, handleToggleReaction, reactionTargetId],
  );

  React.useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [session.messages.length]);

  const acceptsFiles = React.useCallback((items: DataTransferItemList | null | undefined): boolean => {
    if (!items || items.length === 0) return false;
    return Array.from(items).some((item) => item.kind === "file");
  }, []);

  const handleDragEnter = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!acceptsFiles(event.dataTransfer?.items)) return;
      event.preventDefault();
      setIsDraggingFile(true);
    },
    [acceptsFiles],
  );

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!acceptsFiles(event.dataTransfer?.items)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setIsDraggingFile(true);
    },
    [acceptsFiles],
  );

  const handleDragLeave = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingFile(false);
  }, []);

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!acceptsFiles(event.dataTransfer?.items)) return;
      event.preventDefault();
      setIsDraggingFile(false);
      const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
      if (files.length) {
        enqueueFiles(files);
      }
    },
    [acceptsFiles, enqueueFiles],
  );

  const handleDraftChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft(value);
      requestAnimationFrame(() => adjustTextareaHeight());
      if (onTypingChange) {
        const hasContent =
          value.replace(/\s+/g, "").length > 0 ||
          hasQueuedAttachments ||
          attachmentUploading;
        onTypingChange(session.id, hasContent);
      }
    },
    [adjustTextareaHeight, attachmentUploading, hasQueuedAttachments, onTypingChange, session.id],
  );

  const handleDraftBlur = React.useCallback(() => {
    onTypingChange?.(session.id, false);
  }, [onTypingChange, session.id]);

  const handlePaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      const files = Array.from(clipboard.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!files.length) return;
      event.preventDefault();
      enqueueFiles(files);
    },
    [enqueueFiles],
  );

  React.useEffect(() => {
    return () => {
      pendingFilesRef.current = [];
    };
  }, []);

  React.useEffect(() => {
    return () => {
      onTypingChange?.(session.id, false);
    };
  }, [onTypingChange, session.id]);

  React.useEffect(() => {
    if (!onTypingChange) return;
    const hasText = draft.replace(/\s+/g, "").length > 0;
    if (hasText) return;
    onTypingChange(
      session.id,
      (hasQueuedAttachments || attachmentUploading) && !attachmentError,
    );
  }, [attachmentError, attachmentUploading, draft, hasQueuedAttachments, onTypingChange, session.id]);

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
        sendGifTelemetry({
          action: "oversize_rejected",
          provider: gif.provider,
          gifId: gif.id,
          size,
        });
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
      sendGifTelemetry({
        action: "select",
        provider: gif.provider,
        gifId: gif.id,
        size,
      });
    },
    [attachRemoteAttachment, sendGifTelemetry],
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
    clearAttachment();
  }, [clearAttachment]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.replace(/\s+/g, " ").trim();
    const attachmentsForSend = queuedAttachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl,
      storageKey: attachment.storageKey,
      sessionId: attachment.sessionId,
    }));
    if (!trimmed && attachmentsForSend.length === 0) return;
    if (attachmentUploading || attachmentError) return;
    setSending(true);
    setError(null);
    try {
      await onSend({ body: trimmed, attachments: attachmentsForSend });
      setDraft("");
      setQueuedAttachments([]);
      pendingFilesRef.current = [];
      clearAttachment();
      requestAnimationFrame(() => adjustTextareaHeight());
      onTypingChange?.(session.id, false);
      setGifPickerOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message.";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const selfName = user?.name || user?.email || "You";
  const selfAvatar = user?.avatarUrl || null;
  const remoteParticipants = React.useMemo(() => {
    return session.participants.filter((participant) => !selfIdentifiers.has(participant.id));
  }, [selfIdentifiers, session.participants]);

  const lastPresenceSource = session.lastMessageAt ?? session.messages.at(-1)?.sentAt ?? null;
  const presence =
    session.type === "group"
      ? `${session.participants.length} member${session.participants.length === 1 ? "" : "s"}`
      : formatPresence(lastPresenceSource);
  const title = session.title?.trim() || (remoteParticipants[0]?.name ?? "Chat");

  return (
    <div className={styles.conversation}>
      <div className={styles.conversationHeader}>
        <div className={styles.conversationHeaderLeft}>
          {onBack ? (
            <button
              type="button"
              className={styles.conversationAction}
              onClick={onBack}
              aria-label="Back to chats"
            >
              <ArrowLeft size={18} weight="bold" />
            </button>
          ) : null}
          <span className={styles.conversationAvatar} aria-hidden>
            {renderConversationAvatar(session, remoteParticipants, title)}
          </span>
          <div className={styles.conversationTitleBlock}>
            <span className={styles.conversationTitle}>{title}</span>
            {presence ? <span className={styles.conversationSubtitle}>{presence}</span> : null}
          </div>
        </div>
        <div className={styles.conversationHeaderActions}>
          {session.type === "group" && onRenameGroup ? (
            <button
              type="button"
              className={styles.conversationAction}
              onClick={onRenameGroup}
              aria-label="Rename group"
            >
              <NotePencil size={18} weight="duotone" />
            </button>
          ) : null}
          {session.type === "group" && onInviteParticipants ? (
            <button
              type="button"
              className={styles.conversationAction}
              onClick={onInviteParticipants}
              aria-label="Add participants"
            >
              <UserPlus size={18} weight="bold" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className={`${styles.conversationAction} ${styles.conversationActionDanger}`.trim()}
              onClick={onDelete}
              aria-label="Delete chat"
            >
              <Trash size={18} weight="duotone" />
            </button>
          ) : null}
        </div>
      </div>

      {session.type === "group" ? (
        <div className={styles.conversationParticipants}>
            {session.participants.map((participant) => (
              <button
                key={participant.id}
                type="button"
                className={styles.conversationParticipant}
                title={participant.name}
                onClick={() => onInviteParticipants?.()}
                disabled={!onInviteParticipants}
                aria-disabled={!onInviteParticipants}
                aria-label={participant.name ? `View ${participant.name}` : "View participant"}
              >
              {participant.avatar ? (
                <Image
                  src={participant.avatar}
                  alt=""
                  width={28}
                  height={28}
                  className={styles.conversationParticipantAvatar}
                  sizes="28px"
                />
              ) : (
                <span className={styles.conversationParticipantInitials}>
                  {initialsFrom(participant.name)}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={messagesRef} className={styles.messageList}>
        {session.messages.map((message, index) => {
          const baseKey =
            message.id && message.id.trim().length > 0
              ? `${message.id}-${index}`
              : `${message.authorId ?? "message"}-${message.sentAt}-${index}`;
          const messageKey = baseKey.replace(/\s+/g, "_");
          const previous = index > 0 ? session.messages[index - 1] : null;
          const isSelf = message.authorId ? selfIdentifiers.has(message.authorId) : false;
          const author = message.authorId ? participantMap.get(message.authorId) : null;
          const avatar = isSelf ? selfAvatar : (author?.avatar ?? null);
          const displayName = isSelf ? selfName : (author?.name ?? "Member");
          const statusNode = renderStatus(message);
          const grouped = isContinuationOf(previous, message);
          const showAvatar = !grouped;
          const showHeader = !grouped;
          const messageTimestamp = formatMessageTime(message.sentAt);
          const messageReactions = Array.isArray(message.reactions) ? message.reactions : [];
          const hasReactions = messageReactions.length > 0;
          const showReactions = Boolean(onToggleReaction) || hasReactions;
          const isPickerOpen = reactionTargetId === message.id;
          const attachments = Array.isArray(message.attachments) ? message.attachments : [];
          const hasAttachments = attachments.length > 0;
          const showBody = Boolean(message.body);
          const itemClassName = `${styles.messageItem} ${
            isSelf ? styles.messageItemSelf : styles.messageItemOther
          } ${grouped ? styles.messageItemGrouped : ""}`.trim();
          const avatarClassName = `${styles.messageAvatar} ${
            showAvatar ? "" : styles.messageAvatarHidden
          }`.trim();
          const reactionClassName = `${styles.messageReactions} ${
            hasReactions || isPickerOpen ? styles.messageReactionsVisible : ""
          }`.trim();
          const messageTitle = showHeader ? undefined : messageTimestamp || undefined;
          return (
            <div key={messageKey} className={itemClassName}>
              <span className={avatarClassName} aria-hidden>
                {showAvatar ? (
                  avatar ? (
                    <Image
                      src={avatar}
                      alt=""
                      width={36}
                      height={36}
                      className={styles.messageAvatarImage}
                      sizes="36px"
                    />
                  ) : (
                    <span className={styles.messageAvatarFallback}>
                      {initialsFrom(displayName)}
                    </span>
                  )
                ) : null}
              </span>
              <div className={styles.messageBubbleGroup}>
                {showHeader ? (
                  <div className={styles.messageHeader}>
                    <span className={styles.messageAuthor}>{displayName}</span>
                    <time className={styles.messageTimestamp} dateTime={message.sentAt}>
                      {messageTimestamp}
                    </time>
                  </div>
                ) : null}
                {showBody ? (
                  <div
                    className={`${styles.messageBubble} ${isSelf ? styles.messageBubbleSelf : ""}`.trim()}
                    title={messageTitle}
                  >
                    {message.body}
                  </div>
                ) : null}
                {hasAttachments ? (
                  <div className={styles.messageAttachments}>
                    {attachments.map((attachmentEntry, attachmentIndex) => {
                      const attachmentKey = `${messageKey}-attachment-${attachmentIndex}`;
                      const isImage =
                        typeof attachmentEntry.mimeType === "string" &&
                        attachmentEntry.mimeType.toLowerCase().startsWith("image/");
                      const href = attachmentEntry.url;
                      const imageSrc =
                        (typeof attachmentEntry.thumbnailUrl === "string" &&
                          attachmentEntry.thumbnailUrl.trim().length
                          ? attachmentEntry.thumbnailUrl.trim()
                          : null) || href;
                      const sizeLabel = formatAttachmentSize(attachmentEntry.size);
                      return (
                        <a
                          key={attachmentKey}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.messageAttachment}
                          aria-label={`Open attachment ${attachmentEntry.name}`}
                        >
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageSrc}
                              alt={attachmentEntry.name}
                              className={styles.messageAttachmentImage}
                              loading="lazy"
                            />
                          ) : (
                            <span className={styles.messageAttachmentIcon}>
                              <Paperclip size={16} weight="bold" />
                            </span>
                          )}
                          <span className={styles.messageAttachmentBody}>
                            <span className={styles.messageAttachmentName}>
                              {attachmentEntry.name}
                            </span>
                            <span className={styles.messageAttachmentMeta}>{sizeLabel}</span>
                          </span>
                        </a>
                      );
                    })}
                  </div>
                ) : null}
                {showReactions ? (
                  <div className={reactionClassName}>
                    {messageReactions.map((reaction, reactionIndex) => {
                      const maxNames = 3;
                      const shown = (Array.isArray(reaction.users) ? reaction.users : []).slice(0, maxNames);
                      const nameList = shown.map((u) => (u?.name || u?.id || "").trim() || "Member").join(", ");
                      const remainder = Math.max(0, reaction.count - shown.length);
                      const tooltip =
                        nameList.length > 0
                          ? `${reaction.emoji} by ${nameList}${remainder > 0 ? ` and ${remainder} more` : ""}`
                          : `${reaction.emoji} x${reaction.count}`;
                      return (
                      <button
                        key={`${messageKey}-reaction-${reactionIndex}`}
                        type="button"
                        className={`${styles.messageReaction} ${
                          reaction.selfReacted ? styles.messageReactionActive : ""
                        }`.trim()}
                        onClick={() => handleToggleReaction(message.id, reaction.emoji)}
                        disabled={!onToggleReaction}
                        aria-pressed={reaction.selfReacted}
                        aria-label={`${reaction.emoji} reaction from ${reaction.count} ${
                          reaction.count === 1 ? "person" : "people"
                        }`}
                        title={tooltip}
                      >
                        <span className={styles.messageReactionEmoji}>{reaction.emoji}</span>
                        <span className={styles.messageReactionCount}>{reaction.count}</span>
                      </button>
                    );
                    })}
                    {onToggleReaction ? (
                      <div className={styles.messageReactionAdd}>
                        <button
                          type="button"
                          className={styles.messageReactionAddButton}
                          onClick={(event) => handleReactionAddClick(message.id, event.currentTarget, displayName)}
                          onPointerDown={(event) => handleReactionAddPointerDown(message.id, displayName, event)}
                          onPointerUp={handleReactionAddPointerComplete}
                          onPointerLeave={handleReactionAddPointerComplete}
                          onPointerCancel={handleReactionAddPointerComplete}
                          onContextMenu={(event) => handleReactionAddContextMenu(message.id, displayName, event)}
                          aria-expanded={isPickerOpen}
                          aria-label="Add reaction"
                          data-role="reaction-button"
                        >
                          <Smiley size={14} weight="duotone" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {statusNode ? <div className={styles.messageMeta}>{statusNode}</div> : null}
              </div>
            </div>
          );
        })}
        {typingParticipants.length > 0 && typingText.length > 0 ? (
          <div className={styles.typingIndicatorRow}>
            {primaryTypingParticipant ? (
              <span className={styles.typingIndicatorAvatar} aria-hidden>
                {primaryTypingParticipant.avatar ? (
                  <Image
                    src={primaryTypingParticipant.avatar}
                    alt=""
                    width={36}
                    height={36}
                    className={styles.typingIndicatorAvatarImage}
                    sizes="36px"
                  />
                ) : (
                  <span className={styles.typingIndicatorInitials}>
                    {initialsFrom(typingDisplayName(primaryTypingParticipant))}
                  </span>
                )}
                {typingRemainderCount > 0 ? (
                  <span className={styles.typingIndicatorBadge}>+{typingRemainderCount}</span>
                ) : null}
              </span>
            ) : null}
            <div className={styles.typingIndicatorBubble} role="status" aria-live="polite">
              <span className={styles.typingIndicatorText}>{typingText}</span>
              <span className={styles.typingIndicatorDots} aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        ) : null}
      </div>
      {reactionTargetId && reactionAnchorRect ? (
        <ReactionPickerFloating
          anchorRect={reactionAnchorRect}
          anchorLabel={reactionAnchorLabel}
          onSelect={handleReactionSelect}
          onClose={closeReactionPicker}
        />
      ) : null}
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      <form
        className={styles.composer}
        onSubmit={handleSubmit}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
            onChange={handleDraftChange}
            onBlur={handleDraftBlur}
            onPaste={handlePaste}
            placeholder={session.type === "group" ? "Message the group" : "Type a message"}
            disabled={sending}
            aria-label="Message"
            rows={1}
          />
          {queuedAttachments.length > 0 ? (
            <div className={styles.composerAttachmentList}>
              {queuedAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className={styles.composerAttachment}
                  data-status="ready"
                >
                  <div className={styles.composerAttachmentInfo}>
                    <span className={styles.composerAttachmentName}>{attachment.name}</span>
                    <span className={styles.composerAttachmentMeta}>
                      {formatAttachmentSize(attachment.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.composerAttachmentRemove}
                    onClick={() => handleRemoveQueuedAttachment(attachment.id)}
                    aria-label="Remove attachment"
                  >
                    <Trash size={14} weight="duotone" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {uploadingAttachment ? (
            <div
              className={styles.composerAttachment}
              data-status={uploadingAttachment.status}
            >
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
                onClick={handleRemoveUploadingAttachment}
                aria-label="Remove attachment"
              >
                <Trash size={14} weight="duotone" />
              </button>
            </div>
          ) : null}
          {attachmentError ? (
            <div className={styles.composerAttachmentError} role="alert">
              {attachmentError}
            </div>
          ) : null}
          {isDraggingFile ? (
            <div className={styles.composerDropHint}>Drop file to attach</div>
          ) : null}
        </div>
        <div className={styles.composerActions}>
          <button
            type="button"
            className={styles.composerAttachButton}
            onClick={handleAttachmentButtonClick}
            aria-label="Attach file"
          >
            <Paperclip size={18} weight="bold" />
          </button>
          <button
            type="button"
            className={`${styles.composerGifButton} ${
              isGifPickerOpen ? styles.composerGifButtonActive : ""
            }`.trim()}
            onClick={handleGifButtonClick}
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
            <GifPicker onSelect={handleGifSelect} onClose={() => setGifPickerOpen(false)} />
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={handleFileInputChange}
        />
      </form>
    </div>
  );
}





