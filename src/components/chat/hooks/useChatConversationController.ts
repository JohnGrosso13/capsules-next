"use client";

import * as React from "react";

import type { ChatParticipant } from "@/components/providers/ChatProvider";
import { useCurrentUser } from "@/services/auth/client";
import { useFriendsDataContext } from "@/components/providers/FriendsDataProvider";

import type { GifPickerSelection } from "../GifPicker";
import { chatCopy } from "../copy";
import { formatAttachmentSize } from "../utils";
import { useConversationMetadata } from "./useConversationMetadata";
import { describeTypingParticipants, typingDisplayName, buildMessageCopyText } from "../conversation/utils";
import type { ChatConversationProps, ReactionPickerViewModel, ConversationParticipantsViewModel } from "../conversation/types";
import type { ConversationHeaderProps } from "../conversation/ConversationHeader";
import type { ConversationMessageListProps } from "../conversation/ConversationMessageList";
import type { MessageContextMenuProps } from "../conversation/MessageContextMenu";
import type { ChatComposerProps, ComposerStatus } from "../ChatComposer";
import { useReactionPicker } from "./useReactionPicker";
import { useChatAttachments } from "./useChatAttachments";
import { useChatContextMenu } from "./useChatContextMenu";
import { isAssistantUserId } from "@/shared/assistant/constants";

export type ChatConversationControllerResult = {
  isAssistantConversation: boolean;
  headerProps: ConversationHeaderProps;
  participants: ConversationParticipantsViewModel;
  messageListProps: ConversationMessageListProps;
  reactionPicker: ReactionPickerViewModel | null;
  composerProps: ChatComposerProps;
  contextMenuProps: MessageContextMenuProps;
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

const GIF_SIZE_LIMIT_BYTES = 7 * 1024 * 1024;
const GIF_TELEMETRY_ENDPOINT = "/api/telemetry/chat-gif";

type GifTelemetryPayload = {
  action: "select" | "oversize_rejected";
  provider: string;
  gifId: string;
  size: number | null;
};


export function useChatConversationController({
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
}: ChatConversationProps): ChatConversationControllerResult {
  const isAssistantConversation = React.useMemo(
    () => session.participants.some((participant) => isAssistantUserId(participant.id)),
  [session.participants],
);
  const { user } = useCurrentUser();
  const { friends } = useFriendsDataContext();
  const friendLookup = React.useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null }>();
    friends.forEach((friend) => {
      if (!friend) return;
      const primaryName =
        friend.name?.trim() ||
        (typeof friend.userId === "string" ? friend.userId : null) ||
        (typeof friend.key === "string" ? friend.key : null) ||
        (typeof friend.id === "string" || typeof friend.id === "number"
          ? String(friend.id)
          : null) ||
        "";
      const profile = {
        name: primaryName || "Unknown user",
        avatar: friend.avatar ?? null,
      };
      const identifiers: string[] = [];
      if (typeof friend.userId === "string") identifiers.push(friend.userId);
      if (typeof friend.key === "string") identifiers.push(friend.key);
      if (typeof friend.id === "string" || typeof friend.id === "number") {
        identifiers.push(String(friend.id));
      }
      identifiers.forEach((identifier) => {
        const trimmed = identifier.trim();
        if (!trimmed || map.has(trimmed)) return;
        map.set(trimmed, profile);
      });
    });
    return map;
  }, [friends]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isGifPickerOpen, setGifPickerOpen] = React.useState(false);
  const closeGifPicker = React.useCallback(() => {
    setGifPickerOpen(false);
  }, []);
  const messagesRef = React.useRef<HTMLDivElement | null>(null);
  const messageInputRef = React.useRef<HTMLTextAreaElement | null>(null);
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

  const {
    attachmentUiState,
    queuedAttachments,
    uploadingAttachment,
    attachmentProgress,
    attachmentError,
    hasAttachmentBlock,
    pendingFileCount,
    isDraggingFile,
    fileInputRef,
    attachment,
    attachRemoteAttachment,
    handleAttachmentButtonClick: attachmentButtonClick,
    handleFileInputChange,
    handleAttachmentOpen,
    handleAttachmentDownload,
    handleAttachmentDelete,
    handleAttachmentPreviewLoad,
    handleAttachmentPreviewError,
    handleAttachmentPreviewRetry,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRemoveQueuedAttachment,
    clearQueuedAttachments,
    queueFiles,
  } = useChatAttachments({
    sessionId: session.id,
    messages: session.messages,
    ...(onRemoveAttachments ? { onRemoveAttachments } : {}),
    onSend: async (payload) => {
      await onSend({
        body: payload.body,
        attachments: payload.attachments,
      });
    },
    onSendError: (message) => {
      setError(message);
    },
    sendTelemetry: ({ action, conversationId, messageId, attachmentId, mimeType, size }) => {
      void sendChatActionTelemetry({
        action: action === "open" ? "attachment_open" : "attachment_download",
        conversationId,
        messageId,
        attachmentId,
        metadata: {
          mimeType: mimeType ?? undefined,
          size: size ?? undefined,
        },
      });
    },
  });

  const {
    contextMenu,
    contextMenuMessage,
    contextMenuRef,
    contextMenuFirstItemRef,
    closeContextMenu,
    handleMessageCopy,
    handleMessageForward,
    handleMessageDelete,
    handleMessageContextMenu,
    handleMessageKeyDown,
  } = useChatContextMenu({
    session,
    messagesRef,
    messageInputRef,
    ...(onDeleteMessage ? { onDeleteMessage } : {}),
    ...(onTypingChange ? { onTypingChange } : {}),
    setDraft,
    setError,
    sendChatActionTelemetry: (payload) => {
      void sendChatActionTelemetry(payload);
    },
  });
  const adjustTextareaHeight = React.useCallback(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 220;
    const nextHeight = Math.min(maxHeight, Math.max(56, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }, []);

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

  const uploadingAttachmentDetail = attachment && attachment.status !== "ready" ? attachment : null;
  const hasQueuedAttachments = queuedAttachments.length > 0;
  const isAttachmentBusy = Boolean(
    uploadingAttachmentDetail || uploadingAttachment || pendingFileCount > 0,
  );
  const composerStatus: ComposerStatus | null = React.useMemo(() => {
    if (attachmentError) return null;
    if (uploadingAttachmentDetail) {
      if (uploadingAttachmentDetail.phase === "finalizing") {
        return {
          variant: "uploading" as const,
          text: chatCopy.composer.finishing(uploadingAttachmentDetail.name),
        };
      }
      const percent = Math.max(0, Math.min(100, Math.round(attachmentProgress)));
      return {
        variant: "uploading" as const,
        text: chatCopy.composer.uploading(uploadingAttachmentDetail.name, percent),
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
    uploadingAttachmentDetail,
  ]);
  const trimmedDraft = React.useMemo(() => draft.replace(/\s+/g, " ").trim(), [draft]);
  const hasTypedContent = trimmedDraft.length > 0;
  const disableSend =
    sending ||
    isAttachmentBusy ||
    (!hasTypedContent && !hasQueuedAttachments) ||
    Boolean(attachmentError);

  const {
    selfIdentifiers,
    participantMap,
    remoteParticipants,
    selfName,
    selfAvatar,
    presence,
    title,
  } = useConversationMetadata({
    session,
    currentUserId,
    selfClientId,
    user,
    friendLookup,
  });

  const { reactionState, reactionPicker } = useReactionPicker({
    sessionId: session.id,
    messagesRef,
    closeContextMenu,
    ...(onToggleReaction ? { onToggleReaction } : {}),
  });

  React.useEffect(() => {
    closeContextMenu();
  }, [closeContextMenu, session.id]);

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
  const headerPresence = React.useMemo(() => {
    if (typingParticipants.length === 1) {
      return `${typingDisplayName(typingParticipants[0] as ChatParticipant)} is typing...`;
    }
    if (typingParticipants.length > 1) {
      return "Multiple people typing...";
    }
    return presence;
  }, [presence, typingParticipants]);

  React.useEffect(() => {
    scrollToLatestMessage("auto");
  }, [scrollToLatestMessage, session.messages.length]);

  React.useEffect(() => {
    scrollToLatestMessage("auto");
  }, [scrollToLatestMessage, session.id]);

  const handleDraftChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft(value);
      requestAnimationFrame(() => adjustTextareaHeight());
      if (onTypingChange) {
        const hasContent =
          value.replace(/\s+/g, "").length > 0 ||
          hasQueuedAttachments ||
          isAttachmentBusy;
        onTypingChange(session.id, hasContent);
      }
    },
    [
      adjustTextareaHeight,
      hasQueuedAttachments,
      isAttachmentBusy,
      onTypingChange,
      session.id,
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
      queueFiles(files);
    },
    [queueFiles],
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
      (hasQueuedAttachments || isAttachmentBusy) && !attachmentError,
    );
  }, [
    attachmentError,
    draft,
    hasQueuedAttachments,
    isAttachmentBusy,
    onTypingChange,
    session.id,
  ]);

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

  const handleRemoveUploadingAttachment = React.useCallback(() => {
    clearQueuedAttachments();
  }, [clearQueuedAttachments]);

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
    if (isAttachmentBusy || attachmentError) return;
    setSending(true);
    setError(null);
    try {
      await onSend({ body: trimmed, attachments: attachmentsForSend });
      setDraft("");
      clearQueuedAttachments();
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

  const headerProps: ConversationHeaderProps = {
    session,
    title,
    presence: headerPresence,
    remoteParticipants,
    onBack,
    onRenameGroup,
    onInviteParticipants,
    onDelete,
  };

  const participantsViewModel: ConversationParticipantsViewModel = {
    participants: session.participants,
    onInviteParticipants,
  };

  const messageListProps: ConversationMessageListProps = {
    session,
    isAssistantConversation,
    messagesRef,
    contextMenu,
    identity: {
      selfIdentifiers,
      participantMap,
      selfName,
      selfAvatar,
    },
    attachmentState: {
      items: attachmentUiState,
      onOpen: handleAttachmentOpen,
      onPreviewLoad: handleAttachmentPreviewLoad,
      onPreviewError: handleAttachmentPreviewError,
      onPreviewRetry: handleAttachmentPreviewRetry,
      onDownload: handleAttachmentDownload,
      onDelete: handleAttachmentDelete,
      canDeleteAttachments: Boolean(onRemoveAttachments),
    },
    reactionState,
    messageMenuHandlers: {
      onContextMenu: handleMessageContextMenu,
      onKeyDown: handleMessageKeyDown,
    },
    typingState: {
      participants: typingParticipants,
      typingText,
      primaryParticipant: primaryTypingParticipant,
      remainderCount: typingRemainderCount,
    },
  };

  const composerProps: ChatComposerProps = {
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
    sessionType: session.type,
    messageInputRef,
    fileInputRef,
    onSubmit: handleSubmit,
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onDraftChange: handleDraftChange,
    onDraftBlur: handleDraftBlur,
    onPaste: handlePaste,
    onRemoveQueuedAttachment: handleRemoveQueuedAttachment,
    onRemoveUploadingAttachment: handleRemoveUploadingAttachment,
    onAttachmentButtonClick: attachmentButtonClick,
    onGifButtonClick: handleGifButtonClick,
    onGifSelect: handleGifSelect,
    onGifClose: closeGifPicker,
    onFileInputChange: handleFileInputChange,
  };

  const contextMenuPosition = contextMenu
    ? { x: contextMenu.x, y: contextMenu.y, isSelf: contextMenu.isSelf }
    : null;

  const contextMenuProps: MessageContextMenuProps = {
    contextMenu: contextMenuPosition,
    message: contextMenuMessage,
    menuRef: contextMenuRef,
    firstItemRef: contextMenuFirstItemRef,
    onClose: closeContextMenu,
    onCopy: (message) => {
      void handleMessageCopy(message, { fromMenu: true });
    },
    onForward: handleMessageForward,
    onDelete: onDeleteMessage
      ? (message) => {
          void handleMessageDelete(message);
        }
      : undefined,
    getCopyText: buildMessageCopyText,
  };

  return {
    isAssistantConversation,
    headerProps,
    participants: participantsViewModel,
    messageListProps,
    reactionPicker,
    composerProps,
    contextMenuProps,
  };
}
