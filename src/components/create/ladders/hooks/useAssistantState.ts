import * as React from "react";

import type { AssistantMessage } from "../assistantTypes";
import type { GuidedStepId } from "../guidedConfig";

export type AssistantStepState = {
  draft: string;
  isSending: boolean;
  threadId: string | null;
  conversation: AssistantMessage[];
};

export const createInitialAssistantState = (): AssistantStepState => ({
  draft: "",
  isSending: false,
  threadId: null,
  conversation: [
    {
      id: "ai-welcome",
      sender: "ai",
      text: "Tell me the vibe, game, who it's for, and what's at stake. I can help with a title, one-line summary, rules, or rewards—whatever you need.",
      timestamp: Date.now(),
    },
  ],
});

export const useAssistantState = (
  guidedStep: GuidedStepId,
  allowedSteps: GuidedStepId[],
) => {
  const [assistantStateByStep, setAssistantStateByStep] = React.useState<
    Partial<Record<GuidedStepId, AssistantStepState>>
  >({
    title: createInitialAssistantState(),
    summary: createInitialAssistantState(),
  });

  const createAssistantMessage = React.useCallback(
    (sender: AssistantMessage["sender"], text: string): AssistantMessage => ({
      id: `${sender}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender,
      text,
      timestamp: Date.now(),
    }),
    [],
  );

  const updateAssistantState = React.useCallback(
    (step: GuidedStepId, updater: (prev: AssistantStepState) => AssistantStepState) => {
      if (!allowedSteps.includes(step)) return;
      setAssistantStateByStep((prev) => {
        const previous = prev[step] ?? createInitialAssistantState();
        return {
          ...prev,
          [step]: updater(previous),
        };
      });
    },
    [allowedSteps],
  );

  const currentAssistantState =
    assistantStateByStep[guidedStep] ?? createInitialAssistantState();

  return {
    assistantStateByStep,
    assistantDraft: currentAssistantState.draft,
    assistantIsSending: currentAssistantState.isSending,
    assistantConversation: currentAssistantState.conversation,
    updateAssistantState,
    createAssistantMessage,
  };
};
