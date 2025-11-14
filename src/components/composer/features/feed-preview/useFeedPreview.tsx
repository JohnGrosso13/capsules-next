"use client";

import * as React from "react";

import { Sparkle } from "@phosphor-icons/react/dist/ssr";

import type { LocalAttachment } from "@/hooks/useAttachmentUpload";
import type { ComposerDraft } from "@/lib/composer/draft";

import styles from "../../../ai-composer.module.css";
import type { MemoryPickerTab } from "../../components/ComposerMemoryPicker";
import { formatClipDuration } from "../../utils/time";

type FeedPreviewState = {
  kind: string;
  label: string;
  body: React.ReactNode;
  empty: boolean;
  helper: string | null;
};

type PreviewAction = {
  label: string;
  onClick: () => void;
  disabled: boolean;
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
  handleAttachClick: () => void;
  handlePromptSubmit: () => void;
  handleMemoryPickerOpen(tab: MemoryPickerTab): void;
  handleBlueprintShortcut: () => void;
  promptValue: string;
  attachmentUploading: boolean;
  loading: boolean;
  memoryPickerTab: MemoryPickerTab;
  memoryItemCount: number;
};

export type FeedPreviewController = {
  previewState: FeedPreviewState;
  previewPrimaryAction: PreviewAction;
  previewSecondaryAction: PreviewAction;
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
  handleAttachClick,
  handlePromptSubmit,
  handleMemoryPickerOpen,
  handleBlueprintShortcut,
  promptValue,
  attachmentUploading,
  loading,
  memoryPickerTab,
  memoryItemCount,
}: UseFeedPreviewParams): FeedPreviewController {
  const previewState = React.useMemo<FeedPreviewState>(() => {
    const kind = activeKind;
    let label = activeKindLabel;
    const content = (workingDraft.content ?? "").trim();
    const title = (workingDraft.title ?? "").trim();
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
    const hasTextCopy = Boolean(title) || textBlocks.length > 0;
    const renderPostCopy = () => {
      if (!hasTextCopy) {
        return null;
      }
      return (
        <div className={styles.previewPostCard}>
          {title ? <h3 className={styles.previewPostTitle}>{title}</h3> : null}
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

    if (kind === "poll") {
      if (!pollHasStructure) {
        empty = true;
        body = renderPlaceholder(
          "Describe the poll or start drafting your intro and the live preview will appear.",
        );
      } else {
        empty = false;
        helper = pollHelperText;
        body = pollPreviewCard;
      }
    } else {
      switch (kind) {
        case "image": {
          empty = !mediaUrl;
          helper = mediaPrompt || attachmentName;
          if (empty) {
            body = renderPlaceholder("Upload or describe a visual to stage it here.");
          } else {
            const copyPreview = renderPostCopy();
            body = (
              <div className={styles.previewMediaStack}>
                <figure className={styles.previewMediaFrame} data-kind="image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl ?? undefined}
                    alt={attachmentName ?? (mediaPrompt || "Generated visual preview")}
                  />
                  {mediaPrompt ? <figcaption>{mediaPrompt}</figcaption> : null}
                </figure>
                {copyPreview}
              </div>
            );
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
          if (empty) {
            body = renderPlaceholder(
              `Give Capsule AI a prompt to see your ${label.toLowerCase()} take shape.`,
            );
          } else {
            body = renderPostCopy();
          }
          break;
        }
      }
    }

    if (kind !== "poll" && pollHasStructure) {
      if (empty) {
        body = pollPreviewCard;
      } else {
        body = (
          <div className={styles.previewComposite}>
            <div className={styles.previewPrimary}>{body}</div>
            <div className={styles.previewDivider} aria-hidden="true" />
            <div className={styles.previewSupplement}>{pollPreviewCard}</div>
          </div>
        );
      }
      helper = helper ?? pollHelperText;
      empty = false;
      label = `${activeKindLabel} + Poll`;
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
    workingDraft.content,
    workingDraft.mediaDurationSeconds,
    workingDraft.mediaPlaybackUrl,
    workingDraft.mediaPrompt,
    workingDraft.mediaThumbnailUrl,
    workingDraft.mediaUrl,
    workingDraft.title,
  ]);

  const previewPrimaryAction = React.useMemo<PreviewAction>(() => {
    if (activeKind === "image" || activeKind === "video") {
      return {
        label: "Upload asset",
        onClick: handleAttachClick,
        disabled: loading || attachmentUploading,
      };
    }
    const trimmed = promptValue.trim();
    const label =
      activeKind === "poll" ? "Generate via AI" : activeKind === "document" ? "Outline with AI" : "Ask Capsule";
    const allowed = trimmed.length > 0 || pollHasStructure;
    return {
      label,
      onClick: handlePromptSubmit,
      disabled: loading || attachmentUploading || !allowed,
    };
  }, [
    activeKind,
    attachmentUploading,
    handleAttachClick,
    handlePromptSubmit,
    loading,
    pollHasStructure,
    promptValue,
  ]);

  const previewSecondaryAction = React.useMemo<PreviewAction>(() => {
    if (activeKind === "image" || activeKind === "video") {
      return {
        label: "Open library",
        onClick: () => handleMemoryPickerOpen(memoryPickerTab),
        disabled: false,
      };
    }
    return {
      label: "Browse blueprints",
      onClick: handleBlueprintShortcut,
      disabled: !memoryItemCount,
    };
  }, [
    activeKind,
    handleBlueprintShortcut,
    handleMemoryPickerOpen,
    memoryItemCount,
    memoryPickerTab,
  ]);

  return { previewState, previewPrimaryAction, previewSecondaryAction };
}
