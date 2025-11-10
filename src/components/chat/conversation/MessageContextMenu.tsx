"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import type { ChatMessage } from "@/components/providers/ChatProvider";

import contextMenuStyles from "@/components/ui/context-menu.module.css";
import { chatCopy } from "../copy";

type MessageContextMenuPosition = {
  x: number;
  y: number;
  isSelf: boolean;
};

export type MessageContextMenuProps = {
  contextMenu: MessageContextMenuPosition | null;
  message: ChatMessage | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  firstItemRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onCopy: (message: ChatMessage) => void;
  onForward: (message: ChatMessage) => void;
  onDelete?: ((message: ChatMessage) => void | Promise<void>) | undefined;
  getCopyText: (message: ChatMessage) => string;
};

export function MessageContextMenu({
  contextMenu,
  message,
  menuRef,
  firstItemRef,
  onClose,
  onCopy,
  onForward,
  onDelete,
  getCopyText,
}: MessageContextMenuProps): React.ReactPortal | null {
  if (!contextMenu || !message || typeof document === "undefined") {
    return null;
  }
  const canCopy = getCopyText(message).trim().length > 0;
  const canForward =
    Boolean(message.body?.trim()) ||
    (Array.isArray(message.attachments) && message.attachments.length > 0);
  const canDelete = contextMenu.isSelf && Boolean(onDelete);

  return createPortal(
    <div
      className={contextMenuStyles.backdrop}
      role="presentation"
      onClick={onClose}
      data-role="message-context-menu-backdrop"
    >
      <div
        ref={menuRef}
        className={contextMenuStyles.menu}
        style={{ top: contextMenu.y, left: contextMenu.x }}
        role="menu"
        aria-label="Message actions"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={canCopy ? firstItemRef : undefined}
          type="button"
          className={contextMenuStyles.item}
          role="menuitem"
          onClick={() => {
            if (!canCopy) return;
            onCopy(message);
          }}
          disabled={!canCopy}
          aria-disabled={!canCopy}
        >
          {chatCopy.messageMenu.copy}
        </button>
        <button
          ref={!canCopy && canForward ? firstItemRef : undefined}
          type="button"
          className={contextMenuStyles.item}
          role="menuitem"
          onClick={() => {
            if (!canForward) return;
            onForward(message);
          }}
          disabled={!canForward}
          aria-disabled={!canForward}
        >
          {chatCopy.messageMenu.forward}
        </button>
        <div className={contextMenuStyles.separator} role="separator" />
        <button
          ref={!canCopy && !canForward && canDelete ? firstItemRef : undefined}
          type="button"
          className={`${contextMenuStyles.item} ${contextMenuStyles.danger}`.trim()}
          role="menuitem"
          onClick={() => {
            if (!canDelete || !onDelete) return;
            void onDelete(message);
          }}
          disabled={!canDelete}
          aria-disabled={!canDelete}
        >
          {chatCopy.messageMenu.delete}
        </button>
      </div>
    </div>,
    document.body,
  );
}
