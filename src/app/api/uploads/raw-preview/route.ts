import { getR2SignedObjectUrl } from "@/adapters/storage/r2/provider";
import sharp from "sharp";

export const runtime = "nodejs";
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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = sanitizeKey(url.searchParams.get("key"));
  if (!key) {
    return new Response("Missing key", { status: 400 });
  }
  const size = parseSize(url.searchParams.get("size"));
  const preset = SIZE_PRESETS[size];

  let upstream: Response;
  try {
    const signedUrl = await getR2SignedObjectUrl(key);
    upstream = await fetch(signedUrl, {
      headers: { Accept: "image/*" },
    });
  } catch (error) {
    console.error("raw preview signed url fetch failed", error);
    return new Response("Not found", { status: 404 });
  }

  if (!upstream.ok) {
    console.warn("raw preview upstream error", upstream.status, upstream.statusText);
    return new Response("Not found", { status: 404 });
  }

  const inputBuffer = Buffer.from(await upstream.arrayBuffer());

  try {
    const transformer = sharp(inputBuffer, {
      limitInputPixels: false,
      failOnError: false,
    })
      .rotate()
      .toColorspace("srgb");

    const resized = preset.cover
      ? transformer.resize({
          width: preset.width,
          height: preset.height ?? undefined,
          fit: sharp.fit.cover,
          position: sharp.strategy.attention,
        })
      : transformer.resize({
          width: preset.width,
          height: preset.height ?? undefined,
          fit: sharp.fit.inside,
          withoutEnlargement: true,
        });

    const output = await resized
      .jpeg({
        quality: preset.quality,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();

    const headers = new Headers();
    headers.set("Content-Type", "image/jpeg");
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    headers.set("X-Raw-Preview-Size", size);

    const body = new Uint8Array(output);

    return new Response(body, { status: 200, headers });
  } catch (error) {
    console.error("raw preview transform failed", error);
    return new Response("Preview unavailable", { status: 500 });
  }
}
