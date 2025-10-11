import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { uploadRequestSchema, uploadResponseSchema } from "@/server/validation/schemas/uploads";
import { ensureUserFromRequest } from "@/lib/auth/payload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Require authentication to prevent open uploads
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsed = await parseJsonBody(req, uploadRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { filename, contentType, dataBase64 } = parsed.data;

  // Enforce content type and size limits
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

  const resolvedFilename =
    filename && filename.trim().length ? filename.trim() : `file-${Date.now()}`;
  const resolvedContentType =
    contentType && contentType.trim().length ? contentType.trim() : "application/octet-stream";

  if (!allowed.has(resolvedContentType)) {
    return returnError(415, "unsupported_media_type", "Only image uploads are allowed");
  }
  const base64 = dataBase64.trim();

  const normalized = base64.startsWith("data:")
    ? base64
    : `data:${resolvedContentType};base64,${base64.split(",").pop() ?? base64}`;

  // Approximate size check (base64 expands ~4/3)
  const raw = normalized.includes(",") ? normalized.split(",").pop() || "" : normalized;
  const approxBytes = Math.floor((raw.length * 3) / 4);
  const MAX_BYTES = 10 * 1024 * 1024; // 10MB
  if (approxBytes > MAX_BYTES) {
    return returnError(413, "payload_too_large", "Max upload size is 10MB");
  }

  try {
    const saved = await storeImageSrcToSupabase(normalized, resolvedFilename);
    if (!saved?.url) {
      return returnError(500, "upload_failed", "Failed to save image");
    }

    return validatedJson(uploadResponseSchema, {
      url: saved.url,
      key: typeof saved.key === "string" && saved.key.trim().length ? saved.key : undefined,
    });
  } catch (error) {
    console.error("upload_base64 error:", error);
    return returnError(500, "upload_failed", "Internal server error");
  }
}
