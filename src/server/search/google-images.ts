import "server-only";

import { serverEnv } from "@/lib/env/server";

export type GoogleImageResult = {
  title: string;
  link: string;
  thumbnail: string | null;
  context?: string | null;
};

const DEFAULT_LIMIT = 4;

function isGoogleImageSearchEnabled(): boolean {
  return Boolean(serverEnv.GOOGLE_CUSTOM_SEARCH_KEY && serverEnv.GOOGLE_CUSTOM_SEARCH_CX);
}

export async function searchGoogleImages(
  query: string,
  options: { limit?: number } = {},
): Promise<GoogleImageResult[]> {
  const trimmed = query.trim();
  if (!trimmed.length || !isGoogleImageSearchEnabled()) return [];

  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 10));
  const params = new URLSearchParams({
    key: serverEnv.GOOGLE_CUSTOM_SEARCH_KEY as string,
    cx: serverEnv.GOOGLE_CUSTOM_SEARCH_CX as string,
    q: trimmed,
    searchType: "image",
    safe: "active",
    num: String(limit),
    imgType: "photo",
  });

  try {
    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.warn("google image search failed", response.status, await response.text());
      return [];
    }
    const json = (await response.json()) as {
      items?: Array<{
        title?: string;
        link?: string;
        image?: { thumbnailLink?: string; contextLink?: string };
      }>;
    };
    const items = Array.isArray(json.items) ? json.items : [];
    return items
      .map((item): GoogleImageResult | null => {
        const link = typeof item.link === "string" ? item.link.trim() : "";
        if (!link) return null;
        const title = typeof item.title === "string" ? item.title.trim() : "Image result";
        const thumbnail =
          typeof item.image?.thumbnailLink === "string" ? item.image.thumbnailLink.trim() : null;
        const context =
          typeof item.image?.contextLink === "string" ? item.image.contextLink.trim() : null;
        return { title, link, thumbnail: thumbnail && thumbnail.length ? thumbnail : null, context };
      })
      .filter((entry): entry is GoogleImageResult => entry !== null);
  } catch (error) {
    console.warn("google image search error", error);
    return [];
  }
}

export function isGoogleImageSearchConfigured(): boolean {
  return isGoogleImageSearchEnabled();
}
