"use client";

/* eslint-disable @next/next/no-img-element */

import React from "react";
import { createPortal } from "react-dom";

import styles from "./ai-composer.module.css";

export type ComposerDraft = {
  kind: string;
  title?: string | null;
  content: string;
  mediaUrl: string | null;
  mediaPrompt: string | null;
  poll?: { question: string; options: string[] } | null;
  suggestions?: string[];
};

type Choice = { key: string; label: string };

type AiComposerDrawerProps = {
  open: boolean;
  loading: boolean;
  draft: ComposerDraft | null;
  prompt: string;
  message?: string | null;
  choices?: Choice[] | null;
  onChange(draft: ComposerDraft): void;
  onClose(): void;
  onPost(): void;
  onForceChoice?(key: string): void;
};

function ensurePollStructure(input: ComposerDraft | null): { question: string; options: string[] } {
  if (!input) return { question: "", options: ["", ""] };
  const raw = input.poll && typeof input.poll === "object" ? { ...input.poll } : { question: "", options: [] };
  const question = typeof raw.question === "string" ? raw.question : "";
  let options = Array.isArray(raw.options) ? raw.options.map((value) => String(value ?? "")) : [];
  if (options.length < 2) {
    options = [...options, "", ""].slice(0, Math.max(2, options.length + 2));
  }
  return { question, options };
}

function isPostReady(draft: ComposerDraft | null): boolean {
  if (!draft) return false;
  const kind = (draft.kind ?? "text").toLowerCase();
  if (kind === "poll") {
    const poll = ensurePollStructure(draft);
    return poll.question.trim().length > 0 && poll.options.some((option) => option.trim().length > 0);
  }
  if (kind === "image" || kind === "video") {
    return Boolean(draft.mediaUrl && draft.mediaUrl.trim().length > 0);
  }
  return draft.content.trim().length > 0;
}

export function AiComposerDrawer({
  open,
  loading,
  draft,
  prompt,
  message,
  choices,
  onChange,
  onClose,
  onPost,
  onForceChoice,
}: AiComposerDrawerProps) {
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const [portalReady, setPortalReady] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const host = document.createElement("div");
    host.className = styles.portalHost;
    document.body.appendChild(host);
    portalRef.current = host;
    setPortalReady(true);

    return () => {
      if (portalRef.current) {
        document.body.removeChild(portalRef.current);
        portalRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!open || !portalReady) return;
    if (typeof window === "undefined") return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, portalReady]);

  React.useEffect(() => {
    if (!open || !portalReady) return;
    if (typeof document === "undefined") return;

    const { body } = document;
    const previousOverflow = body.style.overflow;

    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open, portalReady]);

  if (!portalReady || !open || !portalRef.current) {
    return null;
  }

  const portalTarget = portalRef.current;

  const pollDraft = draft && draft.kind?.toLowerCase() === "poll" ? ensurePollStructure(draft) : null;
  const canPost = isPostReady(draft);

  const handleKindChange = (nextKind: string) => {
    if (!draft) return;
    const normalized = nextKind.toLowerCase();
    const nextDraft: ComposerDraft = { ...draft, kind: normalized };
    if (normalized === "poll" && (!draft.poll || typeof draft.poll !== "object")) {
      nextDraft.poll = { question: "", options: ["", ""] };
    }
    if ((normalized === "image" || normalized === "video") && !draft.mediaUrl) {
      nextDraft.mediaUrl = "";
    }
    onChange(nextDraft);
  };

  const handlePollQuestionChange = (value: string) => {
    if (!draft) return;
    const poll = pollDraft ? { ...pollDraft } : { question: "", options: ["", ""] };
    poll.question = value;
    onChange({ ...draft, poll });
  };

  const handlePollOptionChange = (index: number, value: string) => {
    if (!draft || !pollDraft) return;
    const poll = { ...pollDraft, options: [...pollDraft.options] };
    if (index < 0 || index >= poll.options.length) return;
    poll.options[index] = value;
    onChange({ ...draft, poll });
  };

  const handleAddPollOption = () => {
    if (!draft) return;
    const poll = pollDraft ? { ...pollDraft, options: [...pollDraft.options, ""] } : { question: "", options: ["", "", ""] };
    onChange({ ...draft, poll });
  };

  const handleRemovePollOption = (index: number) => {
    if (!draft || !pollDraft) return;
    if (pollDraft.options.length <= 2) return;
    const poll = { ...pollDraft, options: pollDraft.options.filter((_, idx) => idx !== index) };
    onChange({ ...draft, poll });
  };

  function updateDraft(partial: Partial<ComposerDraft>) {
    if (!draft) return;
    onChange({ ...draft, ...partial });
  }

  const overlay = (
    <div className={styles.overlay} role="presentation">
      <div className={styles.backdrop} onClick={onClose} />
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Capsule AI Composer"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <div className={styles.headerLabel}>Capsule AI Composer</div>
            <div className={styles.promptLabel}>Prompt</div>
            <p className={styles.promptText}>{prompt}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close composer">
            ×
          </button>
        </header>

        {message ? <p className={styles.aiMessage}>{message}</p> : null}
        {choices && choices.length ? (
          <div className={styles.choiceGroup}>
            <div className={styles.choiceLabel}>Choose how to continue</div>
            <div className={styles.choiceButtons}>
              {choices.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  className={styles.choiceButton}
                  onClick={() => onForceChoice?.(choice.key)}
                  disabled={loading}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.body}>
          {draft ? (
            <>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Content Type</span>
                <select
                  className={styles.select}
                  value={draft.kind}
                  onChange={(event) => handleKindChange(event.target.value)}
                  disabled={loading}
                >
                  <option value="text">Text Post</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="poll">Poll</option>
                </select>
              </label>

              {(draft.kind === "text" || draft.kind === "post" || draft.kind === "image" || draft.kind === "video") ? (
                <label className={styles.fieldBlock}>
                  <span className={styles.fieldLabel}>Caption</span>
                  <textarea
                    className={styles.textArea}
                    value={draft.content}
                    onChange={(event) => updateDraft({ content: event.target.value })}
                    disabled={loading}
                    rows={6}
                    placeholder="What should your audience see?"
                  />
                </label>
              ) : null}

              {(draft.kind === "image" || draft.kind === "video") ? (
                <>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>{draft.kind === "video" ? "Video URL" : "Image URL"}</span>
                    <input
                      className={styles.input}
                      value={draft.mediaUrl ?? ""}
                      onChange={(event) => updateDraft({ mediaUrl: event.target.value })}
                      disabled={loading}
                      placeholder="https://..."
                    />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>AI Prompt / Alt Text</span>
                    <textarea
                      className={styles.textArea}
                      value={draft.mediaPrompt ?? ""}
                      onChange={(event) => updateDraft({ mediaPrompt: event.target.value })}
                      disabled={loading}
                      rows={4}
                      placeholder="Describe the visual or how it should change."
                    />
                  </label>
                  {draft.mediaUrl ? (
                    <div className={styles.previewBlock}>
                      {draft.kind === "image" ? (
                        <img src={draft.mediaUrl} alt="Draft preview" className={styles.previewImage} />
                      ) : (
                        <video className={styles.previewVideo} src={draft.mediaUrl} controls />
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}

              {pollDraft ? (
                <div className={styles.pollBlock}>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>Poll Question</span>
                    <input
                      className={styles.input}
                      value={pollDraft.question}
                      onChange={(event) => handlePollQuestionChange(event.target.value)}
                      disabled={loading}
                      placeholder="Ask your community..."
                    />
                  </label>
                  <div className={styles.optionList}>
                    {pollDraft.options.map((option, index) => (
                      <div key={index} className={styles.optionRow}>
                        <input
                          className={styles.input}
                          value={option}
                          onChange={(event) => handlePollOptionChange(index, event.target.value)}
                          disabled={loading}
                          placeholder={`Option ${index + 1}`}
                        />
                        {pollDraft.options.length > 2 ? (
                          <button
                            type="button"
                            className={styles.optionRemove}
                            onClick={() => handleRemovePollOption(index)}
                            disabled={loading}
                            aria-label={`Remove option ${index + 1}`}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.addOption} onClick={handleAddPollOption} disabled={loading}>
                    Add option
                  </button>
                </div>
              ) : null}

              {draft.suggestions && draft.suggestions.length ? (
                <div className={styles.suggestionBlock}>
                  <div className={styles.fieldLabel}>Suggestions</div>
                  <div className={styles.suggestionChips}>
                    {draft.suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion}-${index}`}
                        type="button"
                        className={styles.suggestionChip}
                        onClick={() => updateDraft({ content: suggestion })}
                        disabled={loading}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.placeholder}>Capsule AI is preparing a draft…</div>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={loading}>
            Close
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onPost}
            disabled={loading || !canPost}
          >
            {loading ? "Saving…" : "Post"}
          </button>
        </footer>
        {loading ? <div className={styles.loadingOverlay}>Thinking…</div> : null}
      </aside>
    </div>
  );

  return createPortal(overlay, portalTarget);
}


