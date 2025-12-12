"use client";

import * as React from "react";

import { Sparkle } from "@phosphor-icons/react/dist/ssr";

import type { LocalAttachment } from "@/hooks/useAttachmentUpload";
import type { ComposerDraft } from "@/lib/composer/draft";

import styles from "../../styles";
import { formatClipDuration } from "../../utils/time";

type FeedPreviewState = {
  kind: string;
  label: string;
  body: React.ReactNode;
  empty: boolean;
  helper: string | null;
};

type UseFeedPreviewParams = {
  activeKind: string;
  activeKindLabel: string;
  workingDraft: ComposerDraft;
  displayAttachment: LocalAttachment | null;
  attachmentDisplayUrl: string | null;
  attachmentFullUrl: string | null;
  pollHasStructure: boolean;
  pollHelperText: string;
  pollPreviewCard: React.ReactNode;
  onPostContentChange?: (value: string) => void;
};

export type FeedPreviewController = {
  previewState: FeedPreviewState;
};

export function useFeedPreview({
  activeKind,
  activeKindLabel,
  workingDraft,
  displayAttachment,
  attachmentDisplayUrl,
  attachmentFullUrl,
  pollHasStructure,
  pollHelperText,
  pollPreviewCard,
  onPostContentChange,
}: UseFeedPreviewParams): FeedPreviewController {
  const handlePostContentChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onPostContentChange?.(event.target.value);
    },
    [onPostContentChange],
  );

  const canEditPostCopy = typeof onPostContentChange === "function";

  const previewState = React.useMemo<FeedPreviewState>(() => {
    let kind = activeKind;
    let label = activeKindLabel;
    const contentRaw = workingDraft.content ?? "";
    const content = contentRaw.trim();
    const titleRaw = workingDraft.title ?? "";
    const title = titleRaw.trim();
    const mediaPrompt = (workingDraft.mediaPrompt ?? "").trim();
    const mediaUrl =
      attachmentDisplayUrl ??
      attachmentFullUrl ??
      workingDraft.mediaUrl ??
      workingDraft.mediaPlaybackUrl ??
      null;
    const attachmentName = displayAttachment?.name ?? null;
    const attachmentThumb =
      displayAttachment?.thumbUrl ?? workingDraft.mediaThumbnailUrl ?? null;
    const clipDurationSeconds = workingDraft.mediaDurationSeconds ?? null;

    const renderPlaceholder = (message: string) => (
      <div className={styles.previewPlaceholderCard}>
        <span className={styles.previewPlaceholderIcon} aria-hidden="true">
          <Sparkle size={20} weight="fill" />
        </span>
        <p>{message}</p>
      </div>
    );

    const textBlocks = content
      ? content.split(/\n+/).map((block) => block.trim()).filter(Boolean)
      : [];
    const hasTextCopy = textBlocks.length > 0;
    const renderPostCopy = (editable = false) => {
      if (!editable && !hasTextCopy) {
        return null;
      }

      if (editable) {
        return (
          <div className={styles.previewPostCard} data-editable="true">
            <div className={styles.previewPostField}>
              <label className={styles.previewPostLabel} htmlFor="composer-preview-post-body">
                Post copy
              </label>
              <textarea
                id="composer-preview-post-body"
                className={styles.previewPostTextarea}
                value={contentRaw}
                onChange={handlePostContentChange}
                placeholder="Refine the caption you'd like to publish with this visual"
                rows={4}
              />
            </div>
            <p className={styles.previewPostHint}>
              Tweak the wording here to preview exactly how your post will read.
            </p>
          </div>
        );
      }

      return (
        <div className={styles.previewPostCard}>
          {textBlocks.length ? (
            <div className={styles.previewPostBody}>
              {textBlocks.map((paragraph, index) => (
                <p key={`${paragraph}-${index}`}>{paragraph}</p>
              ))}
            </div>
          ) : null}
        </div>
      );
    };

    let helper: string | null = null;
    let body: React.ReactNode;
    let empty = false;

    if (pollHasStructure) {
      kind = "poll";
      label = "Poll";
      empty = false;
      helper = pollHelperText;
      body = pollPreviewCard;
    } else {
      switch (kind) {
        case "poll": {
          empty = true;
          body = renderPlaceholder(
            "Describe the poll or start drafting your intro and the live preview will appear.",
          );
          break;
        }
        case "image": {
          const hasCopy = hasTextCopy;
          empty = !mediaUrl && !hasCopy;
          helper = null;
          if (mediaUrl) {
            const copyPreview = renderPostCopy(canEditPostCopy);
            body = (
              <div className={styles.previewMediaStack}>
                <figure className={styles.previewMediaFrame} data-kind="image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl ?? undefined}
                    alt={attachmentName ?? (mediaPrompt || "Generated visual preview")}
                  />
                </figure>
                {copyPreview}
              </div>
            );
          } else if (hasCopy) {
            body = renderPostCopy(canEditPostCopy);
          } else {
            body = renderPlaceholder("Upload or describe a visual to stage it here.");
          }
          break;
        }
        case "video": {
          empty = !mediaUrl;
          const durationLabel = formatClipDuration(clipDurationSeconds);
          const captionSeparator = " \u2022 ";
          helper = [mediaPrompt || attachmentName, durationLabel].filter(Boolean).join(captionSeparator);
          if (empty) {
            body = renderPlaceholder("Drop a clip or describe scenes to preview them here.");
          } else {
            const captionParts = [];
            if (mediaPrompt) captionParts.push(mediaPrompt);
            if (durationLabel) captionParts.push(durationLabel);
            const copyPreview = renderPostCopy();
            body = (
              <div className={styles.previewMediaStack}>
                <figure className={styles.previewMediaFrame} data-kind="video">
                  <video
                    src={mediaUrl ?? undefined}
                    controls
                    preload="metadata"
                    poster={attachmentThumb ?? undefined}
                  />
                  {captionParts.length ? <figcaption>{captionParts.join(captionSeparator)}</figcaption> : null}
                </figure>
                {copyPreview}
              </div>
            );
          }
          break;
        }
        case "document": {
          const blocks = content
            ? content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
            : [];
          empty = blocks.length === 0 && !title;
          if (empty) {
            body = renderPlaceholder("Outline the sections you need and the document will render.");
          } else {
            const displayBlocks = blocks.length ? blocks : ["Overview", "Highlights", "Next steps"];
            helper = `${displayBlocks.length} section${displayBlocks.length === 1 ? "" : "s"} in progress`;
            body = (
              <div className={styles.previewDocumentCard}>
                <h3 className={styles.previewDocumentTitle}>{title || "Untitled document"}</h3>
                <ol className={styles.previewDocumentSections}>
                  {displayBlocks.map((block, index) => {
                    const [heading, ...rest] = block.split(/\n+/);
                    const bodyText = rest.join(" ").trim();
                    return (
                      <li key={`${heading}-${index}`}>
                        <span className={styles.previewDocumentSectionBadge}>
                          {index + 1 < 10 ? `0${index + 1}` : index + 1}
                        </span>
                        <div className={styles.previewDocumentSectionContent}>
                          <h4>{heading || `Section ${index + 1}`}</h4>
                          {bodyText ? <p>{bodyText}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          }
          break;
        }
        case "tournament": {
          const rounds = content
            ? content.split(/\n+/).map((value) => value.trim()).filter(Boolean)
            : [];
          empty = rounds.length === 0 && !title;
          if (empty) {
            body = renderPlaceholder(
              "Tell Capsule AI about rounds, seeds, or teams to map the bracket.",
            );
          } else {
            const displayRounds = rounds.length
              ? rounds
              : ["Round of 16", "Quarterfinals", "Semifinals", "Final"];
            helper = `${displayRounds.length} stage${displayRounds.length === 1 ? "" : "s"} plotted`;
            body = (
              <div className={styles.previewTournamentCard}>
                <h3 className={styles.previewTournamentTitle}>{title || "Tournament bracket"}</h3>
                <div className={styles.previewTournamentGrid}>
                  {displayRounds.map((round, index) => (
                    <div key={`${round}-${index}`} className={styles.previewTournamentColumn}>
                      <span>{round}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          break;
        }
        default: {
          empty = !hasTextCopy;
          body = renderPostCopy(canEditPostCopy);
          if (empty && !canEditPostCopy) {
            body = renderPlaceholder(
              `Give Capsule AI a prompt to see your ${label.toLowerCase()} take shape.`,
            );
          }
          break;
        }
      }
    }

    return { kind, label, body, empty, helper };
  }, [
    activeKind,
    activeKindLabel,
    attachmentDisplayUrl,
    attachmentFullUrl,
    displayAttachment,
    pollHasStructure,
    pollHelperText,
    pollPreviewCard,
    canEditPostCopy,
    handlePostContentChange,
    workingDraft.content,
    workingDraft.mediaDurationSeconds,
    workingDraft.mediaPlaybackUrl,
    workingDraft.mediaPrompt,
    workingDraft.mediaThumbnailUrl,
    workingDraft.mediaUrl,
    workingDraft.title,
  ]);
  return { previewState };
}
