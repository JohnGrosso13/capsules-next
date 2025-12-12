import "server-only";

import { serverEnv } from "@/lib/env/server";

export type WebSearchSnippet = {
  id: string;
  title: string | null;
  snippet: string;
  url: string | null;
  source: string;
  tags: string[];
};

const GOOGLE_SOURCE = "web_search_google";

function isGoogleCustomSearchConfigured(): boolean {
  return Boolean(serverEnv.GOOGLE_CUSTOM_SEARCH_KEY && serverEnv.GOOGLE_CUSTOM_SEARCH_CX);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function searchGoogleCustomSearch(
  query: string,
  limit: number,
  freshnessDays: number | null,
): Promise<WebSearchSnippet[]> {
  const params = new URLSearchParams({
    key: serverEnv.GOOGLE_CUSTOM_SEARCH_KEY as string,
    cx: serverEnv.GOOGLE_CUSTOM_SEARCH_CX as string,
    q: query,
    num: String(limit),
    safe: "active",
    fields: "items(title,link,snippet,displayLink)",
  });
  const clampedFreshness =
    freshnessDays && Number.isFinite(freshnessDays)
      ? Math.min(Math.max(Math.round(freshnessDays), 1), 720)
      : null;
  if (clampedFreshness) {
    params.set("dateRestrict", `d${clampedFreshness}`);
    params.set("sort", "date");
  }

  try {
    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.warn("google web search failed", response.status, await response.text());
      return [];
    }
    const json = (await response.json()) as {
      items?: Array<{ title?: string; link?: string; snippet?: string; displayLink?: string }>;
    };
    const items = Array.isArray(json.items) ? json.items : [];
    return items
      .map((item, index): WebSearchSnippet | null => {
        const link = normalizeText(item.link);
        const title = normalizeText(item.title) ?? normalizeText(item.displayLink) ?? "Result";
        const snippet = normalizeText(item.snippet) ?? "No summary available.";
        if (!link || !title || !snippet) return null;
        return {
          id: `google:${link}:${index}`,
          title,
          snippet,
          url: link,
          source: GOOGLE_SOURCE,
          tags: ["web", "google"],
        };
      })
      .filter((entry): entry is WebSearchSnippet => Boolean(entry));
  } catch (error) {
    console.warn("google web search error", error);
    return [];
  }
}

export async function searchWeb(
  query: string,
  { limit = 4, freshnessDays = null }: { limit?: number; freshnessDays?: number | null } = {},
): Promise<WebSearchSnippet[]> {
  const trimmed = query.trim();
  if (!trimmed.length) return [];
  const clampedLimit = Math.max(1, Math.min(limit, 10));

  if (!isGoogleCustomSearchConfigured()) {
    return [];
  }

  const googleResults = await searchGoogleCustomSearch(trimmed, clampedLimit, freshnessDays);
  return googleResults;
}

export function isWebSearchConfigured(): boolean {
  return isGoogleCustomSearchConfigured();
}
