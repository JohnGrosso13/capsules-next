import { getR2SignedObjectUrl } from "@/adapters/storage/r2/provider";

export const dynamic = "force-dynamic";

function buildObjectKey(segments: string[]): string | null {
  if (!Array.isArray(segments) || !segments.length) return null;
  const decoded = segments
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
  return decoded.length ? decoded : null;
}

export async function GET(_req: Request, context: { params: Promise<{ key: string[] }> }) {
  const resolved = await context.params;
  const key = buildObjectKey(resolved?.key ?? []);
  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const signedUrl = await getR2SignedObjectUrl(key);
    return Response.redirect(signedUrl, 302);
  } catch (error) {
    console.error("R2 proxy generate signed url failed", error);
    return new Response("Not found", { status: 404 });
  }
}
