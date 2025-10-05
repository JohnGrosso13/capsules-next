"use client";

import * as React from "react";
import styles from "../ai-composer.module.css";
import contextMenuStyles from "@/components/ui/context-menu.module.css";
import {
  X,
  Paperclip,
  Microphone,
  Brain,
  CaretDown,
  CaretRight,
  List,
  PaperPlaneRight,
} from "@phosphor-icons/react/dist/ssr";
import { useAttachmentUpload, type LocalAttachment } from "@/hooks/useAttachmentUpload";
import { isComposerDraftReady, type ComposerDraft } from "@/lib/composer/draft";

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

  const [privacy, setPrivacy] = React.useState<"public" | "private">("public");
  const [projectsOpen, setProjectsOpen] = React.useState(true);
  const [mobileRailOpen, setMobileRailOpen] = React.useState(false);

  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading: attachmentUploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
  } = useAttachmentUpload();

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

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900 && mobileRailOpen) {
        setMobileRailOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mobileRailOpen]);

  const draftReady = isComposerDraftReady(workingDraft);
  const canPost = draftReady && !attachmentUploading && !loading;

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

        <button
          type="button"
          className={styles.mobileRailTrigger}
          aria-label="Open composer menu"
          aria-haspopup="menu"
          aria-expanded={mobileRailOpen}
          onClick={() => setMobileRailOpen((v) => !v)}
        >
          <List size={18} weight="bold" />
        </button>

        <div className={styles.columns}>
          <aside className={styles.rail} aria-label="Conversation navigation">
            <div className={styles.railHeader}>
              <button type="button" className={styles.railPrimary}>New Chat</button>
            </div>
            <nav className={styles.railSection} aria-label="Active drafts">
              <div className={styles.railTitle}>Active Drafts</div>
              <div className={styles.railList}>
                <div className={styles.railEmpty}>No active drafts</div>
              </div>
            </nav>
            <div className={styles.railSection}>
              <button
                type="button"
                className={styles.railTitleBtn}
                onClick={() => setProjectsOpen((v) => !v)}
                aria-expanded={projectsOpen}
              >
                {projectsOpen ? (
                  <CaretDown size={16} weight="bold" />
                ) : (
                  <CaretRight size={16} weight="bold" />
                )}
                <span className={styles.railTitle}>Projects</span>
              </button>
              {projectsOpen ? (
                <div className={styles.railList}>
                  <div className={styles.railEmpty}>No projects yet</div>
                </div>
              ) : null}
            </div>
          </aside>

          <section className={styles.mainColumn} aria-label="Chat thread">
            <div className={styles.chatScroll}>
              <ol className={styles.chatList}>
                {prompt ? (
                  <li className={styles.msgRow} data-role="user">
                    <div className={`${styles.msgBubble} ${styles.userBubble}`}>{prompt}</div>
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

            <div className={styles.composerBottom}>
              <div className={styles.promptBar}>
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
                  className={styles.promptInput}
                  placeholder="Ask Capsule AI to create..."
                  value={workingDraft.content}
                  onChange={(e) => updateDraft({ content: e.target.value })}
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.promptSendBtn}
                  aria-label="Send message"
                  title="Send"
                  disabled={loading || attachmentUploading || !workingDraft.content.trim()}
                >
                  <PaperPlaneRight size={18} weight="fill" />
                </button>
                <button type="button" className={styles.promptIconBtn} aria-label="Voice input">
                  <Microphone size={18} weight="duotone" />
                </button>
              </div>

              {displayAttachment ? (
                <div className={styles.attachmentRow}>
                  <div className={styles.attachmentChip}>
                    <div className={styles.attachmentPreview}>
                      {attachmentPreviewUrl ? (
                        <img src={attachmentPreviewUrl} alt="Attachment preview" />
                      ) : (
                        <Paperclip size={16} weight="bold" />
                      )}
                    </div>
                    <div className={styles.attachmentMeta}>
                      <span className={styles.attachmentName} title={displayAttachment.name}>
                        {displayAttachment.name}
                      </span>
                      {attachmentStatusLabel ? (
                        <span
                          className={styles.attachmentStatus}
                          data-state={displayAttachment.status === "error" ? "error" : undefined}
                        >
                          {attachmentStatusLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.attachmentActions}>
                      <button
                        type="button"
                        className={styles.attachmentRemove}
                        onClick={handleRemoveAttachment}
                        disabled={loading || attachmentUploading}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={styles.intentControlsAlt}>
                <div className={styles.intentLeft}>
                  <Brain size={18} weight="duotone" />
                </div>
                <div className={styles.intentRight}>
                  <label className={styles.privacyGroup}>
                    {/* word intentionally removed; keep only dropdown */}
                    <select
                      aria-label="Visibility"
                      className={styles.privacySelect}
                      value={privacy}
                      onChange={(e) => setPrivacy((e.target.value as "public" | "private") ?? "public")}
                      disabled={loading}
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </label>
                  <div className={styles.composeActions}>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      disabled={loading}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      disabled={loading}
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      className={styles.postButton}
                      onClick={onPost}
                      disabled={!canPost}
                    >
                      Post
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {mobileRailOpen ? (
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
        ) : null}
      </aside>
    </div>
  );
}
