import { ensureUserFromRequest } from "@/lib/auth/payload";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { abortMultipartUpload, createMultipartUpload } from "@/lib/storage/multipart";
import { returnError, validatedJson } from "@/server/validation/http";
import {
  directUploadRequestSchema,
  directUploadResponseSchema,
} from "@/server/validation/schemas/uploads";
import { createUploadSessionRecord } from "@/server/memories/uploads";
import { putUploadSessionKv } from "@/lib/cloudflare/client";
import type { StorageMetadataValue } from "@/ports/storage";
import { deriveUploadMetadata, mergeUploadMetadata } from "@/lib/uploads/metadata";
import { resolveWalletContext, EntitlementError } from "@/server/billing/entitlements";

export const runtime = "nodejs";

function resolveClientIp(req: Request): string | null {
  const headers = req.headers;
  const forwarded = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded
      .split(",")
      .map((v) => v.trim())
      .find(Boolean);
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return returnError(400, "invalid_request", "Body must be a JSON object");
  }

  const { user, ...rest } = raw as Record<string, unknown>;
  const parsed = directUploadRequestSchema.safeParse(rest);
  if (!parsed.success) {
    return returnError(
      400,
      "invalid_request",
      "Upload parameters failed validation",
      parsed.error.flatten(),
    );
  }

  const params = parsed.data;

  const ownerId = await ensureUserFromRequest(req, (user as Record<string, unknown>) ?? {}, {
    allowGuests: false,
  });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const remoteIp = resolveClientIp(req);
  const turnstile = await verifyTurnstileToken(params.turnstileToken, remoteIp);
  if (!turnstile.success) {
    return returnError(403, "turnstile_failed", "Turnstile verification failed", turnstile);
  }

  const userProvidedMetadata =
    params.metadata && Object.keys(params.metadata).length
      ? (Object.fromEntries(
          Object.entries(params.metadata).map(([key, value]) => [
            key,
            (value ?? null) as StorageMetadataValue | null,
          ]),
        ) as Record<string, StorageMetadataValue | null>)
      : null;

  const derivedMetadata = deriveUploadMetadata({
    filename: params.filename ?? null,
    contentType: params.contentType ?? null,
    sizeBytes: params.contentLength ?? null,
    stage: "initial",
  });

  const sessionMetadata = mergeUploadMetadata(
    (userProvidedMetadata as Record<string, unknown> | null) ?? null,
    derivedMetadata.metadata,
  );

  try {
    const wallet = await resolveWalletContext({
      ownerType: "user",
      ownerId,
      supabaseUserId: ownerId,
      req,
      ensureDevCredits: true,
    });

    const requestedBytes = Math.max(0, params.contentLength ?? 0);
    if (!wallet.bypass && requestedBytes > 0) {
      const available = wallet.balance.storageGranted - wallet.balance.storageUsed;
      if (available < requestedBytes) {
        return returnError(
          402,
          "storage_limit",
          "Not enough storage available for this upload.",
          { available },
        );
      }
    }

    sessionMetadata.billing_wallet_id = wallet.wallet.id;
  } catch (error) {
    if (error instanceof EntitlementError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("billing.upload.precheck_failed", error);
    return returnError(500, "billing_error", "Failed to check storage allowance");
  }

  let upload;
  try {
    upload = await createMultipartUpload({
      ownerId,
      filename: params.filename,
      contentType: params.contentType,
      fileSize: params.contentLength,
      kind: params.kind ?? "upload",
      ...(userProvidedMetadata ? { metadata: userProvidedMetadata } : {}),
      ...(typeof params.totalParts === "number" && params.totalParts > 0
        ? { totalParts: params.totalParts }
        : {}),
    });
  } catch (error) {
    console.error("create multipart upload failed", error);
    return returnError(500, "create_upload_failed", "Unable to initialize upload");
  }

  let session = null;
  try {
    session = await createUploadSessionRecord({
      ownerId,
      uploadId: upload.uploadId,
      key: upload.key,
      bucket: upload.bucket,
      absoluteUrl: upload.absoluteUrl ?? null,
      contentType: params.contentType,
      contentLength: params.contentLength,
      partSize: upload.partSize,
      totalParts: params.totalParts ?? upload.parts.length,
      checksum: params.checksum,
      metadata: sessionMetadata,
      turnstileAction: turnstile.action ?? null,
      turnstileCdata: turnstile.cdata ?? null,
      clientIp: remoteIp,
    });
  } catch (error) {
    console.error("persist upload session failed", error);
  }

  if (!session) {
    try {
      await abortMultipartUpload({ uploadId: upload.uploadId, key: upload.key });
    } catch (abortError) {
      console.warn("abort multipart upload error", abortError);
    }
    return returnError(500, "session_persist_failed", "Failed to persist upload session");
  }

  try {
    await putUploadSessionKv(`session:${session.id}`, {
      sessionId: session.id,
      uploadId: upload.uploadId,
      ownerId,
      key: upload.key,
      bucket: upload.bucket,
      contentType: params.contentType,
      contentLength: params.contentLength,
      metadata: sessionMetadata,
    });
    await putUploadSessionKv(`upload:${upload.uploadId}`, {
      sessionId: session.id,
    });
  } catch (kvError) {
    console.warn("upload session kv write failed", kvError);
  }

  return validatedJson(directUploadResponseSchema, {
    sessionId: session.id,
    uploadId: upload.uploadId,
    key: upload.key,
    bucket: upload.bucket,
    partSize: upload.partSize,
    parts: upload.parts,
    absoluteUrl: upload.absoluteUrl ?? undefined,
  });
}
