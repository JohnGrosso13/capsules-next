"use client";

import * as React from "react";
import styles from "../ai-composer.module.css";
import contextMenuStyles from "@/components/ui/context-menu.module.css";
import { X, Paperclip, Microphone, Brain, CaretDown, CaretRight, List } from "@phosphor-icons/react/dist/ssr";
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

  const [privacy, setPrivacy] = React.useState<"public" | "private">("public");
  const [projectsOpen, setProjectsOpen] = React.useState(true);
  const [mobileRailOpen, setMobileRailOpen] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900 && mobileRailOpen) {
        setMobileRailOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mobileRailOpen]);

  const canPost = isComposerDraftReady(workingDraft);

  const updateDraft = React.useCallback(
    (partial: Partial<ComposerDraft>) => {
      onChange({ ...workingDraft, ...partial });
    },
    [onChange, workingDraft],
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
                <button type="button" className={styles.promptIconBtn} aria-label="Attach file">
                  <Paperclip size={18} weight="duotone" />
                </button>
                <input
                  className={styles.promptInput}
                  placeholder="Ask Capsule AI to create..."
                  value={workingDraft.content}
                  onChange={(e) => updateDraft({ content: e.target.value })}
                  disabled={loading}
                />
                <button type="button" className={styles.promptIconBtn} aria-label="Voice input">
                  <Microphone size={18} weight="duotone" />
                </button>
              </div>

              <div className={styles.intentControlsAlt}>
                <div className={styles.intentLeft}>
                  <Brain size={18} weight="duotone" />
                </div>
                <div className={styles.intentRight}>
                  <label className={styles.privacyGroup}>
                    <span className={styles.privacyLabel}>Privacy</span>
                    <select
                      className={styles.privacySelect}
                      value={privacy}
                      onChange={(e) => setPrivacy((e.target.value as "public" | "private") ?? "public")}
                      disabled={loading}
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={styles.postButton}
                    onClick={onPost}
                    disabled={loading || !canPost}
                  >
                    Post
                  </button>
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
