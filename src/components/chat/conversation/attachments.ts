"use client";

import type { ChatMessage } from "@/components/providers/ChatProvider";

export type MessageAttachmentEntry = ChatMessage["attachments"][number];

export type AttachmentUiState = {
  previewFailed: boolean;
  previewNonce: number;
  downloading: boolean;
  deleting: boolean;
  deleteError: string | null;
  downloadError: string | null;
};

export const DEFAULT_ATTACHMENT_UI_STATE: AttachmentUiState = {
  previewFailed: false,
  previewNonce: 0,
  downloading: false,
  deleting: false,
  deleteError: null,
  downloadError: null,
};

export function buildAttachmentStateKey(
  message: ChatMessage,
  attachment: MessageAttachmentEntry,
  index: number,
): string {
  const messageId =
    typeof message.id === "string" && message.id.trim().length > 0
      ? message.id.trim()
      : `local-${message.sentAt}-${index}`;
  const attachmentId =
    typeof attachment.id === "string" && attachment.id.trim().length > 0
      ? attachment.id.trim()
      : `attachment-${index}`;
  return `${messageId}:${attachmentId}`;
}
