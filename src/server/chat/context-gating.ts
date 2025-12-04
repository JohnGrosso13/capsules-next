import type { ComposerChatMessage } from "@/lib/composer/chat-types";

function normalizeSearchText(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized.length ? normalized : null;
}

function collectRecentUserText(
  history: ComposerChatMessage[] | undefined,
  limit = 3,
): string {
  if (!history || !history.length) return "";
  const recentUsers = history
    .slice()
    .reverse()
    .filter((entry) => entry.role === "user")
    .slice(0, limit)
    .map((entry) => (typeof entry.content === "string" ? entry.content : ""))
    .filter(Boolean);
  return recentUsers.join(" ");
}

export function shouldEnableMemoryContext(params: {
  message: string;
  history?: ComposerChatMessage[];
}): boolean {
  const combined = [params.message, collectRecentUserText(params.history, 2)]
    .filter(Boolean)
    .join(" ");
  const haystack = normalizeSearchText(combined);
  if (!haystack) return false;

  const hasPronoun = /\b(my|our|this|that|these|those)\b/.test(haystack);

  const mentionsPlatformSurface = /\b(feed|timeline|channel|capsule|capsules|community|page|profile)\b/.test(
    haystack,
  );

  const mentionsMemoryWords = /\b(memory|memories|remember|recall)\b/.test(haystack);

  const mentionsPostHistory =
    /\b(last|previous|earlier|recent)\s+(post|posts|caption|captions|update|updates)\b/.test(
      haystack,
    ) ||
    /\b(my|our)\s+(feed|posts|post|memories|capsule|channel)\b/.test(haystack) ||
    /\bwhat\s+did\s+(i|we)\s+post\b/.test(haystack) ||
    /\bwhat\s+was\s+our\s+last\s+post\b/.test(haystack);

  const mentionsSummaryOfFeed =
    /\b(summarize|summary|recap|digest|review|tl\s*dr|tldr)\b/.test(haystack) &&
    /\b(feed|timeline|capsule|capsules|channel|community)\b/.test(haystack);

  const mentionsStatsOrMembers =
    /\b(members?|roster|standings|results|scores?|record|ratings?|elo)\b/.test(haystack) &&
    /\b(capsule|capsules|ladder|league|tournament|bracket)\b/.test(haystack);

  if (mentionsMemoryWords || mentionsPostHistory || mentionsSummaryOfFeed || mentionsStatsOrMembers) {
    return true;
  }

  if (mentionsPlatformSurface && hasPronoun) {
    return true;
  }

  return false;
}

