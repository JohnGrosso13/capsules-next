"use client";

import * as React from "react";
import { Plus, X } from "@phosphor-icons/react/dist/ssr";

import pollStyles from "../../styles/composer-poll-builder.module.css";
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
    <div className={pollStyles.previewPollCard} data-editable="true">
      <div className={pollStyles.pollEditorField}>
        <label className={pollStyles.pollEditorLabel} htmlFor="composer-poll-intro">
          Poll intro
        </label>
        <textarea
          id="composer-poll-intro"
          className={`${pollStyles.previewPollBody} ${pollStyles.pollEditorQuestion}`}
          value={pollBodyValue}
          placeholder="Prep the community with a short vibe check..."
          rows={3}
          onChange={(event) => onPollBodyChange(event.target.value)}
        />
      </div>
      <div className={pollStyles.pollEditorField}>
        <label className={pollStyles.pollEditorLabel} htmlFor="composer-poll-question">
          Poll title
        </label>
        <textarea
          id="composer-poll-question"
          ref={pollQuestionRef}
          className={`${pollStyles.previewPollQuestion} ${pollStyles.pollEditorQuestion}`}
          value={pollQuestionValue}
          placeholder="Untitled poll"
          rows={2}
          onChange={(event) => onPollQuestionChange(event.target.value)}
        />
      </div>
      <div className={pollStyles.pollEditorField}>
        <span className={pollStyles.pollEditorLabel}>Poll options</span>
        <ul className={`${pollStyles.previewPollOptions} ${pollStyles.pollEditorOptions}`} role="list">
          {pollStructure.options.map((option, index) => {
            const allowRemoval = pollStructure.options.length > 2;
            const thumbnail =
              Array.isArray(pollStructure.thumbnails) &&
              typeof pollStructure.thumbnails[index] === "string" &&
              pollStructure.thumbnails[index]?.trim().length
                ? pollStructure.thumbnails[index]
                : null;
            return (
              <li key={`poll-option-${index}`} className={pollStyles.pollEditorOptionRow}>
                <span className={pollStyles.previewPollOptionBullet} aria-hidden={thumbnail ? "true" : "false"}>
                  {thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnail}
                      alt=""
                      className={pollStyles.previewPollOptionThumb}
                    />
                  ) : null}
                </span>
                <input
                  ref={(element) => registerPollOptionRef(index, element)}
                  className={`${pollStyles.previewPollOptionLabel} ${pollStyles.pollEditorOptionInput}`}
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
                  className={pollStyles.pollEditorRemove}
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
          <button type="button" className={pollStyles.pollEditorAdd} onClick={() => onAddPollOption()}>
            <span className={pollStyles.pollEditorAddIcon}>
              <Plus size={14} weight="bold" />
            </span>
            <span>Add option</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
