import * as React from "react";

import type { ChatMessage, ChatSession } from "@/components/providers/chat-store";
import { buildMessageCopyText, buildMessageKey } from "../conversation/utils";
import type { MessageContextMenuState } from "../conversation/types";
import { chatCopy } from "../copy";

type ChatActionTelemetry = (payload: {
  action: string;
  conversationId?: string;
  messageId?: string;
  metadata?: Record<string, unknown>;
}) => void;

export function useChatContextMenu({
  session,
  messagesRef,
  messageInputRef,
  onDeleteMessage,
  onTypingChange,
  setDraft,
  setError,
  sendChatActionTelemetry,
}: {
  session: ChatSession;
  messagesRef: React.RefObject<HTMLDivElement | null>;
  messageInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onTypingChange?: ((conversationId: string, typing: boolean) => void) | undefined;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  setError: (value: string | null) => void;
  sendChatActionTelemetry: ChatActionTelemetry;
}) {
  const [contextMenu, setContextMenu] = React.useState<MessageContextMenuState | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement | null>(null);
  const contextMenuFirstItemRef = React.useRef<HTMLButtonElement | null>(null);

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
      const messageId = typeof message.id === "string" ? message.id : null;
      const basePayload: { action: string; conversationId: string; metadata: { length: number }; messageId?: string } =
        {
          action: success ? "message_copy" : "message_copy_failure",
          conversationId: session.id,
          metadata: { length: text.length },
        };
      if (messageId) {
        basePayload.messageId = messageId;
      }
      void sendChatActionTelemetry(basePayload);
      return success;
    },
    [sendChatActionTelemetry, session.id],
  );

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null);
  }, []);

  const contextMenuMessage = React.useMemo<ChatMessage | null>(() => {
    if (!contextMenu) return null;
    if (contextMenu.messageId === null) return null;
    const byId =
      contextMenu.messageId === null
        ? null
        : session.messages.find(
            (msg) => typeof msg.id === "string" && msg.id.trim() === contextMenu.messageId,
          ) ?? null;
    if (byId) return byId;
    if (!contextMenu.messageKey) return null;
    const byKey =
      session.messages.find((msg, msgIndex) => buildMessageKey(msg, msgIndex) === contextMenu.messageKey) ??
      null;
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
  }, [closeContextMenu, contextMenu, messagesRef]);

  React.useEffect(() => {
    if (!contextMenu) {
      contextMenuFirstItemRef.current = null;
      return;
    }
    requestAnimationFrame(() => {
      contextMenuFirstItemRef.current?.focus();
    });
  }, [contextMenu]);

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
    [closeContextMenu, copyMessage, setError],
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
        if (messageInputRef.current) {
          messageInputRef.current.focus();
        }
      });
      onTypingChange?.(session.id, true);
      const messageId = typeof message.id === "string" ? message.id : null;
      const payload: { action: string; conversationId: string; messageId?: string } = {
        action: "message_forward",
        conversationId: session.id,
      };
      if (messageId) {
        payload.messageId = messageId;
      }
      void sendChatActionTelemetry(payload);
    },
    [closeContextMenu, messageInputRef, onTypingChange, sendChatActionTelemetry, session.id, setDraft],
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
    [closeContextMenu, onDeleteMessage, sendChatActionTelemetry, session.id, setError],
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
      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
      const x = clamp(clientX, 12, window.innerWidth - menuWidth - 12);
      const y = clamp(clientY, 12, window.innerHeight - menuHeight - 12);
      const messageId =
        typeof message.id === "string" && message.id.trim().length > 0 ? message.id.trim() : null;
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
      const isCopy = (event.key === "c" || event.key === "C") && (event.metaKey || event.ctrlKey);
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

  return {
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
  };
}
