import { NextResponse } from "next/server";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { abortMultipartUpload } from "@/lib/storage/multipart";
import { returnError } from "@/server/validation/http";
import { abortUploadSchema } from "@/server/validation/schemas/uploads";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return returnError(400, "invalid_request", "Body must be a JSON object");
  }

  const { user, ...rest } = raw as Record<string, unknown>;
  const parsed = abortUploadSchema.safeParse(rest);
  if (!parsed.success) {
    return returnError(
      400,
      "invalid_request",
      "Upload abort payload failed validation",
      parsed.error.flatten(),
    );
  }

  const payload = parsed.data;

  const ownerId = await ensureUserFromRequest(req, (user as Record<string, unknown>) ?? {}, {
    allowGuests: false,
  });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  if (!payload.uploadId || !payload.key) {
    return returnError(400, "missing_parameters", "uploadId and key are required");
  }

  try {
    await abortMultipartUpload({ uploadId: payload.uploadId, key: payload.key });
  } catch (error) {
    console.error("abort multipart upload error", error);
    return returnError(500, "abort_failed", "Failed to abort upload");
  }

  return NextResponse.json({ success: true });
}
