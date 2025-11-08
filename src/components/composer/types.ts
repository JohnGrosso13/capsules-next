export type PromptRunMode = "default" | "chatOnly";

export type PromptSubmitOptions = {
  mode?: PromptRunMode;
  preserveSummary?: boolean;
};

export type ClarifierPrompt = {
  questionId: string;
  question: string;
  rationale?: string | null;
  suggestions: string[];
  styleTraits: string[];
};
