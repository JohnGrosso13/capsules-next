export type ClarifierPrompt = {
  questionId: string;
  question: string;
  rationale: string | null;
  suggestions: string[];
  styleTraits: string[];
};

