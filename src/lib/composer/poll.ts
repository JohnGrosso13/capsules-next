"use client";

import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";

export function sanitizePollFromDraft(
  draft: ComposerDraft,
): { question: string; options: string[]; thumbnails?: (string | null)[] | null } | null {
  if (!draft.poll) return null;
  const structured = ensurePollStructure(draft);
  const question = structured.question.trim();
  const options = structured.options
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  const thumbs = structured.thumbnails ?? [];
  if (!question && !options.length) return null;
  const safeOptions = options.length ? options : ["Yes", "No"];
  const safeThumbs =
    thumbs.length && safeOptions.length
      ? safeOptions.map((_, index) => {
          const raw = thumbs[index];
          const value = typeof raw === "string" ? raw.trim() : "";
          return value.length ? value : null;
        })
      : [];
  return {
    question,
    options: safeOptions,
    ...(safeThumbs.length ? { thumbnails: safeThumbs } : {}),
  };
}
