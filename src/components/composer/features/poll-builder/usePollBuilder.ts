"use client";

import * as React from "react";

import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";

export const MAX_POLL_OPTIONS = 6;

export type PollStructure = ReturnType<typeof ensurePollStructure>;

type UsePollBuilderParams = {
  draft: ComposerDraft;
  onDraftChange(partial: Partial<ComposerDraft>): void;
};

export type PollBuilderController = {
  pollStructure: PollStructure;
  pollBodyValue: string;
  pollQuestionValue: string;
  pollHelperText: string;
  hasStructure: boolean;
  registerPollOptionRef(index: number, element: HTMLInputElement | null): void;
  pollQuestionRef: React.RefObject<HTMLTextAreaElement | null>;
  handlePollBodyInput(value: string): void;
  handlePollQuestionInput(value: string): void;
  handlePollOptionInput(index: number, value: string): void;
  handleAddPollOption(afterIndex?: number): void;
  handleRemovePollOption(index: number): void;
};

export function usePollBuilder({ draft, onDraftChange }: UsePollBuilderParams): PollBuilderController {
  const pollStructure = React.useMemo(() => ensurePollStructure(draft), [draft]);
  const pollBodyValue = draft.content ?? "";
  const pollQuestionValue = pollStructure.question ?? "";
  const pollQuestionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const pollOptionRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
  const [pendingFocusIndex, setPendingFocusIndex] = React.useState<number | null>(null);

  const registerPollOptionRef = React.useCallback((index: number, element: HTMLInputElement | null) => {
    if (element) {
      pollOptionRefs.current[index] = element;
    } else {
      delete pollOptionRefs.current[index];
    }
  }, []);

  const handlePollQuestionInput = React.useCallback(
    (value: string) => {
      onDraftChange({
        poll: {
          question: value,
          options: [...pollStructure.options],
        },
      });
    },
    [onDraftChange, pollStructure.options],
  );

  const handlePollOptionInput = React.useCallback(
    (index: number, value: string) => {
      const nextOptions = pollStructure.options.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      );
      onDraftChange({
        poll: {
          question: pollStructure.question,
          options: nextOptions,
        },
      });
    },
    [onDraftChange, pollStructure.options, pollStructure.question],
  );

  const handleAddPollOption = React.useCallback(
    (afterIndex?: number) => {
      if (pollStructure.options.length >= MAX_POLL_OPTIONS) return;
      const nextOptions = [...pollStructure.options];
      const insertAt =
        typeof afterIndex === "number" && afterIndex >= -1 && afterIndex < nextOptions.length
          ? afterIndex + 1
          : nextOptions.length;
      nextOptions.splice(insertAt, 0, "");
      onDraftChange({
        poll: {
          question: pollStructure.question,
          options: nextOptions,
        },
      });
      setPendingFocusIndex(insertAt);
    },
    [onDraftChange, pollStructure.options, pollStructure.question],
  );

  const handleRemovePollOption = React.useCallback(
    (index: number) => {
      if (index < 0 || index >= pollStructure.options.length) return;
      if (pollStructure.options.length <= 2) {
        const nextOptions = pollStructure.options.map((option, optionIndex) =>
          optionIndex === index ? "" : option,
        );
        onDraftChange({
          poll: {
            question: pollStructure.question,
            options: nextOptions,
          },
        });
        setPendingFocusIndex(index);
        return;
      }
      const nextOptions = pollStructure.options.filter((_, optionIndex) => optionIndex !== index);
      if (nextOptions.length < 2) {
        nextOptions.push("");
      }
      onDraftChange({
        poll: {
          question: pollStructure.question,
          options: nextOptions,
        },
      });
      setPendingFocusIndex(Math.min(index, nextOptions.length - 1));
    },
    [onDraftChange, pollStructure.options, pollStructure.question],
  );

  const handlePollBodyInput = React.useCallback(
    (value: string) => {
      onDraftChange({ content: value });
    },
    [onDraftChange],
  );

  React.useEffect(() => {
    if (pendingFocusIndex === null) return;
    if (pendingFocusIndex === -1) {
      const questionElement = pollQuestionRef.current;
      if (questionElement) {
        questionElement.focus();
        const length = questionElement.value.length;
        try {
          questionElement.setSelectionRange(length, length);
        } catch {
          // Ignore selection errors on browsers that do not support setSelectionRange on textarea.
        }
      }
      setPendingFocusIndex(null);
      return;
    }
    const optionElement = pollOptionRefs.current[pendingFocusIndex];
    if (optionElement) {
      optionElement.focus();
      optionElement.select();
    }
    setPendingFocusIndex(null);
  }, [pendingFocusIndex, pollStructure.options.length]);

  const trimmedPollQuestion = pollQuestionValue.trim();
  const trimmedPollOptions = React.useMemo(
    () => pollStructure.options.map((option) => option.trim()).filter(Boolean),
    [pollStructure.options],
  );
  const hasQuestion = trimmedPollQuestion.length > 0;
  const hasOptions = trimmedPollOptions.length > 0;
  const hasStructure = React.useMemo(
    () => hasQuestion || hasOptions,
    [hasOptions, hasQuestion],
  );
  const pollHelperText = React.useMemo(() => {
    if (hasOptions) {
      return `${trimmedPollOptions.length} option${trimmedPollOptions.length === 1 ? "" : "s"} ready`;
    }
    if (hasQuestion) {
      return "Poll question ready";
    }
    return "Add poll details to activate";
  }, [hasOptions, hasQuestion, trimmedPollOptions.length]);

  return {
    pollStructure,
    pollBodyValue,
    pollQuestionValue,
    pollHelperText,
    hasStructure,
    registerPollOptionRef,
    pollQuestionRef,
    handlePollBodyInput,
    handlePollQuestionInput,
    handlePollOptionInput,
    handleAddPollOption,
    handleRemovePollOption,
  };
}
