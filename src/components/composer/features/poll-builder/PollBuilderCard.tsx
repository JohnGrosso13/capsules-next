"use client";

import * as React from "react";
import { Plus, X } from "@phosphor-icons/react/dist/ssr";

import styles from "../../../ai-composer.module.css";
import type { PollStructure } from "./usePollBuilder";
import { MAX_POLL_OPTIONS } from "./usePollBuilder";

type PollBuilderCardProps = {
  pollBodyValue: string;
  pollQuestionValue: string;
  pollStructure: PollStructure;
  pollQuestionRef: React.RefObject<HTMLTextAreaElement | null>;
  registerPollOptionRef(index: number, element: HTMLInputElement | null): void;
  onPollBodyChange(value: string): void;
  onPollQuestionChange(value: string): void;
  onPollOptionChange(index: number, value: string): void;
  onAddPollOption(afterIndex?: number): void;
  onRemovePollOption(index: number): void;
};

export function PollBuilderCard({
  pollBodyValue,
  pollQuestionValue,
  pollStructure,
  pollQuestionRef,
  registerPollOptionRef,
  onPollBodyChange,
  onPollQuestionChange,
  onPollOptionChange,
  onAddPollOption,
  onRemovePollOption,
}: PollBuilderCardProps) {
  return (
    <div className={styles.previewPollCard} data-editable="true">
      <div className={styles.pollEditorField}>
        <label className={styles.pollEditorLabel} htmlFor="composer-poll-intro">
          Poll intro
        </label>
        <textarea
          id="composer-poll-intro"
          className={`${styles.previewPollBody} ${styles.pollEditorQuestion}`}
          value={pollBodyValue}
          placeholder="Prep the community with a short vibe check..."
          rows={3}
          onChange={(event) => onPollBodyChange(event.target.value)}
        />
      </div>
      <div className={styles.pollEditorField}>
        <label className={styles.pollEditorLabel} htmlFor="composer-poll-question">
          Poll title
        </label>
        <textarea
          id="composer-poll-question"
          ref={pollQuestionRef}
          className={`${styles.previewPollQuestion} ${styles.pollEditorQuestion}`}
          value={pollQuestionValue}
          placeholder="Untitled poll"
          rows={2}
          onChange={(event) => onPollQuestionChange(event.target.value)}
        />
      </div>
      <div className={styles.pollEditorField}>
        <span className={styles.pollEditorLabel}>Poll options</span>
        <ul className={`${styles.previewPollOptions} ${styles.pollEditorOptions}`} role="list">
          {pollStructure.options.map((option, index) => {
            const allowRemoval = pollStructure.options.length > 2;
            return (
              <li key={`poll-option-${index}`} className={styles.pollEditorOptionRow}>
                <span className={styles.previewPollOptionBullet}>{index + 1}</span>
                <input
                  ref={(element) => registerPollOptionRef(index, element)}
                  className={`${styles.previewPollOptionLabel} ${styles.pollEditorOptionInput}`}
                  value={option}
                  placeholder={`Option ${index + 1}`}
                  type="text"
                  autoComplete="off"
                  onChange={(event) => onPollOptionChange(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      onAddPollOption(index);
                    } else if (
                      (event.key === "Backspace" || event.key === "Delete") &&
                      !event.currentTarget.value.trim() &&
                      pollStructure.options.length > 2
                    ) {
                      event.preventDefault();
                      onRemovePollOption(index);
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.pollEditorRemove}
                  onClick={() => onRemovePollOption(index)}
                  aria-label={allowRemoval ? `Remove option ${index + 1}` : `Clear option ${index + 1}`}
                >
                  <X size={12} weight="bold" />
                </button>
              </li>
            );
          })}
        </ul>
        {pollStructure.options.length < MAX_POLL_OPTIONS ? (
          <button type="button" className={styles.pollEditorAdd} onClick={() => onAddPollOption()}>
            <span className={styles.pollEditorAddIcon}>
              <Plus size={14} weight="bold" />
            </span>
            <span>Add option</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
