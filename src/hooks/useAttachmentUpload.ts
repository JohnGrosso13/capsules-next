"use client";

import * as React from "react";

import {
  ATTACHMENT_DEFAULT_MAX_SIZE,
  createAttachmentUploader,
  type AttachmentMetadataInput,
  type RemoteAttachmentOptions,
} from "@/services/attachments/uploader";

export type {
  AttachmentRole,
  LocalAttachment,
  RemoteAttachmentOptions,
  AttachmentMetadataInput,
} from "@/services/attachments/uploader";

type UseAttachmentUploadOptions = {
  metadata?: AttachmentMetadataInput;
};

function useAttachmentInput(): {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  handleAttachClick: () => void;
  resetFileInputValue: () => void;
} {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleAttachClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const resetFileInputValue = React.useCallback(() => {
    const input = fileInputRef.current;
    if (input) {
      input.value = "";
    }
  }, []);

  return { fileInputRef, handleAttachClick, resetFileInputValue };
}

export function useAttachmentUpload(
  maxSizeBytes = ATTACHMENT_DEFAULT_MAX_SIZE,
  options: UseAttachmentUploadOptions = {},
) {
  const { fileInputRef, handleAttachClick, resetFileInputValue } = useAttachmentInput();
  const uploader = React.useMemo(
    () => createAttachmentUploader({ maxSizeBytes }),
    [maxSizeBytes],
  );

  const metadataRef = React.useRef<AttachmentMetadataInput | undefined>(options.metadata);
  React.useEffect(() => {
    metadataRef.current = options.metadata;
  }, [options.metadata]);

  const subscribe = React.useCallback(
    (listener: () => void) => uploader.subscribe(listener),
    [uploader],
  );
  const getSnapshot = React.useCallback(() => uploader.getState(), [uploader]);
  const { attachment, readyAttachment, uploading } = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  const clearAttachment = React.useCallback(() => {
    uploader.clear();
    resetFileInputValue();
  }, [resetFileInputValue, uploader]);

  const processFile = React.useCallback(
    async (file: File) => {
      await uploader.handleFile(file, metadataRef.current);
    },
    [uploader],
  );

  const handleAttachmentSelect = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      if (event.target.value) event.target.value = "";
      if (!files.length) return;
      for (const file of files) {
        await processFile(file);
      }
    },
    [processFile],
  );

  const handleAttachmentFile = React.useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      await processFile(file);
    },
    [processFile],
  );

  const attachRemoteAttachment = React.useCallback(
    (remoteOptions: RemoteAttachmentOptions) => {
      uploader.attachRemoteAttachment(remoteOptions);
    },
    [uploader],
  );

  return {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
    handleAttachmentFile,
    attachRemoteAttachment,
  } as const;
}
