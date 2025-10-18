"use client";

import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";

export function sanitizePollFromDraft(
  draft: ComposerDraft,
): { question: string; options: string[] } | null {
  if (!draft.poll) return null;
  const structured = ensurePollStructure(draft);
  const question = structured.question.trim();
  const options = structured.options
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  if (!question && !options.length) return null;
  return {
    question,
    options: options.length ? options : ["Yes", "No"],
  };
}
