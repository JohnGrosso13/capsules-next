import * as React from "react";

import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import type { ChatMessage } from "@/components/providers/ChatProvider";
import {
  DEFAULT_ATTACHMENT_UI_STATE,
  type AttachmentUiState,
  type MessageAttachmentEntry,
  buildAttachmentStateKey,
} from "../conversation/attachments";
import type { PendingAttachment } from "../ChatComposer";
import type { GifPickerSelection } from "../GifPicker";
import { chatCopy } from "../copy";

type AttachmentTelemetry = (payload: {
  action: "open" | "download";
  conversationId: string;
  messageId?: string | undefined;
  attachmentId?: string | undefined;
  mimeType?: string | null;
  size?: number | null;
}) => void;

type UseChatAttachmentsOptions = {
  sessionId: string;
  messages: ChatMessage[];
  onRemoveAttachments?: (messageId: string, attachmentIds: string[]) => Promise<void>;
  onSend: (payload: { body: string; attachments: MessageAttachmentEntry[] }) => Promise<void>;
  onSendError: (message: string) => void;
  sendTelemetry: AttachmentTelemetry;
};

export function useChatAttachments({
  sessionId,
  messages,
  onRemoveAttachments,
  onSend,
  onSendError,
  sendTelemetry,
}: UseChatAttachmentsOptions) {
  const [attachmentUiState, setAttachmentUiState] = React.useState<Record<string, AttachmentUiState>>({});
  const [queuedAttachments, setQueuedAttachments] = React.useState<PendingAttachment[]>([]);
  const [pendingFileCount, setPendingFileCount] = React.useState(0);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
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
  const pendingFilesRef = React.useRef<File[]>([]);

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

  React.useEffect(() => {
    const activeKeys = new Set<string>();
    messages.forEach((message) => {
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
  }, [messages]);

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
        typeof message.id === "string" && message.id.trim().length > 0 ? message.id.trim() : undefined;
      const attachmentId =
        typeof attachment.id === "string" && attachment.id.trim().length > 0 ? attachment.id.trim() : undefined;
      sendTelemetry({
        action: "open",
        conversationId: sessionId,
        messageId,
        attachmentId,
        mimeType: attachment.mimeType,
        size: attachment.size,
      });
      if (typeof window !== "undefined") {
        window.open(attachment.url, "_blank", "noopener");
      }
    },
    [sendTelemetry, sessionId],
  );

  const handleAttachmentDownload = React.useCallback(
    (message: ChatMessage, attachment: MessageAttachmentEntry, key: string) => {
      if (!attachment.url) return;
      const messageId =
        typeof message.id === "string" && message.id.trim().length > 0 ? message.id.trim() : undefined;
      const attachmentId =
        typeof attachment.id === "string" && attachment.id.trim().length > 0 ? attachment.id.trim() : undefined;
      updateAttachmentUiState(key, (state) => ({
        ...state,
        downloading: true,
        downloadError: null,
      }));
      sendTelemetry({
        action: "download",
        conversationId: sessionId,
        messageId,
        attachmentId,
        mimeType: attachment.mimeType,
        size: attachment.size,
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
        updateAttachmentUiState(key, (state) => ({
          ...state,
          downloading: false,
        }));
      } catch (error) {
        console.error("attachment.download.failed", error);
        updateAttachmentUiState(key, (state) => ({
          ...state,
          downloading: false,
          downloadError: chatCopy.errors.attachmentDownloadFailed,
        }));
      }
    },
    [sendTelemetry, sessionId, updateAttachmentUiState],
  );

  const handleAttachmentDelete = React.useCallback(
    async (message: ChatMessage, attachment: MessageAttachmentEntry, key: string) => {
      if (!onRemoveAttachments) return;
      const messageId =
        typeof message.id === "string" && message.id.trim().length > 0 ? message.id.trim() : null;
      const attachmentId =
        typeof attachment.id === "string" && attachment.id.trim().length > 0 ? attachment.id.trim() : null;
      if (!messageId || !attachmentId) return;
      updateAttachmentUiState(key, (state) => ({
        ...state,
        deleting: true,
        deleteError: null,
      }));
      try {
        await onRemoveAttachments(messageId, [attachmentId]);
        updateAttachmentUiState(key, () => null);
      } catch (error) {
        console.error("chat.attachment.delete.failed", error);
        updateAttachmentUiState(key, (state) => ({
          ...state,
          deleting: false,
          deleteError: chatCopy.errors.attachmentDeleteFailed,
        }));
      }
    },
    [onRemoveAttachments, updateAttachmentUiState],
  );

  const clearAttachmentError = React.useCallback(() => {
    if (!attachment || !attachment.error) return;
    setQueuedAttachments((previous) => previous.filter((item) => item.id !== attachment.id));
    clearAttachment();
  }, [attachment, clearAttachment]);

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
    void processNextQueuedFile();
  }, [processNextQueuedFile, readyAttachment]);

  const uploadingAttachment =
    attachmentUploading && attachment && attachment.status !== "ready" ? attachment : null;
  const attachmentProgress =
    attachment && attachment.progress !== undefined
      ? Math.min(Math.max(attachment.progress * 100, 0), 100)
      : 0;

  const attachmentError =
    attachment?.status === "error" ? attachment.error ?? "Attachment upload failed" : null;

  const hasAttachmentBlock =
    queuedAttachments.some((item) => item.mimeType?.startsWith("image/") || item.mimeType?.startsWith("video/")) ||
    Boolean(uploadingAttachment);

  const handleAttachmentButtonClick = React.useCallback(() => {
    clearAttachmentError();
    handleAttachClick();
  }, [clearAttachmentError, handleAttachClick]);

  const handleGifSelect = React.useCallback(
    async (selection: GifPickerSelection) => {
      const attachment: MessageAttachmentEntry = {
        id: selection.id,
        url: selection.url,
        mimeType: "image/gif",
        name: selection.title ?? "GIF",
        thumbnailUrl: selection.previewUrl ?? selection.url,
        size: selection.size ?? 0,
        storageKey: null,
        sessionId: null,
      };
      try {
        await onSend({ body: "", attachments: [attachment] });
      } catch (error) {
        console.error("chat.gif.send.failed", error);
        onSendError("Failed to send GIF attachment");
      }
    },
    [onSend, onSendError],
  );

  const handleFileInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      clearAttachmentError();
      const files = event.target.files ? Array.from(event.target.files) : [];
      enqueueFiles(files);
    },
    [clearAttachmentError, enqueueFiles],
  );

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

  const handleRemoveQueuedAttachment = React.useCallback((attachmentId: string) => {
    setQueuedAttachments((previous) => previous.filter((item) => item.id !== attachmentId));
  }, []);

  const clearQueuedAttachments = React.useCallback(() => {
    pendingFilesRef.current = [];
    setPendingFileCount(0);
    setQueuedAttachments([]);
    clearAttachment();
  }, [clearAttachment]);

  return {
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
    readyAttachment,
    attachRemoteAttachment,
    clearAttachment,
    handleAttachmentButtonClick,
    handleFileInputChange,
    handleAttachmentOpen,
    handleAttachmentDownload,
    handleAttachmentDelete,
    handleAttachmentPreviewLoad,
    handleAttachmentPreviewError,
    handleAttachmentPreviewRetry,
    handleGIFSelect: handleGifSelect,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleAttachmentErrorClear: clearAttachmentError,
    handleRemoveQueuedAttachment,
    clearQueuedAttachments,
    queueFiles: enqueueFiles,
  };
}
