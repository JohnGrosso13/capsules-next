import { ensureUserFromRequest } from "@/lib/auth/payload";
import { completeMultipartUpload, getStorageObjectUrl } from "@/lib/storage/multipart";
import { returnError, validatedJson } from "@/server/validation/http";
import { enqueueUploadEvent } from "@/lib/cloudflare/client";
import {
  completeUploadResponseSchema,
  completeUploadSchema,
} from "@/server/validation/schemas/uploads";
import {
  getUploadSessionById,
  getUploadSessionByUploadId,
  markUploadSessionUploaded,
} from "@/server/memories/uploads";
import { deriveUploadMetadata, mergeUploadMetadata, resetProcessingForMissingQueue } from "@/lib/uploads/metadata";
import { getStorageUploadQueueName } from "@/config/storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return returnError(400, "invalid_request", "Body must be a JSON object");
  }

  const { user, ...rest } = raw as Record<string, unknown>;
  const parsed = completeUploadSchema.safeParse(rest);
  if (!parsed.success) {
    return returnError(
      400,
      "invalid_request",
      "Upload completion payload failed validation",
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

  let session = null;
  if (payload.sessionId) {
    session = await getUploadSessionById(payload.sessionId);
    if (!session) {
      return returnError(404, "session_not_found", "Upload session not found");
    }
    if (session.owner_user_id !== ownerId) {
      return returnError(403, "forbidden", "You do not have access to this upload session");
    }
  } else if (payload.uploadId) {
    session = await getUploadSessionByUploadId(payload.uploadId, ownerId);
  }

  const uploadId = payload.uploadId ?? session?.upload_id ?? null;
  const key = payload.key ?? session?.r2_key ?? null;
  if (!uploadId || !key) {
    return returnError(400, "missing_upload", "uploadId and key are required");
  }

  try {
    await completeMultipartUpload({ uploadId, key, parts: payload.parts });
  } catch (error) {
    console.error("complete multipart upload failed", error);
    return returnError(500, "complete_failed", "Failed to finalize upload");
  }

  const queueName = getStorageUploadQueueName();
  const existingMetadata = (session?.metadata ?? null) as Record<string, unknown> | null;
  const payloadMetadataRecord =
    payload.metadata && Object.keys(payload.metadata).length
      ? (Object.fromEntries(
          Object.entries(payload.metadata).map(([key, value]) => [key, value ?? null]),
        ) as Record<string, unknown>)
      : null;

  const payloadFilename =
    (payloadMetadataRecord?.["file_original_name"] as string | undefined) ??
    (payloadMetadataRecord?.["original_filename"] as string | undefined) ??
    null;
  const existingFilename =
    (existingMetadata?.["file_original_name"] as string | undefined) ??
    (existingMetadata?.["original_filename"] as string | undefined) ??
    null;

  const derivedMetadata = deriveUploadMetadata({
    filename: payloadFilename ?? existingFilename,
    contentType:
      session?.content_type ??
      (existingMetadata?.["mime_type"] as string | undefined) ??
      null,
    sizeBytes: session?.content_length ?? null,
    stage: "uploaded",
  });

  let mergedMetadata = mergeUploadMetadata(
    existingMetadata,
    payloadMetadataRecord ?? {},
  );
  mergedMetadata = mergeUploadMetadata(mergedMetadata, derivedMetadata.metadata);

  let requiresProcessing = derivedMetadata.plan.requiresProcessing;
  if (requiresProcessing && !queueName) {
    mergedMetadata = resetProcessingForMissingQueue(mergedMetadata);
    requiresProcessing = false;
  }

  let updatedSession = session;
  if (session) {
    const nextStatus = requiresProcessing ? "processing" : "completed";
    updatedSession = await markUploadSessionUploaded({
      sessionId: session.id,
      uploadId,
      key,
      parts: payload.parts,
      metadata: mergedMetadata,
      status: nextStatus,
      completedAt: requiresProcessing ? null : new Date().toISOString(),
    });
  }

  const publicUrl =
    (updatedSession?.absolute_url && updatedSession.absolute_url.trim()) ||
    (session?.absolute_url && session.absolute_url.trim()) ||
    getStorageObjectUrl(key);

  const eventMetadata =
    (updatedSession?.metadata as Record<string, unknown> | null) ?? mergedMetadata;

  try {
    if (requiresProcessing || queueName) {
      await enqueueUploadEvent({
        type: "upload.completed",
        sessionId: updatedSession?.id ?? session?.id ?? null,
        uploadId,
        ownerId: session?.owner_user_id ?? updatedSession?.owner_user_id ?? null,
        key,
        bucket: session?.r2_bucket ?? updatedSession?.r2_bucket ?? "",
        contentType: session?.content_type ?? updatedSession?.content_type ?? null,
        metadata: eventMetadata,
        absoluteUrl:
          updatedSession?.absolute_url ?? session?.absolute_url ?? publicUrl ?? null,
      });
    }
  } catch (queueError) {
    console.warn("enqueue upload event failed", queueError);
  }

  return validatedJson(completeUploadResponseSchema, {
    sessionId: updatedSession?.id ?? null,
    key,
    url: publicUrl,
  });
}
