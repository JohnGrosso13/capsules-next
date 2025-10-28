"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { ArrowLeft, Trash, UserPlus, Smiley, NotePencil, Paperclip } from "@phosphor-icons/react/dist/ssr";

import type {
  ChatMessage,
  ChatParticipant,
  ChatSession,
} from "@/components/providers/ChatProvider";
import { useCurrentUser } from "@/services/auth/client";

import type { ChatMessageSendInput } from "@/components/providers/ChatProvider";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import type { EmojiPickerProps } from "./EmojiPicker";
import type { GifPickerSelection } from "./GifPicker";
import contextMenuStyles from "@/components/ui/context-menu.module.css";
import { chatCopy } from "./copy";
import { ChatComposer, type PendingAttachment, type ComposerStatus } from "./ChatComposer";
import { formatAttachmentSize } from "./utils";

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
          anchorLabel={anchorLabel ?? ""}
        />
      </div>
    </div>,
    node,
  );
}

type AttachmentUiState = {
  previewFailed: boolean;
  previewNonce: number;
  downloading: boolean;
  deleting: boolean;
  deleteError: string | null;
  downloadError: string | null;
};

type MessageAttachmentEntry = ChatMessage["attachments"][number];

type MessageContextMenuState = {
  messageId: string | null;
  messageIndex: number;
  messageKey: string;
  x: number;
  y: number;
  isSelf: boolean;
};

const MESSAGE_GROUP_WINDOW_MS = 5 * 60_000;
const DEFAULT_ATTACHMENT_UI_STATE: AttachmentUiState = {
  previewFailed: false,
  previewNonce: 0,
  downloading: false,
  deleting: false,
  deleteError: null,
  downloadError: null,
};
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
const CHAT_ACTION_TELEMETRY_ENDPOINT = "/api/telemetry/chat-action";

type ChatActionTelemetryPayload = {
  action: string;
  conversationId?: string;
  messageId?: string;
  attachmentId?: string;
  metadata?: Record<string, unknown>;
};

type ChatActionTelemetryInput = {
  action: string;
  conversationId?: string | null | undefined;
  messageId?: string | null | undefined;
  attachmentId?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
};

async function sendChatActionTelemetry(payload: ChatActionTelemetryInput): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const normalizedPayload: ChatActionTelemetryPayload = {
      action: payload.action,
      ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
      ...(payload.messageId ? { messageId: payload.messageId } : {}),
      ...(payload.attachmentId ? { attachmentId: payload.attachmentId } : {}),
      ...(payload.metadata && Object.keys(payload.metadata).length > 0
        ? { metadata: payload.metadata }
        : {}),
    };
    await fetch(CHAT_ACTION_TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(normalizedPayload),
    });
  } catch (error) {
    console.warn("chat.action.telemetry.request_failed", error);
  }
}

function buildMessageCopyText(message: ChatMessage): string {
  const segments: string[] = [];
  if (message.body?.trim()) {
    segments.push(message.body.trim());
  }
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.length) {
    attachments.forEach((attachment) => {
      if (!attachment) return;
      const sizeLabel = formatAttachmentSize(attachment.size);
      const parts = [attachment.name?.trim() || "Attachment"];
      if (sizeLabel) parts.push(`(${sizeLabel})`);
      if (attachment.url) parts.push(attachment.url);
      segments.push(parts.join(" "));
    });
  }
  return segments.join("\n\n");
}

function buildMessageKey(message: ChatMessage, index: number): string {
  const identifier =
    message.id && message.id.trim().length > 0
      ? `${message.id}-${index}`
      : `${message.authorId ?? "message"}-${message.sentAt}-${index}`;
  return identifier.replace(/\s+/g, "_");
}

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
  onRemoveAttachments?: (messageId: string, attachmentIds: string[]) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
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
  onRemoveAttachments,
  onDeleteMessage,
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
  const closeGifPicker = React.useCallback(() => {
    setGifPickerOpen(false);
  }, []);
  const [attachmentUiState, setAttachmentUiState] = React.useState<Record<string, AttachmentUiState>>({});
  const [contextMenu, setContextMenu] = React.useState<MessageContextMenuState | null>(null);
  const messagesRef = React.useRef<HTMLDivElement | null>(null);
  const messageInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const reactionLongPressTimerRef = React.useRef<number | null>(null);
  const reactionLongPressTriggeredRef = React.useRef(false);
  const contextMenuRef = React.useRef<HTMLDivElement | null>(null);
  const contextMenuFirstItemRef = React.useRef<HTMLButtonElement | null>(null);
  const scrollToLatestMessage = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (typeof window === "undefined") return;
      window.requestAnimationFrame(() => {
        const container = messagesRef.current;
        if (container) {
          const maxScrollTop = container.scrollHeight - container.clientHeight;
          if (maxScrollTop > 0) {
            container.scrollTo({ top: maxScrollTop, behavior });
            return;
          }
        }
        const input = messageInputRef.current;
        if (input) {
          input.scrollIntoView({ block: "end", behavior });
          return;
        }
        const scrollTarget =
          document.scrollingElement ?? document.documentElement ?? document.body;
        const maxWindowTop = scrollTarget.scrollHeight - window.innerHeight;
        const nextTop = maxWindowTop > 0 ? maxWindowTop : scrollTarget.scrollHeight;
        window.scrollTo({ top: nextTop, behavior });
      });
    },
    [],
  );

  const buildAttachmentStateKey = React.useCallback(
    (message: ChatMessage, attachment: MessageAttachmentEntry, index: number) => {
      const messageId =
        typeof message.id === "string" && message.id.trim().length > 0
          ? message.id.trim()
          : `local-${message.sentAt}-${index}`;
      const attachmentId =
        typeof attachment.id === "string" && attachment.id.trim().length > 0
          ? attachment.id.trim()
          : `attachment-${index}`;
      return `${messageId}:${attachmentId}`;
    },
    [],
  );

  const updateAttachmentUiState = React.useCallback(
    (key: string, updater: (state: AttachmentUiState) => AttachmentUiState | null) => {
      setAttachmentUiState((previous) => {
        const current = previous[key] ?? DEFAULT_ATTACHMENT_UI_STATE;
        const next = updater(current);
        if (!next) {
          if (!(key in previous)) return previous;
          const { [key]: _removed, ...rest } = previous;
          return rest;
        }
        if (
          current.previewFailed === next.previewFailed &&
          current.previewNonce === next.previewNonce &&
          current.downloading === next.downloading &&
          current.deleting === next.deleting &&
          current.deleteError === next.deleteError &&
          current.downloadError === next.downloadError
        ) {
          return previous;
        }
        return { ...previous, [key]: next };
      });
    },
    [],
  );
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
  const [pendingFileCount, setPendingFileCount] = React.useState(0);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const adjustTextareaHeight = React.useCallback(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 220;
    const nextHeight = Math.min(maxHeight, Math.max(56, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }, []);

  React.useEffect(() => {
    const activeKeys = new Set<string>();
    session.messages.forEach((message) => {
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      attachments.forEach((attachment, index) => {
        activeKeys.add(buildAttachmentStateKey(message, attachment, index));
      });
    });
    setAttachmentUiState((previous) => {
      const keys = Object.keys(previous);
      if (!keys.length) return previous;
      let mutated = false;
      const next: Record<string, AttachmentUiState> = {};
      keys.forEach((key) => {
        if (activeKeys.has(key)) {
          next[key] = previous[key]!;
        } else {
          mutated = true;
        }
      });
      return mutated ? next : previous;
    });
  }, [buildAttachmentStateKey, session.messages]);

  const handleAttachmentPreviewError = React.useCallback(
    (key: string) => {
      updateAttachmentUiState(key, (state) => ({
        ...state,
        previewFailed: true,
      }));
    },
    [updateAttachmentUiState],
  );

  const handleAttachmentPreviewLoad = React.useCallback(
    (key: string) => {
      updateAttachmentUiState(key, (state) => {
        if (!state.previewFailed && state.previewNonce === 0) return state;
        return {
          ...state,
          previewFailed: false,
        };
      });
    },
    [updateAttachmentUiState],
  );

  const handleAttachmentPreviewRetry = React.useCallback(
    (key: string) => {
      updateAttachmentUiState(key, (state) => ({
        ...state,
        previewFailed: false,
        previewNonce: state.previewNonce + 1,
      }));
    },
    [updateAttachmentUiState],
  );

  const handleAttachmentOpen = React.useCallback(
    (message: ChatMessage, attachment: MessageAttachmentEntry) => {
      if (!attachment.url) return;
      const messageId =
        typeof message.id === "string" && message.id.trim().length > 0
          ? message.id.trim()
          : undefined;
      const attachmentId =
        typeof attachment.id === "string" && attachment.id.trim().length > 0
          ? attachment.id.trim()
          : undefined;
      void sendChatActionTelemetry({
        action: "attachment_open",
        conversationId: session.id,
        messageId,
        attachmentId,
        metadata: {
          mimeType: attachment.mimeType,
          size: attachment.size,
        },
      });
      if (typeof window !== "undefined") {
        window.open(attachment.url, "_blank", "noopener");
      }
    },
    [session.id],
  );

  const handleAttachmentDownload = React.useCallback(
    (message: ChatMessage, attachment: MessageAttachmentEntry, key: string) => {
      if (!attachment.url) return;
      const messageId =
        typeof message.id === "string" && message.id.trim().length > 0
          ? message.id.trim()
          : undefined;
      const attachmentId =
        typeof attachment.id === "string" && attachment.id.trim().length > 0
          ? attachment.id.trim()
          : undefined;
      updateAttachmentUiState(key, (state) => ({
        ...state,
        downloading: true,
        downloadError: null,
      }));
      void sendChatActionTelemetry({
        action: "attachment_download",
        conversationId: session.id,
        messageId,
        attachmentId,
        metadata: {
          mimeType: attachment.mimeType,
          size: attachment.size,
        },
      });
      if (typeof document === "undefined" || typeof window === "undefined") {
        updateAttachmentUiState(key, (state) => ({
          ...state,
          downloading: false,
        }));
        return;
      }
      try {
        const anchor = document.createElement("a");
        anchor.href = attachment.url;
        anchor.target = "_blank";
        anchor.rel = "noopener";
        if (attachment.name && attachment.name.trim().length > 0) {
          anchor.download = attachment.name;
        }
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.setTimeout(() => {
          updateAttachmentUiState(key, (state) => ({
            ...state,
            downloading: false,
          }));
        }, 600);
      } catch (error) {
        let handled = false;
        if (typeof window !== "undefined") {
          const popup = window.open(attachment.url, "_blank", "noopener");
          if (popup) {
            handled = true;
            window.setTimeout(() => {
              updateAttachmentUiState(key, (state) => ({
                ...state,
                downloading: false,
              }));
            }, 600);
          }
        }
        if (!handled) {
          console.error("chat attachment download failed", error);
          updateAttachmentUiState(key, (state) => ({
            ...state,
            downloading: false,
            downloadError: chatCopy.errors.attachmentDownloadFailed,
          }));
          void sendChatActionTelemetry({
            action: "attachment_download_failure",
            conversationId: session.id,
            messageId,
            attachmentId,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    },
    [session.id, updateAttachmentUiState],
  );

  const handleAttachmentDelete = React.useCallback(
    async (message: ChatMessage, attachment: MessageAttachmentEntry, key: string) => {
      if (!onRemoveAttachments) return;
      const messageId =
        typeof message.id === "string" && message.id.trim().length > 0
          ? message.id.trim()
          : null;
      const attachmentId =
        typeof attachment.id === "string" && attachment.id.trim().length > 0
          ? attachment.id.trim()
          : null;
      if (!messageId || !attachmentId) {
        updateAttachmentUiState(key, (state) => ({
          ...state,
          deleting: false,
          deleteError: chatCopy.errors.attachmentDeleteFailed,
        }));
        return;
      }
      updateAttachmentUiState(key, (state) => ({
        ...state,
        deleting: true,
        deleteError: null,
      }));
      void sendChatActionTelemetry({
        action: "attachment_delete_request",
        conversationId: session.id,
        messageId,
        attachmentId,
      });
      try {
        await onRemoveAttachments(messageId, [attachmentId]);
        updateAttachmentUiState(key, (state) => ({
          ...state,
          deleting: false,
          deleteError: null,
        }));
        void sendChatActionTelemetry({
          action: "attachment_delete_success",
          conversationId: session.id,
          messageId,
          attachmentId,
        });
      } catch (error) {
        console.error("chat attachment delete failed", error);
        updateAttachmentUiState(key, (state) => ({
          ...state,
          deleting: false,
          deleteError: chatCopy.errors.attachmentDeleteFailed,
        }));
        void sendChatActionTelemetry({
          action: "attachment_delete_failure",
          conversationId: session.id,
          messageId,
          attachmentId,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
    [onRemoveAttachments, session.id, updateAttachmentUiState],
  );

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null);
  }, []);

  const contextMenuMessage = React.useMemo<ChatMessage | null>(() => {
    if (!contextMenu) return null;
    const byId =
      contextMenu.messageId === null
        ? null
        : session.messages.find(
            (msg) => typeof msg.id === "string" && msg.id.trim() === contextMenu.messageId,
          ) ?? null;
    if (byId) return byId;
    if (
      contextMenu.messageIndex >= 0 &&
      contextMenu.messageIndex < session.messages.length
    ) {
      const candidate = session.messages[contextMenu.messageIndex] ?? null;
      if (
        candidate &&
        (!contextMenu.messageKey ||
          buildMessageKey(candidate, contextMenu.messageIndex) === contextMenu.messageKey)
      ) {
        return candidate;
      }
    }
    if (!contextMenu.messageKey) return null;
    const byKey =
      session.messages.find((msg, msgIndex) => buildMessageKey(msg, msgIndex) === contextMenu.messageKey) ?? null;
    return byKey;
  }, [contextMenu, session.messages]);

  React.useEffect(() => {
    if (contextMenu && !contextMenuMessage) {
      closeContextMenu();
    }
  }, [closeContextMenu, contextMenu, contextMenuMessage]);

  React.useEffect(() => {
    if (!contextMenu) return;
    if (typeof window === "undefined") return;
    const pointerOptions: AddEventListenerOptions = { capture: true };
    const handlePointerDown = (event: MouseEvent) => {
      const menuEl = contextMenuRef.current;
      if (menuEl && menuEl.contains(event.target as Node)) return;
      closeContextMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeContextMenu();
      }
    };
    const handleScroll = () => {
      closeContextMenu();
    };
    const scrollOptions: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", handlePointerDown, pointerOptions);
    window.addEventListener("keydown", handleKeyDown, pointerOptions);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    const container = messagesRef.current;
    container?.addEventListener("scroll", handleScroll, scrollOptions);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, pointerOptions);
      window.removeEventListener("keydown", handleKeyDown, pointerOptions);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
      container?.removeEventListener("scroll", handleScroll, scrollOptions);
    };
  }, [closeContextMenu, contextMenu]);

  React.useEffect(() => {
    if (!contextMenu) {
      contextMenuFirstItemRef.current = null;
      return;
    }
    requestAnimationFrame(() => {
      contextMenuFirstItemRef.current?.focus();
    });
  }, [contextMenu]);

  const copyMessage = React.useCallback(
    async (message: ChatMessage): Promise<boolean> => {
      const text = buildMessageCopyText(message).trim();
      if (!text) return false;
      let success = false;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          success = true;
        } catch (clipboardError) {
          console.warn("chat message copy via clipboard API failed", clipboardError);
        }
      }
      if (!success && typeof document !== "undefined") {
        let textarea: HTMLTextAreaElement | null = null;
        try {
          textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.setAttribute("readonly", "true");
          textarea.style.position = "fixed";
          textarea.style.top = "-1000px";
          textarea.style.left = "-1000px";
          textarea.style.opacity = "0";
          textarea.style.pointerEvents = "none";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          textarea.setSelectionRange(0, textarea.value.length);
          success = document.execCommand("copy");
        } catch (fallbackError) {
          console.error("chat message copy fallback failed", fallbackError);
        } finally {
          if (textarea && textarea.parentNode) {
            textarea.parentNode.removeChild(textarea);
          }
        }
      }
      void sendChatActionTelemetry({
        action: success ? "message_copy" : "message_copy_failure",
        conversationId: session.id,
        messageId: typeof message.id === "string" ? message.id : undefined,
        metadata: success
          ? { length: text.length }
          : {
              length: text.length,
            },
      });
      return success;
    },
    [session.id],
  );

  const handleMessageCopy = React.useCallback(
    async (message: ChatMessage, options?: { fromMenu?: boolean }) => {
      if (options?.fromMenu) {
        closeContextMenu();
      }
      const success = await copyMessage(message);
      if (!success) {
        setError(chatCopy.errors.messageCopyFailed);
      }
    },
    [closeContextMenu, copyMessage],
  );

  const handleMessageForward = React.useCallback(
    (message: ChatMessage) => {
      closeContextMenu();
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      const attachmentLines = attachments
        .map((attachment) => {
          if (!attachment) return null;
          const name = attachment.name?.trim() || "Attachment";
          const parts = [`- ${name}`];
          if (attachment.url) {
            parts.push(attachment.url);
          }
          return parts.join(" ");
        })
        .filter((line): line is string => Boolean(line));
      const segments = [chatCopy.messageMenu.forwardedPrefix];
      if (message.body?.trim()) {
        segments.push(message.body.trim());
      }
      if (attachmentLines.length) {
        segments.push(...attachmentLines);
      }
      const forwardedBlock = segments.join("\n");
      setDraft((previous) => {
        const trimmed = previous.replace(/\s+$/, "");
        const spacer = trimmed.length > 0 ? "\n\n" : "";
        return `${trimmed}${spacer}${forwardedBlock}\n`;
      });
      requestAnimationFrame(() => {
        adjustTextareaHeight();
        messageInputRef.current?.focus();
      });
      onTypingChange?.(session.id, true);
      void sendChatActionTelemetry({
        action: "message_forward",
        conversationId: session.id,
        messageId: typeof message.id === "string" ? message.id : undefined,
      });
    },
    [adjustTextareaHeight, closeContextMenu, onTypingChange, session.id, setDraft],
  );

  const handleMessageDelete = React.useCallback(
    async (message: ChatMessage) => {
      closeContextMenu();
      if (!onDeleteMessage) return;
      const messageId = typeof message.id === "string" ? message.id.trim() : "";
      if (!messageId) {
        setError(chatCopy.errors.messageDeleteFailed);
        return;
      }
      void sendChatActionTelemetry({
        action: "message_delete_request",
        conversationId: session.id,
        messageId,
      });
      try {
        await onDeleteMessage(messageId);
        void sendChatActionTelemetry({
          action: "message_delete_success",
          conversationId: session.id,
          messageId,
        });
      } catch (deleteError) {
        console.error("chat message delete failed", deleteError);
        setError(chatCopy.errors.messageDeleteFailed);
        void sendChatActionTelemetry({
          action: "message_delete_failure",
          conversationId: session.id,
          messageId,
          metadata: {
            error: deleteError instanceof Error ? deleteError.message : String(deleteError),
          },
        });
      }
    },
    [closeContextMenu, onDeleteMessage, session.id],
  );

  const openMessageContextMenu = React.useCallback(
    (
      clientX: number,
      clientY: number,
      message: ChatMessage,
      messageKey: string,
      messageIndex: number,
      isSelf: boolean,
    ) => {
      if (typeof window === "undefined") return;
      const menuWidth = 240;
      const menuHeight = 164;
      const clamp = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(max, value));
      const x = clamp(clientX, 12, window.innerWidth - menuWidth - 12);
      const y = clamp(clientY, 12, window.innerHeight - menuHeight - 12);
      const messageId =
        typeof message.id === "string" && message.id.trim().length > 0
          ? message.id.trim()
          : null;
      setContextMenu({
        messageId,
        messageIndex,
        messageKey,
        x,
        y,
        isSelf,
      });
    },
    [],
  );

  const handleMessageContextMenu = React.useCallback(
    (
      event: React.MouseEvent<HTMLDivElement>,
      message: ChatMessage,
      messageKey: string,
      messageIndex: number,
      isSelf: boolean,
    ) => {
      const anchor = event.target as HTMLElement | null;
      if (anchor && anchor.closest("a")) {
        return;
      }
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      if (selection && selection.toString().trim().length > 0) {
        return;
      }
      event.preventDefault();
      openMessageContextMenu(event.clientX, event.clientY, message, messageKey, messageIndex, isSelf);
    },
    [openMessageContextMenu],
  );

  const handleMessageKeyDown = React.useCallback(
    (
      event: React.KeyboardEvent<HTMLDivElement>,
      message: ChatMessage,
      messageKey: string,
      messageIndex: number,
      isSelf: boolean,
    ) => {
      if (event.key === "ContextMenu" || (event.shiftKey && (event.key === "F10" || event.key === "f10"))) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        openMessageContextMenu(centerX, centerY, message, messageKey, messageIndex, isSelf);
        return;
      }
      const isCopy =
        (event.key === "c" || event.key === "C") && (event.metaKey || event.ctrlKey);
      if (isCopy) {
        const selection = typeof window !== "undefined" ? window.getSelection() : null;
        if (!selection || selection.toString().trim().length === 0) {
          event.preventDefault();
          void handleMessageCopy(message);
        }
      }
    },
    [handleMessageCopy, openMessageContextMenu],
  );

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
    setPendingFileCount(pendingFilesRef.current.length);
    if (!next) return;
    try {
      await handleAttachmentFile(next);
    } catch (uploadError) {
      console.error("attachment upload failed", uploadError);
    }
  }, [attachment, attachmentUploading, handleAttachmentFile, setPendingFileCount]);

  const enqueueFiles = React.useCallback(
    (files: File[]) => {
      if (!files.length) return;
      pendingFilesRef.current.push(...files);
      setPendingFileCount(pendingFilesRef.current.length);
      void processNextQueuedFile();
    },
    [processNextQueuedFile, setPendingFileCount],
  );

  React.useEffect(() => {
    return () => {
      pendingFilesRef.current = [];
      setPendingFileCount(0);
    };
  }, [setPendingFileCount]);

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

  const uploadingAttachment =
    attachment && attachment.status !== "ready" ? attachment : null;
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
          variant: "uploading" as const,
          text: chatCopy.composer.finishing(uploadingAttachment.name),
        };
      }
      const percent = Math.max(0, Math.min(100, Math.round(attachmentProgress * 100)));
      return {
        variant: "uploading" as const,
        text: chatCopy.composer.uploading(uploadingAttachment.name, percent),
      };
    }
    if (hasQueuedAttachments) {
      return {
        variant: "ready" as const,
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
    sending ||
    isAttachmentBusy ||
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
    closeContextMenu();
  }, [closeContextMenu, session.id]);

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
      closeContextMenu();
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
    [closeContextMenu, closeReactionPicker, reactionTargetId],
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
    scrollToLatestMessage("auto");
  }, [scrollToLatestMessage, session.messages.length]);

  React.useEffect(() => {
    scrollToLatestMessage("auto");
  }, [scrollToLatestMessage, session.id]);

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
          attachmentUploading ||
          pendingFileCount > 0 ||
          Boolean(uploadingAttachment);
        onTypingChange(session.id, hasContent);
      }
    },
    [
      adjustTextareaHeight,
      attachmentUploading,
      hasQueuedAttachments,
      onTypingChange,
      pendingFileCount,
      session.id,
      uploadingAttachment,
    ],
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
      onTypingChange?.(session.id, false);
    };
  }, [onTypingChange, session.id]);

  React.useEffect(() => {
    if (!onTypingChange) return;
    const hasText = draft.replace(/\s+/g, "").length > 0;
    if (hasText) return;
    onTypingChange(
      session.id,
      (hasQueuedAttachments || attachmentUploading || pendingFileCount > 0 || Boolean(uploadingAttachment)) &&
        !attachmentError,
    );
  }, [
    attachmentError,
    attachmentUploading,
    draft,
    hasQueuedAttachments,
    onTypingChange,
    pendingFileCount,
    session.id,
    uploadingAttachment,
  ]);

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

  const contextMenuNode =
    contextMenu && contextMenuMessage && typeof document !== "undefined"
      ? createPortal(
          <div
            className={contextMenuStyles.backdrop}
            role="presentation"
            onClick={closeContextMenu}
            data-role="message-context-menu-backdrop"
          >
            <div
              ref={contextMenuRef}
              className={contextMenuStyles.menu}
              style={{ top: contextMenu.y, left: contextMenu.x }}
              role="menu"
              aria-label="Message actions"
              onClick={(event) => event.stopPropagation()}
            >
              {(() => {
                const canCopy =
                  buildMessageCopyText(contextMenuMessage).trim().length > 0;
                const canForward =
                  Boolean(contextMenuMessage.body?.trim()) ||
                  (Array.isArray(contextMenuMessage.attachments) &&
                    contextMenuMessage.attachments.length > 0);
                const canDelete = contextMenu.isSelf && Boolean(onDeleteMessage);
                return (
                  <>
                    <button
                      ref={canCopy ? contextMenuFirstItemRef : undefined}
                      type="button"
                      className={contextMenuStyles.item}
                      role="menuitem"
                      onClick={() => {
                        if (!canCopy) return;
                        void handleMessageCopy(contextMenuMessage, { fromMenu: true });
                      }}
                      disabled={!canCopy}
                      aria-disabled={!canCopy}
                    >
                      {chatCopy.messageMenu.copy}
                    </button>
                    <button
                      ref={!canCopy && canForward ? contextMenuFirstItemRef : undefined}
                      type="button"
                      className={contextMenuStyles.item}
                      role="menuitem"
                      onClick={() => {
                        if (!canForward) return;
                        handleMessageForward(contextMenuMessage);
                      }}
                      disabled={!canForward}
                      aria-disabled={!canForward}
                    >
                      {chatCopy.messageMenu.forward}
                    </button>
                    <div className={contextMenuStyles.separator} role="separator" />
                    <button
                      ref={
                        !canCopy && !canForward && canDelete ? contextMenuFirstItemRef : undefined
                      }
                      type="button"
                      className={`${contextMenuStyles.item} ${contextMenuStyles.danger}`.trim()}
                      role="menuitem"
                      onClick={() => {
                        if (!canDelete) return;
                        void handleMessageDelete(contextMenuMessage);
                      }}
                      disabled={!canDelete}
                      aria-disabled={!canDelete}
                    >
                      {chatCopy.messageMenu.delete}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>,
          document.body,
        )
      : null;

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
          const messageKey = buildMessageKey(message, index);
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
              <div
                className={styles.messageBubbleGroup}
                tabIndex={0}
                data-message-id={
                  message.id && message.id.trim().length > 0 ? message.id.trim() : messageKey
                }
                data-menu-open={contextMenu?.messageKey === messageKey ? "true" : undefined}
                onContextMenu={(event) =>
                  handleMessageContextMenu(event, message, messageKey, index, isSelf)
                }
                onKeyDown={(event) =>
                  handleMessageKeyDown(event, message, messageKey, index, isSelf)
                }
              >
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
                  <div className={styles.messageAttachments} role="list">
                    {attachments.map((attachmentEntry, attachmentIndex) => {
                      const attachmentKey = `${messageKey}-attachment-${attachmentIndex}`;
                      const isImage =
                        typeof attachmentEntry.mimeType === "string" &&
                        attachmentEntry.mimeType.toLowerCase().startsWith("image/");
                      const href = attachmentEntry.url;
                      const basePreviewSrc =
                        (typeof attachmentEntry.thumbnailUrl === "string" &&
                          attachmentEntry.thumbnailUrl.trim().length
                          ? attachmentEntry.thumbnailUrl.trim()
                          : null) || href;
                      const stateKey = buildAttachmentStateKey(message, attachmentEntry, attachmentIndex);
                      const uiState = attachmentUiState[stateKey] ?? DEFAULT_ATTACHMENT_UI_STATE;
                      const previewSrc =
                        basePreviewSrc && uiState.previewNonce > 0
                          ? `${basePreviewSrc}${basePreviewSrc.includes("?") ? "&" : "?"}retry=${uiState.previewNonce}`
                          : basePreviewSrc;
                      const sizeLabel = formatAttachmentSize(attachmentEntry.size);
                      const downloadDisabled = uiState.downloading || uiState.deleting || !href;
                      const deleteDisabled = uiState.deleting;
                      const showDelete =
                        Boolean(onRemoveAttachments) &&
                        isSelf &&
                        message.status !== "pending" &&
                        typeof attachmentEntry.id === "string" &&
                        attachmentEntry.id.trim().length > 0;
                      const downloadLabel = uiState.downloading
                        ? chatCopy.attachments.downloading
                        : uiState.downloadError
                          ? chatCopy.attachments.retry
                          : chatCopy.attachments.download;
                      const deleteLabel = uiState.deleting
                        ? chatCopy.attachments.deleting
                        : uiState.deleteError
                          ? chatCopy.attachments.retry
                          : chatCopy.attachments.delete;
                      return (
                        <div
                          key={attachmentKey}
                          className={styles.messageAttachment}
                          role="listitem"
                          data-preview-failed={uiState.previewFailed ? "true" : undefined}
                          data-downloading={uiState.downloading ? "true" : undefined}
                          data-deleting={uiState.deleting ? "true" : undefined}
                        >
                          <div className={styles.messageAttachmentPreview}>
                            <button
                              type="button"
                              className={styles.messageAttachmentPreviewButton}
                              onClick={() => handleAttachmentOpen(message, attachmentEntry)}
                              disabled={!href}
                              aria-label={`Open attachment ${attachmentEntry.name}`}
                            >
                              {isImage && previewSrc && !uiState.previewFailed ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={previewSrc}
                                  alt={attachmentEntry.name}
                                  className={styles.messageAttachmentPreviewImage}
                                  loading="lazy"
                                  onLoad={() => handleAttachmentPreviewLoad(stateKey)}
                                  onError={() => handleAttachmentPreviewError(stateKey)}
                                />
                              ) : (
                                <span className={styles.messageAttachmentIcon} aria-hidden>
                                  <Paperclip size={16} weight="bold" />
                                </span>
                              )}
                            </button>
                            {isImage && uiState.previewFailed ? (
                              <div className={styles.messageAttachmentPreviewFallback}>
                                <span>{chatCopy.attachments.previewFailed}</span>
                                <button
                                  type="button"
                                  className={styles.messageAttachmentRetry}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleAttachmentPreviewRetry(stateKey);
                                  }}
                                >
                                  {chatCopy.attachments.retry}
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className={styles.messageAttachmentBody}>
                            <div className={styles.messageAttachmentTitleRow}>
                              <span className={styles.messageAttachmentName}>
                                {attachmentEntry.name}
                              </span>
                              <span className={styles.messageAttachmentMeta}>{sizeLabel}</span>
                            </div>
                            {uiState.downloadError ? (
                              <div className={styles.messageAttachmentError} role="alert">
                                {uiState.downloadError}
                              </div>
                            ) : null}
                            {uiState.deleteError ? (
                              <div className={styles.messageAttachmentError} role="alert">
                                {uiState.deleteError}
                              </div>
                            ) : null}
                            <div className={styles.messageAttachmentActions}>
                              <button
                                type="button"
                                className={styles.messageAttachmentAction}
                                onClick={() => handleAttachmentDownload(message, attachmentEntry, stateKey)}
                                disabled={downloadDisabled}
                              >
                                {downloadLabel}
                              </button>
                              {showDelete ? (
                                <button
                                  type="button"
                                  className={`${styles.messageAttachmentAction} ${styles.messageAttachmentDanger}`.trim()}
                                  onClick={() => handleAttachmentDelete(message, attachmentEntry, stateKey)}
                                  disabled={deleteDisabled}
                                >
                                  {deleteLabel}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
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
      <ChatComposer
        error={error}
        draft={draft}
        sending={sending}
        disableSend={disableSend}
        hasAttachmentBlock={hasAttachmentBlock}
        queuedAttachments={queuedAttachments}
        uploadingAttachment={uploadingAttachment}
        attachmentProgress={attachmentProgress}
        composerStatus={composerStatus}
        attachmentError={attachmentError}
        isDraggingFile={isDraggingFile}
        isGifPickerOpen={isGifPickerOpen}
        sessionType={session.type}
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
        onGifClose={closeGifPicker}
        onFileInputChange={handleFileInputChange}
      />
      {contextMenuNode}
    </div>
  );
}





