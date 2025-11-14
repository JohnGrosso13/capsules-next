"use client";

import * as React from "react";

import styles from "../../ai-composer.module.css";
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
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import type { LocalAttachment } from "@/hooks/useAttachmentUpload";
import type { ComposerVideoStatus, ClarifierPrompt } from "../types";
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
  clarifier: ClarifierPrompt | null;
  onClarifierRespond?: (answer: string) => void;
  loading: boolean;
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
};

const AI_ATTACHMENT_FEEDBACK_PROMPT =
  "How does this look? Want me to refine anything or try another variation?";

export function PromptPane({
  summaryControls,
  history,
  showWelcomeMessage,
  welcomeMessage,
  prompt,
  message,
  clarifier,
  onClarifierRespond,
  loading,
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
}: PromptPaneProps) {
  const chatScrollRef = React.useRef<HTMLDivElement | null>(null);
  const shouldStickRef = React.useRef(true);
  const resolvedAttachmentKind =
    attachmentKind === "video" ? "video" : attachmentKind === "image" ? "image" : null;
  const trimmedAssistantMessage = typeof message === "string" ? message.trim() : "";
  const isAiAttachment = displayAttachment?.source === "ai";
  const attachmentCaption = isAiAttachment
    ? trimmedAssistantMessage || displayAttachment?.name?.trim() || null
    : null;
  const attachmentFollowUp =
    attachmentCaption && displayAttachment ? AI_ATTACHMENT_FEEDBACK_PROMPT : null;

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
    clarifier?.questionId,
    showVibePrompt,
    showQuickPromptBubble,
  ]);

  return (
    <>
      <div className={styles.chatArea}>
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

            {history.length
              ? history.map((entry, index) => {
                  const role = entry.role === "user" ? "user" : "ai";
                  const bubbleClass =
                    role === "user"
                      ? `${styles.msgBubble} ${styles.userBubble}`
                      : `${styles.msgBubble} ${styles.aiBubble}`;
                  const key = entry.id || `${role}-${index}`;
                  const attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
                  return (
                    <li key={key} className={styles.msgRow} data-role={role}>
                      <div className={bubbleClass}>
                        <div className={styles.chatMessageText}>{entry.content}</div>
                        {attachments.length ? (
                          <div className={styles.chatAttachmentList}>
                            {attachments.map((attachment) => {
                              const attachmentKey = attachment.id || `${key}-${attachment.name}`;
                              const mimeType = (attachment.mimeType ?? "").toLowerCase();
                              const isImage = mimeType.startsWith("image/");
                              const previewSrc = attachment.thumbnailUrl ?? attachment.url ?? null;
                              const hasUrl =
                                typeof attachment.url === "string" && attachment.url.length > 0;
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
                                    <span className={styles.chatAttachmentLabel}>
                                      {attachment.name}
                                    </span>
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
                        ) : null}
                      </div>
                    </li>
                  );
                })
              : null}

            {!history.length && prompt ? (
              <li className={styles.msgRow} data-role="user">
                <div className={`${styles.msgBubble} ${styles.userBubble}`}>{prompt}</div>
              </li>
            ) : null}

            {displayAttachment ? (
              <AttachmentPanel
                attachment={displayAttachment}
                kind={resolvedAttachmentKind}
                statusLabel={attachmentStatusLabel}
                displayUrl={attachmentDisplayUrl}
                progressPct={attachmentProgressPct}
                loading={loading}
                uploading={attachmentUploading}
                onRemove={onRemoveAttachment}
                onOpenViewer={onOpenAttachmentViewer}
                caption={attachmentCaption}
              />
            ) : null}

            {attachmentFollowUp ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble}`}>
                  {attachmentFollowUp}
                </div>
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

            {clarifier ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble} ${styles.clarifierBubble}`}>
                  <p className={styles.clarifierHeading}>{clarifier.question}</p>
                  {clarifier.rationale ? (
                    <p className={styles.clarifierRationale}>{clarifier.rationale}</p>
                  ) : null}
                  {clarifier.styleTraits.length ? (
                    <div className={styles.clarifierTraits}>
                      {clarifier.styleTraits.map((trait) => (
                        <span key={`${clarifier.questionId}-${trait}`} className={styles.clarifierTrait}>
                          {trait}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {clarifier.suggestions.length ? (
                    <div className={styles.clarifierSuggestions}>
                      {clarifier.suggestions.map((suggestion) => (
                        <button
                          key={`${clarifier.questionId}-${suggestion}`}
                          type="button"
                          className={styles.clarifierSuggestion}
                          onClick={() => onClarifierRespond?.(suggestion)}
                          disabled={loading}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
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

            {!history.length && message && !clarifier ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble}`}>{message}</div>
              </li>
            ) : null}

            {loading ? (
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
