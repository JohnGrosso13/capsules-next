"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";

import styles from "../ai-composer.module.css";
import {
  ensurePollStructure,
  isComposerDraftReady,
  type ComposerDraft,
} from "@/lib/composer/draft";

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
  choices,
  onChange,
  onClose,
  onPost,
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

  const pollDraft =
    workingDraft.kind?.toLowerCase() === "poll" ? ensurePollStructure(workingDraft) : null;
  const canPost = isComposerDraftReady(workingDraft);

  const handleKindChange = (nextKind: string) => {
    const normalized = nextKind.trim().toLowerCase();
    const nextDraft: ComposerDraft = {
      ...workingDraft,
      kind: normalized,
    };
    if (normalized === "image" || normalized === "video") {
      nextDraft.mediaUrl = workingDraft.mediaUrl ?? "";
      nextDraft.mediaPrompt = workingDraft.mediaPrompt ?? "";
    } else {
      nextDraft.mediaUrl = null;
      nextDraft.mediaPrompt = null;
    }
    if (normalized !== "poll") {
      nextDraft.poll = null;
    }
    onChange(nextDraft);
  };

  const handlePollQuestionChange = (value: string) => {
    if (!pollDraft) return;
    updateDraft({ poll: { question: value, options: pollDraft.options } });
  };

  const handlePollOptionChange = (index: number, value: string) => {
    if (!pollDraft) return;
    const next = [...pollDraft.options];
    next[index] = value;
    updateDraft({ poll: { question: pollDraft.question, options: next } });
  };

  const handleAddPollOption = () => {
    if (!pollDraft) return;
    updateDraft({ poll: { question: pollDraft.question, options: [...pollDraft.options, ""] } });
  };

  const handleRemovePollOption = (index: number) => {
    if (!pollDraft) return;
    const next = pollDraft.options.filter((_, i) => i !== index);
    updateDraft({ poll: { question: pollDraft.question, options: next.length ? next : ["", ""] } });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} />
      <aside className={styles.panel} role="dialog" aria-label="AI Composer">
        <header className={styles.header}>
          <div>
            <div className={styles.headerLabel}>Capsule AI Draft</div>
            <div className={styles.promptLabel}>Prompt</div>
            <p className={styles.promptText}>{prompt}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} disabled={loading}>
            ×
          </button>
        </header>
        {choices && choices.length ? (
          <div className={styles.choiceGroup}>
            <div className={styles.choiceLabel}>Choose a direction</div>
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
        {message ? <div className={styles.aiMessage}>{message}</div> : null}

        <div className={styles.body}>
          {workingDraft ? (
            <>
              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Draft type</span>
                <select
                  className={styles.select}
                  value={workingDraft.kind}
                  onChange={(event) => handleKindChange(event.target.value)}
                  disabled={loading}
                >
                  <option value="text">Post</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="poll">Poll</option>
                </select>
              </label>

              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Title</span>
                <input
                  className={styles.input}
                  value={workingDraft.title ?? ""}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                  disabled={loading}
                  placeholder="Optional headline"
                />
              </label>

              <label className={styles.fieldBlock}>
                <span className={styles.fieldLabel}>Content</span>
                <textarea
                  className={styles.textArea}
                  value={workingDraft.content}
                  onChange={(event) => updateDraft({ content: event.target.value })}
                  disabled={loading}
                  rows={6}
                />
              </label>

              {workingDraft.kind === "image" || workingDraft.kind === "video" ? (
                <>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>
                      {workingDraft.kind === "video" ? "Video URL" : "Image URL"}
                    </span>
                    <input
                      className={styles.input}
                      value={workingDraft.mediaUrl ?? ""}
                      onChange={(event) => updateDraft({ mediaUrl: event.target.value })}
                      disabled={loading}
                      placeholder="https://..."
                    />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span className={styles.fieldLabel}>AI Prompt / Alt Text</span>
                    <textarea
                      className={styles.textArea}
                      value={workingDraft.mediaPrompt ?? ""}
                      onChange={(event) => updateDraft({ mediaPrompt: event.target.value })}
                      disabled={loading}
                      rows={4}
                      placeholder="Describe the visual or how it should change."
                    />
                  </label>
                  {workingDraft.mediaUrl ? (
                    <div className={styles.previewBlock}>
                      {workingDraft.kind === "image" ? (
                        <img
                          src={workingDraft.mediaUrl}
                          alt="Draft preview"
                          className={styles.previewImage}
                        />
                      ) : (
                        <video
                          className={styles.previewVideo}
                          src={workingDraft.mediaUrl}
                          controls
                        />
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
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.addOption}
                    onClick={handleAddPollOption}
                    disabled={loading}
                  >
                    Add option
                  </button>
                </div>
              ) : null}

              {workingDraft.suggestions && workingDraft.suggestions.length ? (
                <div className={styles.suggestionBlock}>
                  <div className={styles.fieldLabel}>Suggestions</div>
                  <div className={styles.suggestionChips}>
                    {workingDraft.suggestions.map((suggestion, index) => (
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
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={loading}
          >
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
}
