"use client";

import type { ComposerDraft } from "@/lib/composer/draft";

export function normalizeDraftFromPost(post: Record<string, unknown>): ComposerDraft {
  const kind = typeof post.kind === "string" ? post.kind.toLowerCase() : "text";
  const content = typeof post.content === "string" ? post.content : "";
  const mediaUrl =
    typeof post.mediaUrl === "string"
      ? post.mediaUrl
      : typeof post.media_url === "string"
        ? String(post.media_url)
        : null;
  const mediaPrompt =
    typeof post.mediaPrompt === "string"
      ? post.mediaPrompt
      : typeof post.media_prompt === "string"
        ? String(post.media_prompt)
        : null;
  let poll: { question: string; options: string[] } | null = null;
  const pollValue = post.poll;
  if (pollValue && typeof pollValue === "object") {
    const pollRecord = pollValue as Record<string, unknown>;
    const question = typeof pollRecord.question === "string" ? pollRecord.question : "";
    const optionsRaw = Array.isArray(pollRecord.options) ? pollRecord.options : [];
    const options = optionsRaw.map((option: unknown) => String(option ?? ""));
    poll = { question, options: options.length ? options : ["", ""] };
  }
  const suggestionsValue = post.suggestions;
  const suggestions = Array.isArray(suggestionsValue)
    ? suggestionsValue
        .map((suggestion: unknown) => {
          if (typeof suggestion === "string") return suggestion.trim();
          if (suggestion == null) return "";
          return String(suggestion).trim();
        })
        .filter((value) => value.length > 0)
    : undefined;
  const draft: ComposerDraft = {
    kind,
    title: typeof post.title === "string" ? post.title : null,
    content,
    mediaUrl,
    mediaPrompt,
    poll,
  };
  if (suggestions && suggestions.length) {
    draft.suggestions = suggestions;
  }
  return draft;
}
