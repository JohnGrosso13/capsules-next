"use client";

import * as React from "react";
import styles from "../ai-composer.module.css";
import homeStyles from "@/components/home.module.css";
import contextMenuStyles from "@/components/ui/context-menu.module.css";
import { X, Paperclip, CaretDown, CaretRight, Sparkle } from "@phosphor-icons/react/dist/ssr";

import { ComposerLayout } from "./components/ComposerLayout";
import { AttachmentPanel } from "./components/AttachmentPanel";
import { PreviewColumn } from "./components/PreviewColumn";
import { VoiceRecorder } from "./components/VoiceRecorder";
import {
  useComposerFormReducer,
  type ComposerFormState,
} from "./hooks/useComposerFormReducer";
import { useComposerLayout } from "./hooks/useComposerLayout";
import { useComposerVoice } from "./hooks/useComposerVoice";
import { useAttachmentViewer, useResponsiveRail } from "./hooks/useComposerPanels";

import { useAttachmentUpload, type LocalAttachment } from "@/hooks/useAttachmentUpload";
import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import { isComposerDraftReady, type ComposerDraft } from "@/lib/composer/draft";
import {
  buildImageVariants,
  pickBestDisplayVariant,
  pickBestFullVariant,
  type CloudflareImageVariantSet,
} from "@/lib/cloudflare/images";
import {
  buildLocalImageVariants,
  shouldBypassCloudflareImages,
} from "@/lib/cloudflare/runtime";

const PANEL_WELCOME =
  "Hi! I'm here to help you design a capsule banner for Memory Lane. Describe the mood, colors, or imagery you'd like and I'll generate options.";

const QUICK_PROMPT_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: "Bold neon gradients", prompt: "Design a bold neon gradient banner with futuristic energy." },
  { label: "Soft sunrise palette", prompt: "Create a capsule banner inspired by a soft sunrise palette." },
  { label: "Minimal dark mode", prompt: "Draft a minimal dark mode banner with crisp typography." },
];

type MemoryPreset = {
  key: string;
  label: string;
  description: string;
  prompt: string;
};

const DEFAULT_MEMORY_PRESETS: MemoryPreset[] = [
  {
    key: "ai-promo",
    label: "AI Generated Promo Tile",
    description: "Memory",
    prompt: "Generate a promo banner that feels energetic and futuristic.",
  },
  {
    key: "ai-memory-lane",
    label: "AI Generated Banner for Memory Lane",
    description: "Memory",
    prompt: "Create a nostalgic banner for Memory Lane with warm highlights.",
  },
  {
    key: "signup-flow",
    label: "Sign Up Process",
    description: "Memory",
    prompt: "Draft visuals for a signup process announcement banner.",
  },
  {
    key: "successful-upload",
    label: "Successful Upload",
    description: "Memory",
    prompt: "Celebrate a successful upload with a celebratory banner concept.",
  },
];

type MemoryItem = {
  key: string;
  label: string;
  description: string;
  prompt: string | null;
  kind: "choice" | "preset";
};

export type ComposerChoice = { key: string; label: string };

type ComposerFormProps = {
  loading: boolean;
  draft: ComposerDraft | null;
  prompt: string;
  message?: string | null | undefined;
  choices?: ComposerChoice[] | null | undefined;
  onChange(draft: ComposerDraft): void;
  onClose(): void;
  onPost(): void;
  onForceChoice?(key: string): void;
  onPrompt?(prompt: string, attachments?: PrompterAttachment[] | null): Promise<void> | void;
};

export function ComposerForm({
  loading,
  draft,
  prompt,
  message,
  choices: _choices,
  onChange,
  onClose,
  onPost,
  onPrompt,
  onForceChoice,
}: ComposerFormProps) {
  const workingDraft = React.useMemo<ComposerDraft>(
    () =>
      draft ?? {
        kind: "text",
        content: "",
        title: null,
        mediaUrl: null,
        mediaPrompt: null,
        poll: null,
        suggestions: [],
      },
    [draft],
  );

  const updateDraft = React.useCallback(
    (partial: Partial<ComposerDraft>) => {
      onChange({ ...workingDraft, ...partial });
    },
    [onChange, workingDraft],
  );

  const { state, actions } = useComposerFormReducer();
  const { privacy, mobileRailOpen, previewOpen, layout, viewerOpen, voice: voiceState } = state;

  const columnsRef = React.useRef<HTMLDivElement | null>(null);
  const mainRef = React.useRef<HTMLDivElement | null>(null);
  const promptInputRef = React.useRef<HTMLInputElement | null>(null);

  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading: attachmentUploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
  } = useAttachmentUpload();

  const openViewer = React.useCallback(() => actions.viewer.open(), [actions]);
  const closeViewer = React.useCallback(() => actions.viewer.close(), [actions]);

  const cloudflareBypass = React.useMemo(shouldBypassCloudflareImages, []);

  useComposerLayout({ layout, layoutActions: actions.layout, mainRef });

  const voiceControls = useComposerVoice({
    voiceState,
    voiceActions: actions.voice,
    workingDraft,
    updateDraft,
    promptInputRef,
    loading,
    attachmentUploading,
  });

  useAttachmentViewer({ open: viewerOpen, onClose: closeViewer });
  const closeMobileRail = React.useCallback(() => actions.setMobileRailOpen(false), [actions]);
  useResponsiveRail({ open: mobileRailOpen, onClose: closeMobileRail });

  const displayAttachment = React.useMemo<LocalAttachment | null>(() => {
    if (attachment) return attachment;
    if (workingDraft.mediaUrl) {
      const inferredKind = (workingDraft.kind ?? "").toLowerCase();
      const inferredMime = inferredKind.startsWith("video") ? "video/*" : "image/*";
      const derivedName =
        workingDraft.mediaPrompt?.trim() ||
        workingDraft.title?.trim() ||
        workingDraft.mediaUrl.split("/").pop() ||
        "Attached media";
      return {
        id: "draft-media",
        name: derivedName,
        size: 0,
        mimeType: inferredMime,
        status: "ready",
        url: workingDraft.mediaUrl,
        progress: 1,
        thumbUrl: null,
      };
    }
    return null;
  }, [attachment, workingDraft.kind, workingDraft.mediaPrompt, workingDraft.mediaUrl, workingDraft.title]);

  const attachmentStatusLabel = React.useMemo(() => {
    if (!displayAttachment) return null;
    if (displayAttachment.status === "uploading") {
      const pct = Math.round((displayAttachment.progress ?? 0) * 100);
      return pct > 0 ? `Uploading ${pct}%` : "Uploading...";
    }
    if (displayAttachment.status === "error") {
      return displayAttachment.error ?? "Upload failed";
    }
    return "Attachment ready";
  }, [displayAttachment]);

  const attachmentPreviewUrl = React.useMemo(() => {
    if (!displayAttachment) return null;
    if (displayAttachment.thumbUrl) return displayAttachment.thumbUrl;
    if (displayAttachment.url && displayAttachment.mimeType.startsWith("image/")) {
      return displayAttachment.url;
    }
    return null;
  }, [displayAttachment]);

  const hasAttachment = Boolean(displayAttachment);
  const attachmentMime = displayAttachment?.mimeType ?? "";
  const attachmentUrl = displayAttachment?.url ?? null;
  const attachmentThumb = displayAttachment?.thumbUrl ?? attachmentPreviewUrl ?? null;
  const attachmentProgress = displayAttachment?.progress ?? 0;
  const attachmentKind = React.useMemo(
    () => (attachmentMime.startsWith("video/") ? "video" : attachmentMime ? "image" : null),
    [attachmentMime],
  );
  const attachmentProgressPct = React.useMemo(
    () => Math.round((attachmentProgress ?? 0) * 100),
    [attachmentProgress],
  );

  const attachmentVariants = React.useMemo<CloudflareImageVariantSet | null>(() => {
    if (!hasAttachment || attachmentKind !== "image" || !attachmentUrl) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : null;
    if (cloudflareBypass) {
      return buildLocalImageVariants(attachmentUrl, attachmentThumb, origin);
    }
    return buildImageVariants(attachmentUrl, {
      thumbnailUrl: attachmentThumb,
      origin,
    });
  }, [attachmentKind, attachmentThumb, attachmentUrl, cloudflareBypass, hasAttachment]);

  const attachmentDisplayUrl = React.useMemo(() => {
    if (!hasAttachment) return null;
    if (attachmentKind === "video") {
      return attachmentUrl;
    }
    const variantUrl = pickBestDisplayVariant(attachmentVariants);
    return variantUrl ?? attachmentPreviewUrl ?? attachmentUrl;
  }, [attachmentKind, attachmentPreviewUrl, attachmentUrl, attachmentVariants, hasAttachment]);

  const attachmentFullUrl = React.useMemo(() => {
    if (!hasAttachment) return null;
    if (attachmentKind === "video") {
      return attachmentUrl;
    }
    const variantUrl = pickBestFullVariant(attachmentVariants);
    return variantUrl ?? attachmentUrl;
  }, [attachmentKind, attachmentUrl, attachmentVariants, hasAttachment]);

  const vibeSuggestions = React.useMemo(() => {
    if (!displayAttachment || displayAttachment.status !== "ready" || !displayAttachment.url) {
      return [] as Array<{ label: string; prompt: string }>;
    }
    const isVideo = displayAttachment.mimeType.startsWith("video/");
    if (isVideo) {
      return [
        { label: "Summarize this clip", prompt: "Summarize this video and call out the key beats." },
        { label: "Suggest edits", prompt: "Suggest ways we could edit or enhance this video." },
        { label: "Prep a post", prompt: "Draft a social post that spotlights this video." },
      ];
    }
    return [
      { label: "Describe this image", prompt: "Describe this image in vivid detail." },
      { label: "Create a post", prompt: "Draft a social post that uses this image as the hero visual." },
      { label: "Edit ideas", prompt: "Suggest edits or variations for this image." },
    ];
  }, [displayAttachment]);

  const handleSuggestionSelect = React.useCallback(
    (promptValue: string) => {
      updateDraft({ content: promptValue });
      window.requestAnimationFrame(() => {
        promptInputRef.current?.focus();
      });
    },
    [updateDraft],
  );

  const quickPromptOptions = React.useMemo(() => {
    if (vibeSuggestions.length) {
      return vibeSuggestions;
    }
    return QUICK_PROMPT_PRESETS;
  }, [vibeSuggestions]);

  const memoryItems = React.useMemo<MemoryItem[]>(() => {
    if (_choices?.length) {
      return _choices.map((choice) => ({
        key: choice.key,
        label: choice.label,
        description: "Memory",
        prompt: null,
        kind: "choice" as const,
      }));
    }
    return DEFAULT_MEMORY_PRESETS.map((preset) => ({
      key: preset.key,
      label: preset.label,
      description: preset.description,
      prompt: preset.prompt,
      kind: "preset" as const,
    }));
  }, [_choices]);

  const accentClasses = [styles.memoryAccent1, styles.memoryAccent2, styles.memoryAccent3, styles.memoryAccent4];

  const handleMemorySelect = React.useCallback(
    (item: MemoryItem) => {
      if (item.kind === "choice") {
        if (onForceChoice) {
          onForceChoice(item.key);
        }
      } else if (item.prompt) {
        handleSuggestionSelect(item.prompt);
      }
      closeMobileRail();
    },
    [closeMobileRail, handleSuggestionSelect, onForceChoice],
  );

  const handleMemoryShortcut = React.useCallback(() => {
    if (!memoryItems.length) return;
    handleMemorySelect(memoryItems[0]);
  }, [handleMemorySelect, memoryItems]);

  const handlePromptSubmit = React.useCallback(() => {
    if (!onPrompt) return;
    if (loading || attachmentUploading) return;
    const trimmed = (workingDraft.content ?? "").trim();
    if (!trimmed) return;

    let attachments: PrompterAttachment[] | null = null;
    if (readyAttachment?.url) {
      attachments = [
        {
          id: readyAttachment.id,
          name: readyAttachment.name,
          mimeType: readyAttachment.mimeType,
          size: readyAttachment.size,
          url: readyAttachment.url,
          thumbnailUrl: readyAttachment.thumbUrl ?? undefined,
          storageKey: readyAttachment.key ?? null,
          sessionId: readyAttachment.sessionId ?? null,
        },
      ];
    }

    void onPrompt(trimmed, attachments);
  }, [attachmentUploading, loading, onPrompt, readyAttachment, workingDraft.content]);

  const showVibePrompt = React.useMemo(
    () =>
      Boolean(
        displayAttachment &&
          displayAttachment.status === "ready" &&
          !attachmentUploading &&
          !loading &&
          !message,
      ),
    [displayAttachment, attachmentUploading, loading, message],
  );

  React.useEffect(() => {
    if (!readyAttachment?.url) return;
    if (readyAttachment.url === workingDraft.mediaUrl) return;
    const nextKind = readyAttachment.mimeType.startsWith("video/") ? "video" : "image";
    const currentKind = (workingDraft.kind ?? "text").toLowerCase();
    const partial: Partial<ComposerDraft> = {
      mediaUrl: readyAttachment.url,
      mediaPrompt: null,
    };
    if (currentKind === "text" || currentKind === "image" || currentKind === "video" || !currentKind) {
      partial.kind = nextKind;
    }
    updateDraft(partial);
  }, [readyAttachment, updateDraft, workingDraft.kind, workingDraft.mediaUrl]);

  React.useEffect(() => {
    if (attachment && attachment.status === "uploading" && workingDraft.mediaUrl) {
      const currentKind = (workingDraft.kind ?? "text").toLowerCase();
      const partial: Partial<ComposerDraft> = {
        mediaUrl: null,
        mediaPrompt: null,
      };
      if (currentKind === "image" || currentKind === "video") {
        partial.kind = "text";
      }
      updateDraft(partial);
    }
  }, [attachment, updateDraft, workingDraft.kind, workingDraft.mediaUrl]);

  const handleRemoveAttachment = React.useCallback(() => {
    const currentKind = (workingDraft.kind ?? "text").toLowerCase();
    const partial: Partial<ComposerDraft> = {
      mediaUrl: null,
      mediaPrompt: null,
    };
    if (currentKind === "image" || currentKind === "video") {
      partial.kind = "text";
    }
    updateDraft(partial);
    clearAttachment();
  }, [clearAttachment, updateDraft, workingDraft.kind]);

  const draftReady = isComposerDraftReady(workingDraft);
  const canPost = draftReady && !attachmentUploading && !loading;

  const showWelcomeMessage = !message;
  const promptPlaceholder = "Describe your banner or a vibe...";
  const footerHint = "Upload an image, pick a memory, or describe a new banner below.";

  const leftRail = (
    <div className={styles.memoryRail}>
      <header className={styles.memoryHeader}>
        <div className={styles.memoryHeaderTop}>
          <span className={styles.memoryTitle}>Recent</span>
          <button type="button" className={styles.memoryLinkBtn}>
            View all memories
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
        <p className={styles.memorySubtitle}>Quickly reuse what you or Capsule AI picked last.</p>
      </header>
      {memoryItems.length ? (
        <ol className={styles.memoryList}>
          {memoryItems.map((item, index) => {
            const accent = accentClasses[index % accentClasses.length];
            const disabled = item.kind === "choice" && !onForceChoice;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={styles.memoryCard}
                  onClick={() => handleMemorySelect(item)}
                  disabled={disabled}
                >
                  <span className={`${styles.memoryThumb} ${accent}`} aria-hidden="true">
                    <Sparkle size={18} weight="fill" />
                  </span>
                  <span className={styles.memoryMeta}>
                    <span className={styles.memoryName}>{item.label}</span>
                    <span className={styles.memoryType}>{item.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.memoryEmpty}>No memories yet</div>
      )}
    </div>
  );

  const mainContent = (
    <>
      <div className={styles.chatArea}>
        <div className={styles.chatIntro}>
          <span className={styles.chatBadge}>AI</span>
        </div>
        <div className={styles.chatScroll}>
          <ol className={styles.chatList}>
            {showWelcomeMessage ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble}`}>{PANEL_WELCOME}</div>
              </li>
            ) : null}

          {prompt ? (
            <li className={styles.msgRow} data-role="user">
              <div className={`${styles.msgBubble} ${styles.userBubble}`}>{prompt}</div>
            </li>
          ) : null}

          {displayAttachment ? (
            <AttachmentPanel
              attachment={displayAttachment}
              kind={attachmentKind}
              statusLabel={attachmentStatusLabel}
              displayUrl={attachmentDisplayUrl}
              progressPct={attachmentProgressPct}
              loading={loading}
              uploading={attachmentUploading}
              onRemove={handleRemoveAttachment}
              onOpenViewer={openViewer}
            />
          ) : null}

          {showVibePrompt ? (
            <li className={styles.msgRow} data-role="ai">
              <div className={`${styles.msgBubble} ${styles.aiBubble} ${styles.attachmentPromptBubble}`}>
                <p className={styles.attachmentPromptIntro}>
                  I&rsquo;m ready to help with this{" "}
                  {displayAttachment?.mimeType.startsWith("video/") ? "video" : "image"}. What should we do next?
                </p>
                <div className={styles.vibeActions}>
                  {vibeSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.prompt}
                      type="button"
                      className={styles.vibeAction}
                      onClick={() => handleSuggestionSelect(suggestion.prompt)}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ) : null}

          {message ? (
            <li className={styles.msgRow} data-role="ai">
              <div className={`${styles.msgBubble} ${styles.aiBubble}`}>{message}</div>
            </li>
          ) : null}

          {loading ? (
            <li className={styles.msgRow} data-role="ai">
              <div className={`${styles.msgBubble} ${styles.aiBubble} ${styles.streaming}`} aria-live="polite">
                <span className={styles.streamDot} />
                <span className={styles.streamDot} />
                <span className={styles.streamDot} />
              </div>
            </li>
          ) : null}
          </ol>
        </div>
      </div>

      <div className={styles.composerBottom}>
        <div className={styles.promptSurface}>
          <button
            type="button"
            className={styles.promptIconBtn}
            aria-label="Attach file"
            onClick={handleAttachClick}
            disabled={loading || attachmentUploading}
          >
            <Paperclip size={18} weight="duotone" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className={styles.hiddenFileInput}
            onChange={handleAttachmentSelect}
            disabled={loading || attachmentUploading}
          />
          <input
            ref={promptInputRef}
            className={styles.promptInput}
            placeholder={promptPlaceholder}
            value={workingDraft.content}
            onChange={(e) => updateDraft({ content: e.target.value })}
            disabled={loading}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handlePromptSubmit();
              }
            }}
          />
          <VoiceRecorder
            isActive={voiceControls.isActive}
            status={voiceControls.status}
            buttonLabel={voiceControls.buttonLabel}
            buttonDisabled={voiceControls.buttonDisabled}
            onToggle={voiceControls.toggle}
            errorMessage={voiceControls.errorMessage}
          />
          <button
            type="button"
            className={styles.promptGenerateBtn}
            onClick={handlePromptSubmit}
            disabled={loading || attachmentUploading || !workingDraft.content.trim()}
          >
            <span className={styles.generateIcon}>
              <Sparkle size={16} weight="fill" />
            </span>
            <span className={styles.generateLabel}>Generate</span>
            <CaretDown size={14} weight="bold" />
          </button>
        </div>

        {voiceControls.hint ? (
          <div
            className={styles.voiceStatus}
            data-state={voiceControls.hintState ?? undefined}
            role="status"
            aria-live="polite"
          >
            {voiceControls.hint}
          </div>
        ) : null}

        <div className={styles.promptPresets}>
          {quickPromptOptions.map((option) => (
            <button
              key={option.prompt}
              type="button"
              className={styles.promptPresetBtn}
              onClick={() => handleSuggestionSelect(option.prompt)}
            >
              {option.label}
            </button>
          ))}
        </div>

      </div>
    </>
  );

  const previewContent = (
    <PreviewColumn title="Preview">
      <div className={styles.previewCanvas}>
        <div className={styles.previewCard}>
          <span className={styles.previewGlyph}>
            <Sparkle size={28} weight="fill" />
          </span>
          <p className={styles.previewCopy}>Start by chatting with Capsule AI or choosing an image.</p>
        </div>
        <div className={styles.previewActions}>
          <button
            type="button"
            className={styles.previewActionPrimary}
            onClick={handleAttachClick}
            disabled={loading || attachmentUploading}
          >
            Upload image
          </button>
          <button type="button" className={styles.previewActionSecondary} onClick={handleMemoryShortcut}>
            Memory
          </button>
        </div>
      </div>
    </PreviewColumn>
  );

  const mobileMenu = (
    <div className={`${contextMenuStyles.menu} ${styles.mobileRailMenu}`} role="menu">
      <button type="button" className={contextMenuStyles.item}>
        New Chat
      </button>
      <div className={contextMenuStyles.separator} />
      <div className={contextMenuStyles.sectionLabel}>Active Drafts</div>
      <div className={styles.menuEmpty}>No active drafts</div>
      <div className={contextMenuStyles.separator} />
      <div className={contextMenuStyles.sectionLabel}>Projects</div>
      <div className={styles.menuEmpty}>No projects yet</div>
    </div>
  );

  const startLeftResize = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      actions.layout.setDrag({ kind: "left", startX: event.clientX, start: layout.leftWidth });
    },
    [actions, layout.leftWidth],
  );

  const startRightResize = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      actions.layout.setDrag({ kind: "right", startX: event.clientX, start: layout.rightWidth });
    },
    [actions, layout.rightWidth],
  );

  const startBottomResize = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      actions.layout.setDrag({ kind: "bottom", startY: event.clientY, start: layout.bottomHeight });
    },
    [actions, layout.bottomHeight],
  );

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} />
      <aside className={styles.panel} role="dialog" aria-label="AI Composer">
        <button
          type="button"
          className={styles.closeIcon}
          onClick={onClose}
          disabled={loading}
          aria-label="Close composer"
        >
          <X size={18} weight="bold" />
        </button>

        <header className={styles.panelHeader}>
          <div className={styles.panelTitleGroup}>
            <h2 className={styles.panelTitle}>Design your Capsule banner</h2>
            <p className={styles.panelSubtitle}>
              Chat with Capsule AI, pick from memories, or upload brand visuals to set your capsule banner.
            </p>
          </div>
        </header>

        <div className={styles.panelBody}>
          <ComposerLayout
            columnsRef={columnsRef}
            mainRef={mainRef}
            layout={layout}
            previewOpen={previewOpen}
            leftRail={leftRail}
            mainContent={mainContent}
            previewContent={previewContent}
            mobileRailOpen={mobileRailOpen}
            onToggleMobileRail={() => actions.setMobileRailOpen(!mobileRailOpen)}
            mobileMenu={mobileMenu}
            onLeftResizeStart={startLeftResize}
            onRightResizeStart={startRightResize}
            onBottomResizeStart={startBottomResize}
          />
        </div>

        <footer className={styles.panelFooter}>
          <div className={styles.footerLeft}>
            <p className={styles.footerHint}>{footerHint}</p>
            <label className={styles.privacyGroup}>
              <span className={styles.privacyLabel}>Visibility</span>
              <select
                aria-label="Visibility"
                className={styles.privacySelect}
                value={privacy}
                onChange={(e) => actions.setPrivacy((e.target.value as ComposerFormState["privacy"]) ?? "public")}
                disabled={loading}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </label>
          </div>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.cancelAction}
              onClick={onClose}
              disabled={loading || attachmentUploading}
            >
              Cancel
            </button>
            <button type="button" className={styles.primaryAction} onClick={onPost} disabled={!canPost}>
              Save banner
            </button>
          </div>
        </footer>

        {viewerOpen && displayAttachment && displayAttachment.status === "ready" ? (
          <div className={homeStyles.lightboxOverlay} role="dialog" aria-modal="true" onClick={closeViewer}>
            <div className={homeStyles.lightboxContent} onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className={homeStyles.lightboxClose}
                aria-label="Close preview"
                onClick={closeViewer}
              >
                <X size={18} weight="bold" />
              </button>
              <div className={homeStyles.lightboxBody}>
                <div className={homeStyles.lightboxMedia}>
                  {attachmentKind === "video" ? (
                    <video className={homeStyles.lightboxVideo} src={attachmentFullUrl ?? undefined} controls autoPlay />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      className={homeStyles.lightboxImage}
                      src={attachmentFullUrl ?? attachmentDisplayUrl ?? attachmentPreviewUrl ?? undefined}
                      alt={displayAttachment.name}
                    />
                  )}
                </div>
                <div className={homeStyles.lightboxCaption}>{displayAttachment.name}</div>
              </div>
              <div className={styles.viewerActions}>
                {vibeSuggestions.map((suggestion) => (
                  <button
                    key={`viewer-${suggestion.prompt}`}
                    type="button"
                    className={styles.viewerActionBtn}
                    onClick={() => {
                      handleSuggestionSelect(suggestion.prompt);
                      closeViewer();
                    }}
                  >
                    {suggestion.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.viewerRemoveBtn}
                  onClick={() => {
                    handleRemoveAttachment();
                    closeViewer();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
