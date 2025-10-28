type UploadingFormatter = (name: string, progress: number) => string;
type AttachmentReadyFormatter = (count: number) => string;

export const chatCopy = {
  composer: {
    dropHint: "Drop file to attach",
    uploading: ((name: string, progress: number) =>
      `Uploading "${name}" (${progress}%)`) as UploadingFormatter,
    finishing: (name: string) => `Finishing upload "${name}"...`,
    attachmentsReady: ((count: number) =>
      count === 1 ? "Attachment ready to send" : `${count} attachments ready`) as AttachmentReadyFormatter,
  },
  attachments: {
    previewFailed: "Preview unavailable",
    retry: "Retry",
    download: "Download",
    delete: "Remove",
    downloading: "Downloading...",
    deleting: "Removing...",
  },
  messageMenu: {
    copy: "Copy message",
    forward: "Forward message",
    delete: "Delete message",
    forwardedPrefix: "Forwarded message:",
    deleteConfirm: "Delete this message?",
  },
  errors: {
    attachmentDeleteFailed: "Failed to remove that attachment. Try again.",
    attachmentDownloadFailed: "Couldn't download that attachment. Try again.",
    messageDeleteFailed: "Unable to delete that message right now.",
    messageCopyFailed: "Couldn't copy that message. Try again.",
  },
};
