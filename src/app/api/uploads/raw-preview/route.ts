import { getR2SignedObjectUrl } from "@/adapters/storage/r2/provider";
import { buildCloudflareImageUrl } from "@/lib/cloudflare/images";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PreviewSize = "thumb" | "feed" | "full";

const SIZE_PRESETS: Record<
  PreviewSize,
  { width: number; height: number | null; quality: number; cover: boolean }
> = {
  thumb: { width: 640, height: 640, quality: 88, cover: true },
  feed: { width: 1600, height: 1600, quality: 90, cover: true },
  full: { width: 2400, height: null, quality: 92, cover: false },
};

function sanitizeKey(value: string | null): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    if (!decoded.length) return null;
    if (decoded.includes("\u0000")) return null;
    const normalized = decoded.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized.length || normalized.includes("..")) return null;
    return normalized;
  } catch {
    return null;
  }
}

function parseSize(value: string | null): PreviewSize {
  if (!value) return "feed";
  const normalized = value.trim().toLowerCase();
  if (normalized === "thumb" || normalized === "full" || normalized === "feed") {
    return normalized;
  }
  return "feed";
}

function buildPreviewUrl(sourceUrl: string, preset: (typeof SIZE_PRESETS)[PreviewSize], origin: string) {
  const options: Parameters<typeof buildCloudflareImageUrl>[1] = {
    width: preset.width,
    fit: preset.cover ? "cover" : "scale-down",
    quality: preset.quality,
    format: "jpeg",
    sharpen: 1,
  };
  if (typeof preset.height === "number" && preset.height > 0) {
    options.height = preset.height;
  }
  if (preset.cover) {
    options.gravity = "faces";
  }

  return buildCloudflareImageUrl(sourceUrl, options, null, origin);
}

function ensureAbsoluteUrl(url: string, origin: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    return `${origin.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
  }
}

async function fetchPreview(url: string): Promise<Response | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "image/*" } });
    if (!response.ok) return null;
    return response;
  } catch (error) {
    console.warn("raw preview fetch failed", error);
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = url.origin;
  const key = sanitizeKey(url.searchParams.get("key"));
  if (!key) {
    return new Response("Missing key", { status: 400 });
  }
  const size = parseSize(url.searchParams.get("size"));
  const preset = SIZE_PRESETS[size];

  const signedUrl = await getR2SignedObjectUrl(key).catch((error) => {
    console.error("raw preview signed url fetch failed", error);
    return null;
  });
  if (!signedUrl) {
    return new Response("Not found", { status: 404 });
  }

  const previewUrl = ensureAbsoluteUrl(buildPreviewUrl(signedUrl, preset, origin), origin);
  const bestResponse = (await fetchPreview(previewUrl)) ?? (await fetchPreview(signedUrl));

  if (!bestResponse) {
    return new Response("Preview unavailable", { status: 502 });
  }

  const headers = new Headers(bestResponse.headers);
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("X-Raw-Preview-Size", size);
  const contentType = headers.get("Content-Type") ?? headers.get("content-type") ?? "image/jpeg";
  headers.set("Content-Type", contentType);

  return new Response(bestResponse.body, {
    status: 200,
    headers,
  });
}
