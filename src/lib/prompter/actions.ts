import { detectComposerMode } from "@/lib/ai/nav";
import type { ComposerMode } from "@/lib/ai/nav";

export const DEFAULT_PROMPTER_PLACEHOLDER = "Ask your Capsule AI to create anything...";
export const COMPACT_PROMPTER_PLACEHOLDER = "Ask Capsule AI for ideas...";
export const COMPACT_VIEWPORT_QUERY = "(max-width: 480px)";

export const SUMMARIZE_FEED_LABEL = "Summarize my feed";

export const DEFAULT_PROMPTER_CHIPS = [
  "Post an update",
  "Share a photo",
  SUMMARIZE_FEED_LABEL,
  "Style my capsule",
];

export type PrompterPostPlan =
  | { mode: "none" }
  | { mode: "manual"; content: string }
  | { mode: "ai"; composeMode: ComposerMode };

export function resolvePrompterPostPlan(text: string): PrompterPostPlan {
  const trimmed = text.trim();
  if (!trimmed) return { mode: "none" };
  const lower = trimmed.toLowerCase();

  if (
    /(make|draft|write|craft|compose|generate|build)\s+(me\s+)?(a\s+)?(social\s+)?post/.test(lower)
  ) {
    return { mode: "ai", composeMode: detectComposerMode(lower) };
  }

  const manualColonMatch = trimmed.match(/^post\s*[:\-]\s*(.+)$/i)?.[1]?.trim();
  if (manualColonMatch) {
    return { mode: "manual", content: manualColonMatch };
  }

  const manualSimpleMatch = trimmed.match(/^post\s+(?!me\s+a\s+post)(.+)$/i)?.[1]?.trim();
  if (manualSimpleMatch) {
    return { mode: "manual", content: manualSimpleMatch };
  }

  const shorthandMatch = trimmed.match(/^p:\s*(.+)$/i)?.[1]?.trim();
  if (shorthandMatch) {
    return { mode: "manual", content: shorthandMatch };
  }

  return { mode: "none" };
}

export function isFeedSummaryRequest(raw: string): boolean {
  const text = raw.trim().toLowerCase();
  if (!text.length) return false;
  const summaryTerms = ["summarize", "summarise", "summary", "recap", "tl;dr", "tldr", "digest"];
  const mentionsSummary = summaryTerms.some((term) => text.includes(term));
  if (!mentionsSummary) return false;
  const feedTerms = ["feed", "capsule", "timeline", "updates", "activity"];
  return feedTerms.some((term) => text.includes(term));
}

export function truncatePrompterText(text: string, length = 80): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1)}...`;
}
