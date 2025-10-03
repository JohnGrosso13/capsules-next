import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { uploadRequestSchema, uploadResponseSchema } from "@/server/validation/schemas/uploads";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, uploadRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { filename, contentType, dataBase64 } = parsed.data;

  const resolvedFilename =
    filename && filename.trim().length ? filename.trim() : `file-${Date.now()}`;
  const resolvedContentType =
    contentType && contentType.trim().length ? contentType.trim() : "application/octet-stream";
  const base64 = dataBase64.trim();

  const normalized = base64.startsWith("data:")
    ? base64
    : `data:${resolvedContentType};base64,${base64.split(",").pop() ?? base64}`;

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
