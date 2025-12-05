import * as React from "react";
import Image from "next/image";

import viewerStyles from "../styles/composer-viewer.module.css";

type ComposerViewerProps = {
  open: boolean;
  attachment: { url?: string | null; mimeType?: string | null; name?: string | null } | null;
  attachmentKind?: string | null;
  attachmentFullUrl?: string | null;
  attachmentDisplayUrl?: string | null;
  attachmentPreviewUrl?: string | null;
  attachmentCaption?: string | null;
  attachmentMemoryPrompt?: string | null;
  onClose: () => void;
  onRemoveAttachment: () => void;
  onSelectSuggestion: (prompt: string) => void;
  vibeSuggestions: Array<{ label: string; prompt: string }>;
};

export function ComposerViewer({
  open,
  attachment,
  attachmentKind,
  attachmentFullUrl,
  attachmentDisplayUrl,
  attachmentPreviewUrl,
  attachmentCaption,
  attachmentMemoryPrompt,
  onClose,
  onRemoveAttachment,
  onSelectSuggestion,
  vibeSuggestions,
}: ComposerViewerProps) {
  if (!open || !attachment) return null;
  const source = attachmentFullUrl ?? attachmentDisplayUrl ?? attachmentPreviewUrl ?? attachment.url ?? "";
  const mime = attachment.mimeType?.toLowerCase() ?? "";
  const isVideo = mime.startsWith("video/");
  const isImage = mime.startsWith("image/") || (!isVideo && attachmentKind === "image");

  return (
    <div className={viewerStyles.viewerOverlay} role="dialog" aria-modal="true">
      <div className={viewerStyles.viewerSurface}>
        <div className={viewerStyles.viewerHeader}>
          <div>
            <p className={viewerStyles.viewerTitle}>{attachmentCaption ?? attachment.name ?? "Attachment"}</p>
            {attachmentMemoryPrompt ? <p className={viewerStyles.viewerSubtitle}>{attachmentMemoryPrompt}</p> : null}
          </div>
          <div className={viewerStyles.viewerActions}>
            <button type="button" onClick={onRemoveAttachment} className={viewerStyles.viewerDanger}>
              Remove
            </button>
            <button type="button" onClick={onClose} className={viewerStyles.viewerClose}>
              Close
            </button>
          </div>
        </div>
        <div className={viewerStyles.viewerBody}>
          {isVideo ? (
            <video className={viewerStyles.viewerMedia} src={source} controls autoPlay />
          ) : isImage ? (
            <div className={viewerStyles.viewerMediaWrap}>
              <Image
                src={source}
                alt={attachmentCaption ?? "Attachment preview"}
                fill
                sizes="(max-width: 900px) 90vw, 800px"
                style={{ objectFit: "contain" }}
                priority
              />
            </div>
          ) : source ? (
            <a className={viewerStyles.viewerLink} href={source} target="_blank" rel="noreferrer">
              Open attachment
            </a>
          ) : (
            <p className={viewerStyles.viewerEmpty}>Attachment is missing a preview.</p>
          )}
        </div>
        {vibeSuggestions.length ? (
          <div className={viewerStyles.viewerSuggestions}>
            <p className={viewerStyles.viewerSubtitle}>Try a prompt</p>
            <div className={viewerStyles.suggestionChips}>
              {vibeSuggestions.map((suggestion) => (
                <button
                  key={suggestion.prompt}
                  type="button"
                  className={viewerStyles.suggestionChip}
                  onClick={() => onSelectSuggestion(suggestion.prompt)}
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
