 "use client";

import * as React from "react";

import styles from "../styles";
import summaryStyles from "../styles/composer-summary.module.css";
import { SummaryContextPanel } from "../components/SummaryContextPanel";
import { SummaryNarrativeCard } from "../components/SummaryNarrativeCard";
import { AttachmentPanel } from "../components/AttachmentPanel";
import { PromptSurface } from "../components/PromptSurface";

import type { SummaryResult } from "@/types/summary";
import type {
  SummaryConversationEntry,
  SummaryPresentationOptions,
} from "@/lib/composer/summary-context";
import type { ComposerChatAttachment, ComposerChatMessage } from "@/lib/composer/chat-types";
import type { LocalAttachment } from "@/hooks/useAttachmentUpload";
import type { ComposerVideoStatus } from "../types";
import type { QuickPromptOption } from "../features/prompt-surface/usePromptSurface";

type SummaryControls = {
  entries: SummaryConversationEntry[];
  collapsed: boolean;
  panelOpen: boolean;
  onPanelToggle(): void;
  onReset(): void;
  result: SummaryResult | null;
  options: SummaryPresentationOptions | null;
  previewEntry: SummaryConversationEntry | null;
  onSelectPreviewEntry(entry: SummaryConversationEntry | null): void;
  onAsk(entry: SummaryConversationEntry): void;
  onComment(entry: SummaryConversationEntry): void;
  onView(entry: SummaryConversationEntry): void;
};

type PromptSurfaceExternalProps = React.ComponentProps<typeof PromptSurface>;

export type PromptPaneSurfaceProps = PromptSurfaceExternalProps;

export type PromptPaneProps = {
  summaryControls: SummaryControls;
  history: ComposerChatMessage[];
  showWelcomeMessage: boolean;
  welcomeMessage: string;
  prompt: string;
  message: string | null | undefined;
  loading: boolean;
  loadingKind: "image" | "video" | null;
  displayAttachment: LocalAttachment | null;
  attachmentKind: string | null;
  attachmentStatusLabel: string | null;
  attachmentDisplayUrl: string | null;
  attachmentProgressPct: number;
  attachmentUploading: boolean;
  onRemoveAttachment(): void;
  onOpenAttachmentViewer(): void;
  videoStatus: ComposerVideoStatus;
  onRetryVideo(): void;
  showVibePrompt: boolean;
  vibeSuggestions: Array<{ label: string; prompt: string }>;
  onSuggestionSelect(prompt: string): void;
  showQuickPromptBubble: boolean;
  quickPromptBubbleOptions: QuickPromptOption[];
  promptSurfaceProps: PromptPaneSurfaceProps;
  onAddAttachmentToPreview?: (attachment: ComposerChatAttachment) => void;
  canRetryLastPrompt: boolean;
  onRetryLastPrompt(): void;
  smartContextEnabled: boolean;
  onEnableContext?(): void;
};

const AI_ATTACHMENT_FEEDBACK_PROMPT =
  "How does this look? Want me to refine anything or try another variation?";

const IMAGE_EXTENSION_RE = /\.(apng|avif|bmp|gif|jpe?g|jfif|pjpeg|pjp|png|svg|webp)$/i;

function hasImageLikeExtension(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const normalized = url.split("?")[0]?.toLowerCase() ?? "";
  return IMAGE_EXTENSION_RE.test(normalized);
}

function isImageAttachment(
  attachment: ComposerChatAttachment | null | undefined,
): attachment is ComposerChatAttachment {
  if (!attachment) return false;
  const mime = (attachment.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (hasImageLikeExtension(attachment.url)) return true;
  if (hasImageLikeExtension(attachment.thumbnailUrl)) return true;
  return false;
}

function isGeneratedImageAttachment(
  attachment: ComposerChatAttachment | null | undefined,
): attachment is ComposerChatAttachment {
  if (!isImageAttachment(attachment)) return false;
  const role = (attachment.role ?? "").toLowerCase();
  const source = (attachment.source ?? "").toLowerCase();
  return role === "output" || source === "ai";
}

function partitionAttachments(
  attachments: ComposerChatAttachment[] | null | undefined,
): {
  imageAttachments: Array<{ attachment: ComposerChatAttachment; generated: boolean }>;
  inlineAttachments: ComposerChatAttachment[];
} {
  const imageAttachments: Array<{ attachment: ComposerChatAttachment; generated: boolean }> = [];
  const inlineAttachments: ComposerChatAttachment[] = [];
  if (!Array.isArray(attachments)) return { imageAttachments, inlineAttachments };
  attachments.forEach((attachment) => {
    if (isImageAttachment(attachment)) {
      imageAttachments.push({ attachment, generated: isGeneratedImageAttachment(attachment) });
    } else {
      inlineAttachments.push(attachment);
    }
  });
  return { imageAttachments, inlineAttachments };
}

export function PromptPane({
  summaryControls,
  history,
  showWelcomeMessage,
  welcomeMessage,
  prompt,
  message,
  loading,
  loadingKind,
  displayAttachment,
  attachmentKind,
  attachmentStatusLabel,
  attachmentDisplayUrl,
  attachmentProgressPct,
  attachmentUploading,
  onRemoveAttachment,
  onOpenAttachmentViewer,
  videoStatus,
  onRetryVideo,
  showVibePrompt,
  vibeSuggestions,
  onSuggestionSelect,
  showQuickPromptBubble,
  quickPromptBubbleOptions,
  promptSurfaceProps,
  onAddAttachmentToPreview,
  canRetryLastPrompt,
  onRetryLastPrompt,
  smartContextEnabled,
  onEnableContext,
}: PromptPaneProps) {
  const chatScrollRef = React.useRef<HTMLDivElement | null>(null);
  const shouldStickRef = React.useRef(true);
  const isLoadingImage = loading && loadingKind === "image";
  const [brainProgress, setBrainProgress] = React.useState(0);
  React.useEffect(() => {
    if (!isLoadingImage) {
      setBrainProgress(0);
      return undefined;
    }
    const startedAt = Date.now();
    setBrainProgress((prev) => (prev > 8 ? prev : 12));
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const eased = Math.min(96, Math.max(12, Math.round(elapsed / 900) * 5 + 12));
      setBrainProgress(eased);
    }, 900);
    return () => window.clearInterval(interval);
  }, [isLoadingImage]);

  const pendingImageAttachment = React.useMemo<LocalAttachment | null>(
    () =>
      isLoadingImage
        ? {
            id: "ai-image-pending",
            name: "Rendering visual",
            size: 0,
            mimeType: "image/*",
            status: "uploading",
            url: null,
            thumbUrl: null,
            progress: Math.max(brainProgress, 8) / 100,
            role: "output",
            source: "ai",
            phase: "uploading",
          }
        : null,
    [brainProgress, isLoadingImage],
  );

  const activeAttachment = pendingImageAttachment ?? displayAttachment;
  const resolvedAttachmentKind =
    activeAttachment?.mimeType?.toLowerCase().startsWith("video/") || attachmentKind === "video"
      ? "video"
      : activeAttachment || attachmentKind === "image"
        ? "image"
        : null;
  const trimmedAssistantMessage = typeof message === "string" ? message.trim() : "";
  const isAiAttachment = activeAttachment?.source === "ai";
  const baseAttachmentCaption = isAiAttachment
    ? trimmedAssistantMessage || activeAttachment?.name?.trim() || null
    : null;
  const attachmentCaption =
    baseAttachmentCaption && activeAttachment
      ? `${baseAttachmentCaption} ${AI_ATTACHMENT_FEEDBACK_PROMPT}`
      : baseAttachmentCaption;
  const attachmentCaptionForPanel =
    activeAttachment?.status === "ready" ? attachmentCaption : null;
  const filteredHistory = history;
  const lastUserIndex = React.useMemo(() => {
    for (let index = filteredHistory.length - 1; index >= 0; index -= 1) {
      if (filteredHistory[index]?.role === "user") {
        return index;
      }
    }
    return -1;
  }, [filteredHistory]);
  const historyBeforeAttachment =
    !activeAttachment || isAiAttachment || lastUserIndex === -1
      ? filteredHistory
      : filteredHistory.slice(0, lastUserIndex + 1);
  const historyAfterAttachment =
    !activeAttachment || isAiAttachment || lastUserIndex === -1
      ? []
      : filteredHistory.slice(lastUserIndex + 1);

  React.useEffect(() => {
    const scrollNode = chatScrollRef.current;
    if (!scrollNode) return;

    const handleScroll = () => {
      const distanceFromBottom =
        scrollNode.scrollHeight - scrollNode.scrollTop - scrollNode.clientHeight;
      shouldStickRef.current = distanceFromBottom < 120;
    };

    scrollNode.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => {
      scrollNode.removeEventListener("scroll", handleScroll);
    };
  }, []);

  React.useEffect(() => {
    const scrollNode = chatScrollRef.current;
    if (!scrollNode || !shouldStickRef.current) return;
    scrollNode.scrollTo({ top: scrollNode.scrollHeight, behavior: "smooth" });
  }, [
    history.length,
    message,
    displayAttachment?.id,
    attachmentKind,
    videoStatus.state,
    showVibePrompt,
    showQuickPromptBubble,
  ]);

  const renderInlineAttachments = React.useCallback(
    (attachments: ComposerChatAttachment[], keyPrefix: string) => (
      <div className={styles.chatAttachmentList}>
        {attachments.map((attachment, attachmentIndex) => {
          const attachmentKey = attachment.id || `${keyPrefix}-${attachmentIndex}`;
          const mimeType = (attachment.mimeType ?? "").toLowerCase();
          const isImage = mimeType.startsWith("image/");
          const previewSrc = attachment.thumbnailUrl ?? attachment.url ?? null;
          const hasUrl = typeof attachment.url === "string" && attachment.url.length > 0;
          return (
            <div key={attachmentKey} className={styles.chatAttachmentCard}>
              <a
                href={hasUrl ? attachment.url : undefined}
                target={hasUrl ? "_blank" : undefined}
                rel={hasUrl ? "noreferrer" : undefined}
                className={styles.chatAttachmentLink}
                aria-disabled={hasUrl ? undefined : "true"}
                onClick={
                  hasUrl
                    ? undefined
                    : (event) => {
                        event.preventDefault();
                      }
                }
              >
                {isImage && previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt={attachment.name}
                    className={styles.chatAttachmentPreview}
                  />
                ) : null}
                <span className={styles.chatAttachmentLabel}>{attachment.name}</span>
              </a>
              <div className={styles.chatAttachmentActions}>
                {hasUrl ? (
                  <a
                    className={styles.chatAttachmentActionBtn}
                    href={attachment.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    Download
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    ),
    [],
  );

  const renderChatEntries = React.useCallback(
    (entries: ComposerChatMessage[], keyPrefix: string) =>
      entries.map((entry, index) => {
        const role = entry.role === "user" ? "user" : "ai";
        const bubbleClass =
          role === "user"
            ? `${styles.msgBubble} ${styles.userBubble}`
            : `${styles.msgBubble} ${styles.aiBubble}`;
        const key = entry.id || `${keyPrefix}-${role}-${index}`;
        const { imageAttachments, inlineAttachments } = partitionAttachments(
          Array.isArray(entry.attachments) ? entry.attachments : [],
        );
        const messageText = typeof entry.content === "string" ? entry.content.trim() : "";
        const showBubble =
          role === "user" ||
          inlineAttachments.length > 0 ||
          (!imageAttachments.length && messageText.length > 0);
        const inlineAttachmentNode =
          inlineAttachments.length > 0 ? renderInlineAttachments(inlineAttachments, key) : null;
        const bubbleNode = showBubble ? (
          <div className={bubbleClass}>
            {messageText ? <div className={styles.chatMessageText}>{entry.content}</div> : null}
            {inlineAttachmentNode}
          </div>
        ) : null;

        const generatedNodes =
          imageAttachments.length > 0
            ? imageAttachments.map(({ attachment, generated }, attachmentIndex) => {
                const attachmentKey = `${key}-gen-${attachment.id || attachmentIndex}`;
                const previewSrc =
                  (typeof attachment.url === "string" && attachment.url.trim().length
                    ? attachment.url.trim()
                    : null) ??
                  (typeof attachment.thumbnailUrl === "string" && attachment.thumbnailUrl.trim().length
                    ? attachment.thumbnailUrl.trim()
                    : null);
                if (!previewSrc) return null;
                const defaultCaption = generated ? "Generated visual" : "Attached image";
                const generatedCaption =
                  attachment.excerpt?.trim() ||
                  (!showBubble ? messageText : "") ||
                  attachment.name ||
                  defaultCaption;
                const helperLabel =
                  attachment.name && generatedCaption !== attachment.name ? attachment.name : null;
                const canAddToPreview =
                  typeof onAddAttachmentToPreview === "function" &&
                  typeof attachment.url === "string" &&
                  attachment.url.trim().length > 0;
                return (
                  <div key={attachmentKey} className={styles.chatGeneratedAttachment}>
                    <div className={styles.chatGeneratedMediaWrap}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewSrc}
                        alt={attachment.name || defaultCaption}
                        className={styles.chatGeneratedMedia}
                      />
                    </div>
                    <div className={styles.chatGeneratedMeta}>
                      <div className={styles.chatGeneratedText}>
                        {generatedCaption ? <p>{generatedCaption}</p> : null}
                        {helperLabel ? (
                          <span className={styles.chatGeneratedSubdued}>{helperLabel}</span>
                        ) : null}
                      </div>
                      <div className={styles.chatGeneratedActions}>
                        {attachment.url ? (
                          <a
                            className={`${styles.chatGeneratedButton} ${styles.chatGeneratedGhost}`.trim()}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            download
                          >
                            Download
                          </a>
                        ) : null}
                        {canAddToPreview ? (
                          <button
                            type="button"
                            className={`${styles.chatGeneratedButton} ${styles.chatGeneratedPrimary}`.trim()}
                            onClick={() => onAddAttachmentToPreview?.(attachment)}
                          >
                            Add to preview
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            : null;

        return (
          <li key={key} className={styles.msgRow} data-role={role}>
            {bubbleNode}
            {generatedNodes}
          </li>
        );
      }),
    [onAddAttachmentToPreview, renderInlineAttachments],
  );

  return (
    <>
      <div className={styles.chatArea}>
        {!smartContextEnabled ? (
          <div className={styles.contextNotice} role="status" aria-live="polite">
            <div>
              <p className={styles.contextNoticeTitle}>Smart Context is off</p>
              <p className={styles.contextNoticeCopy}>
                Replies won&apos;t use your feed or memories until you turn it on.
              </p>
            </div>
            <button
              type="button"
              className={styles.contextNoticeButton}
              onClick={() => onEnableContext?.()}
            >
              Turn on context
            </button>
          </div>
        ) : null}
        {!loading && canRetryLastPrompt ? (
          <div className={styles.retryBanner}>
            <div>
              <p className={styles.retryTitle}>Something went wrong</p>
              <p className={styles.retryCopy}>Retry your last request with the same details.</p>
            </div>
            <button type="button" className={styles.retryButton} onClick={onRetryLastPrompt}>
              Retry
            </button>
          </div>
        ) : null}
        {summaryControls.entries.length ? (
          summaryControls.collapsed ? (
            <div className={summaryStyles.summaryContextToggleRow}>
              <button
                type="button"
                className={summaryStyles.summaryContextToggleBtn}
                onClick={summaryControls.onReset}
              >
                Back to summaries
              </button>
            </div>
          ) : (
            <>
              <div className={summaryStyles.summaryContextToggleRow}>
                <button
                  type="button"
                  className={summaryStyles.summaryContextToggleBtn}
                  data-active={summaryControls.panelOpen ? "true" : undefined}
                  aria-expanded={summaryControls.panelOpen}
                  onClick={summaryControls.onPanelToggle}
                >
                  {summaryControls.panelOpen
                    ? "Hide referenced updates"
                    : `View referenced updates (${summaryControls.entries.length})`}
                </button>
              </div>
              {summaryControls.panelOpen ? (
                <SummaryContextPanel
                  entries={summaryControls.entries}
                  onAsk={summaryControls.onAsk}
                  onComment={summaryControls.onComment}
                  onView={summaryControls.onView}
                />
              ) : null}
            </>
          )
        ) : null}

        <div ref={chatScrollRef} className={styles.chatScroll}>
          {summaryControls.result && !summaryControls.collapsed ? (
            <SummaryNarrativeCard
              result={summaryControls.result}
              options={summaryControls.options}
              entries={summaryControls.entries}
              selectedEntry={summaryControls.previewEntry}
              onSelectEntry={summaryControls.onSelectPreviewEntry}
              onAsk={summaryControls.onAsk}
              onComment={summaryControls.onComment}
              onView={summaryControls.onView}
            />
          ) : null}

          <ol className={styles.chatList}>
            {showWelcomeMessage ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble}`}>{welcomeMessage}</div>
              </li>
            ) : null}

            {historyBeforeAttachment.length
              ? renderChatEntries(historyBeforeAttachment, "before")
              : null}

            {activeAttachment ? (
              <AttachmentPanel
                attachment={activeAttachment}
                kind={resolvedAttachmentKind}
                statusLabel={
                  pendingImageAttachment
                    ? "Generating your visual..."
                    : attachmentStatusLabel
                }
                displayUrl={
                  activeAttachment?.status === "ready" ? attachmentDisplayUrl : null
                }
                progressPct={
                  pendingImageAttachment
                    ? Math.round(Math.max(brainProgress, 8))
                    : attachmentProgressPct
                }
                loading={loading}
                uploading={attachmentUploading || Boolean(pendingImageAttachment)}
                onRemove={onRemoveAttachment}
                onOpenViewer={onOpenAttachmentViewer}
                caption={attachmentCaptionForPanel}
              />
            ) : null}

            {historyAfterAttachment.length
              ? renderChatEntries(historyAfterAttachment, "after")
              : null}

            {!history.length && prompt ? (
              <li className={styles.msgRow} data-role="user">
                <div className={`${styles.msgBubble} ${styles.userBubble}`}>{prompt}</div>
              </li>
            ) : null}

            {videoStatus.state === "running" ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble} ${styles.videoStatusBubble}`}>
                  <span className={styles.videoStatusSpinner} aria-hidden="true" />
                  <p>{videoStatus.message ?? "Rendering your clip..."}</p>
                </div>
              </li>
            ) : null}

            {videoStatus.state === "failed" ? (
              <li className={styles.msgRow} data-role="ai">
                <div
                  className={`${styles.msgBubble} ${styles.aiBubble} ${styles.videoStatusError}`}
                >
                  <p>{videoStatus.error ?? "We hit a snag while rendering that clip."}</p>
                  <div className={styles.videoStatusActions}>
                    <button type="button" className={styles.videoRetryButton} onClick={onRetryVideo}>
                      Try again
                    </button>
                  </div>
                </div>
              </li>
            ) : null}

            {showVibePrompt ? (
              <li className={styles.msgRow} data-role="ai">
                <div
                  className={`${styles.msgBubble} ${styles.aiBubble} ${styles.attachmentPromptBubble}`}
                >
                  <p className={styles.attachmentPromptIntro}>
                    Ready to vibe this {attachmentKind === "video" ? "clip" : "visual"} into something
                    new. What should we explore next?
                  </p>
                  <div className={styles.vibeActions}>
                    {vibeSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.prompt}
                        type="button"
                        className={styles.vibeAction}
                        onClick={() => onSuggestionSelect(suggestion.prompt)}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ) : null}

            {showQuickPromptBubble ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble} ${styles.quickPromptBubble}`}>
                  <p className={styles.quickPromptHeading}>
                    Want a head start? Tap a vibe and I&apos;ll riff from there.
                  </p>
                  <div className={styles.quickPromptChips}>
                    {quickPromptBubbleOptions.map((option, index) => (
                      <button
                        key={`${option.label}-${index}`}
                        type="button"
                        className={styles.quickPromptChip}
                        onClick={() => onSuggestionSelect(option.prompt)}
                        disabled={loading}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ) : null}

            {!history.length && message ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble}`}>{message}</div>
              </li>
            ) : null}

            {loading && !isLoadingImage ? (
              <li className={styles.msgRow} data-role="ai">
                <div
                  className={`${styles.msgBubble} ${styles.aiBubble} ${styles.streaming}`}
                  aria-live="polite"
                >
                  <span className={styles.streamDot} />
                  <span className={styles.streamDot} />
                  <span className={styles.streamDot} />
                </div>
              </li>
            ) : null}
          </ol>
        </div>
      </div>

      <PromptSurface {...promptSurfaceProps} />
    </>
  );
}
