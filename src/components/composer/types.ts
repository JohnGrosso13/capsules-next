export type PromptRunMode = "default" | "chatOnly";

export type PromptSubmitOptions = {
  mode?: PromptRunMode;
  preserveSummary?: boolean;
};
