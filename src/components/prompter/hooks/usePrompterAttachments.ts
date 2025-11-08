"use client";

import * as React from "react";

import { useAttachmentUpload, type LocalAttachment } from "@/hooks/useAttachmentUpload";
import { extractFileFromDataTransfer } from "@/lib/clipboard/files";
import { usePrompterDragAndDrop } from "@/components/prompter/usePrompterDragAndDrop";

type AttachmentPreview = { url: string; mime: string; name: string };

type UsePrompterAttachmentsOptions = {
  enabled: boolean;
  capsuleId: string | null;
  enableDragAndDrop: boolean;
};

export function usePrompterAttachments({
  enabled,
  capsuleId,
  enableDragAndDrop,
}: UsePrompterAttachmentsOptions) {
  const noop = React.useCallback(() => {}, []);

  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
    handleAttachmentFile,
  } = useAttachmentUpload(undefined, {
    metadata: () => (capsuleId ? { capsule_id: capsuleId } : null),
  });

  const drag = usePrompterDragAndDrop({
    onFile: handleAttachmentFile,
    enabled: enabled && enableDragAndDrop,
  });

  const [attachmentList, setAttachmentList] = React.useState<LocalAttachment[]>([]);
  const [preview, setPreview] = React.useState<AttachmentPreview | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setAttachmentList([]);
      clearAttachment();
      return;
    }

    if (!attachment) return;
    if (attachment.status !== "ready" && attachment.status !== "error") return;
    setAttachmentList((prev) => {
      const filtered = prev.filter((item) => item.id !== attachment.id);
      return [...filtered, attachment];
    });
  }, [attachment, clearAttachment, enabled]);

  const removeAttachment = React.useCallback(
    (id: string) => {
      if (attachment?.id === id) {
        clearAttachment();
      }
      setAttachmentList((prev) => prev.filter((item) => item.id !== id));
    },
    [attachment?.id, clearAttachment],
  );

  const clearAllAttachments = React.useCallback(() => {
    clearAttachment();
    setAttachmentList([]);
  }, [clearAttachment]);

  const handlePreviewAttachment = React.useCallback(
    (id: string) => {
      const att =
        attachmentList.find((a) => a.id === id) ?? (attachment?.id === id ? attachment : null);
      if (!att || att.status !== "ready" || !att.url) return;
      setPreview({ url: att.url, mime: att.mimeType, name: att.name });
    },
    [attachment, attachmentList],
  );

  const handleRetryAttachment = React.useCallback(
    (target: LocalAttachment) => {
      if (!target?.id || !target.originalFile) return;
      removeAttachment(target.id);
      void handleAttachmentFile(target.originalFile);
    },
    [handleAttachmentFile, removeAttachment],
  );

  const handlePasteAttachment = React.useCallback(
    (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!enabled) return;
      const file = extractFileFromDataTransfer(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void handleAttachmentFile(file);
    },
    [enabled, handleAttachmentFile],
  );

  return {
    attachmentsEnabled: enabled,
    fileInputRef,
    attachment: enabled ? attachment : null,
    readyAttachment: enabled ? readyAttachment : null,
    attachmentUploading: enabled ? uploading : false,
    attachmentList,
    removeAttachment: enabled ? removeAttachment : noop,
    handleAttachClick: enabled ? handleAttachClick : noop,
    handleAttachmentSelect: enabled ? handleAttachmentSelect : noop,
    handlePasteAttachment: enabled ? handlePasteAttachment : noop,
    handlePreviewAttachment: enabled ? handlePreviewAttachment : noop,
    handleRetryAttachment: enabled ? handleRetryAttachment : noop,
    isDraggingFile: enabled ? drag.isDraggingFile : false,
    handleDragEnter: enabled ? drag.handleDragEnter : undefined,
    handleDragOver: enabled ? drag.handleDragOver : undefined,
    handleDragLeave: enabled ? drag.handleDragLeave : undefined,
    handleDrop: enabled ? drag.handleDrop : undefined,
    clearAllAttachments: enabled ? clearAllAttachments : noop,
    preview,
    closePreview: () => setPreview(null),
    hasReadyAttachment:
      enabled && Boolean((readyAttachment && readyAttachment.status === "ready") || attachmentList.find((att) => att.status === "ready")),
  };
}
