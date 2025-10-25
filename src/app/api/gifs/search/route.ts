import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env/server";

const TENOR_BASE_URL = "https://tenor.googleapis.com/v2";
const GIPHY_BASE_URL = "https://api.giphy.com/v1/gifs";

type GifResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
  size: number | null;
};

type TenorMedia = {
  url?: string;
  size?: number;
  dims?: [number, number];
};

type TenorResult = {
  id: string;
  title?: string;
  content_description?: string;
  media_formats?: {
    gif?: TenorMedia;
    tinygif?: TenorMedia;
    nanogif?: TenorMedia;
    [key: string]: TenorMedia | undefined;
  };
};

type TenorResponse = {
  results?: TenorResult[];
  next?: string;
};

type GiphyImage = {
  url?: string;
  width?: string;
  height?: string;
  size?: string;
};

type GiphyGif = {
  id: string;
  title?: string;
  images?: Record<string, GiphyImage | undefined>;
};

type GiphyResponse = {
  data?: GiphyGif[];
  pagination?: { offset?: number; count?: number; total_count?: number };
};

function parseDimension(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSize(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function searchTenor(
  query: string,
  limit: number,
  pos: string | null,
): Promise<{ results: GifResult[]; next: string | null }> {
  const apiKey = serverEnv.TENOR_API_KEY;
  if (!apiKey) {
    throw new Error("Tenor API key not configured.");
  }

  const endpoint = query ? "search" : "featured";
  const requestUrl = new URL(`${TENOR_BASE_URL}/${endpoint}`);
  requestUrl.searchParams.set("key", apiKey);
  requestUrl.searchParams.set("limit", String(limit));
  requestUrl.searchParams.set("media_filter", "gif,tinygif");
  if (serverEnv.TENOR_CLIENT_KEY) {
    requestUrl.searchParams.set("client_key", serverEnv.TENOR_CLIENT_KEY);
  }
  if (query) requestUrl.searchParams.set("q", query);
  if (pos) requestUrl.searchParams.set("pos", pos);

  const response = await fetch(requestUrl.toString(), {
    headers: { "User-Agent": "CapsulesChat/1.0" },
    next: { revalidate: query ? 30 : 120 },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(detail || "Tenor request failed.");
  }

  const payload = (await response.json()) as TenorResponse;
  const results = (payload.results ?? []).map((result) => {
    const formats = result.media_formats ?? {};
    const primary = formats.gif ?? formats.nanogif ?? formats.tinygif ?? null;
    const preview = formats.tinygif ?? formats.nanogif ?? formats.gif ?? null;
    const width = primary?.dims?.[0] ?? preview?.dims?.[0] ?? null;
    const height = primary?.dims?.[1] ?? preview?.dims?.[1] ?? null;
    return {
      id: result.id,
      title: result.title || result.content_description || "GIF",
      url: primary?.url ?? "",
      previewUrl: preview?.url ?? primary?.url ?? "",
      width,
      height,
      size: primary?.size ?? preview?.size ?? null,
    };
  });

  return {
    results: results.filter((gif) => gif.url.length > 0),
    next: payload.next ?? null,
  };
}

async function searchGiphy(
  query: string,
  limit: number,
  pos: string | null,
): Promise<{ results: GifResult[]; next: string | null }> {
  const apiKey = serverEnv.GIPHY_API_KEY;
  if (!apiKey) {
    throw new Error("GIPHY API key not configured.");
  }

  const offset = pos ? Math.max(0, Number.parseInt(pos, 10) || 0) : 0;
  const endpoint = query ? "search" : "trending";
  const requestUrl = new URL(`${GIPHY_BASE_URL}/${endpoint}`);
  requestUrl.searchParams.set("api_key", apiKey);
  requestUrl.searchParams.set("limit", String(limit));
  requestUrl.searchParams.set("offset", String(offset));
  requestUrl.searchParams.set("bundle", "messaging_non_clips");
  requestUrl.searchParams.set("rating", serverEnv.GIPHY_RATING || "pg-13");
  requestUrl.searchParams.set("lang", "en");
  if (query) requestUrl.searchParams.set("q", query);

  const response = await fetch(requestUrl.toString(), {
    headers: { "User-Agent": "CapsulesChat/1.0" },
    next: { revalidate: query ? 30 : 120 },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(detail || "GIPHY request failed.");
  }

  const payload = (await response.json()) as GiphyResponse;
  const results = (payload.data ?? []).map((gif) => {
    const images = gif.images ?? {};
    const original = images.original ?? images.downsized ?? images.fixed_width ?? {};
    const preview =
      images.preview_gif ?? images.fixed_width_small ?? images.downsized_small ?? original;
    return {
      id: gif.id,
      title: gif.title || "GIF",
      url: original.url ?? preview?.url ?? "",
      previewUrl: preview?.url ?? original?.url ?? "",
      width: parseDimension(original.width) ?? parseDimension(preview?.width),
      height: parseDimension(original.height) ?? parseDimension(preview?.height),
      size: parseSize(original.size) ?? parseSize(preview?.size),
    };
  });

  const pagination = payload.pagination ?? {};
  const count = pagination.count ?? results.length;
  const total = pagination.total_count ?? 0;
  const currentOffset = pagination.offset ?? offset;
  const nextOffset =
    count > 0 && currentOffset + count < total ? String(currentOffset + count) : null;

  return {
    results: results.filter((gif) => gif.url.length > 0),
    next: nextOffset,
  };
}

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = (url.searchParams.get("q") || "").trim();
  const pos = url.searchParams.get("pos") || null;
  const limitRaw = Number(url.searchParams.get("limit") || "24");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(48, Math.trunc(limitRaw))) : 24;

  const prefersGiphy = Boolean(serverEnv.GIPHY_API_KEY);
  const hasTenor = Boolean(serverEnv.TENOR_API_KEY);

  if (!prefersGiphy && !hasTenor) {
    return NextResponse.json(
      { error: "GIF search is not configured" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const provider = prefersGiphy ? "giphy" : "tenor";
    const payload =
      provider === "giphy"
        ? await searchGiphy(query, limit, pos)
        : await searchTenor(query, limit, pos);

    return NextResponse.json({
      provider,
      results: payload.results,
      next: payload.next,
    });
  } catch (error) {
    console.error("GIF search error", error);
    return NextResponse.json(
      { error: (error as Error).message || "GIF search failed" },
      { status: 502 },
    );
  }
}
