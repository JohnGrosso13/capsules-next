import { ensureUserFromRequest } from "@/lib/auth/payload";
import type { IncomingUserPayload } from "@/lib/auth/payload";
import { applyArtifactPatch, getArtifactWithAssets } from "@/server/artifacts/service";
import { ArtifactVersionConflictError } from "@/server/artifacts/service";
import {
  artifactIdParamSchema,
  getArtifactResponseSchema,
  updateArtifactRequestSchema,
  updateArtifactResponseSchema,
} from "@/server/validation/schemas/artifacts";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

function parseParams(context: RouteContext): { id: string } | null {
  const result = artifactIdParamSchema.safeParse(context.params);
  if (!result.success) {
    return null;
  }
  return result.data;
}

export async function GET(req: Request, context: RouteContext) {
  const params = parseParams(context);
  if (!params) {
    return returnError(400, "invalid_params", "Invalid artifact identifier");
  }
  const ownerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }
  const artifact = await getArtifactWithAssets(params.id);
  if (!artifact || artifact.ownerUserId !== ownerId) {
    return returnError(404, "artifact_not_found", "Artifact not found");
  }
  const { assets, ...artifactPayload } = artifact;
  return validatedJson(getArtifactResponseSchema, {
    artifact: artifactPayload,
    assets,
  });
}

export async function PATCH(req: Request, context: RouteContext) {
  const params = parseParams(context);
  if (!params) {
    return returnError(400, "invalid_params", "Invalid artifact identifier");
  }
  const parsed = await parseJsonBody(req, updateArtifactRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }
  const ownerId = await ensureUserFromRequest(req, (parsed.data.user ?? {}) as IncomingUserPayload, {
    allowGuests: false,
  });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }
  const current = await getArtifactWithAssets(params.id);
  if (!current || current.ownerUserId !== ownerId) {
    return returnError(404, "artifact_not_found", "Artifact not found");
  }
  try {
    const patched = await applyArtifactPatch(
      params.id,
      parsed.data.patch,
      {
        assets: parsed.data.assets?.map((asset) => ({
          artifactId: params.id,
          blockId: asset.blockId,
          slotId: asset.slotId,
          r2Bucket: asset.r2Bucket,
          r2Key: asset.r2Key,
          contentType: asset.contentType ?? null,
          descriptor: asset.descriptor ?? null,
        })),
        queueEmbedding: parsed.data.queueEmbedding ?? false,
        event: {
          eventType: "artifact.patch",
          origin: "system",
          payload: { expectedVersion: parsed.data.patch.expectedVersion },
        },
      },
    );
    if (!patched) {
      return returnError(404, "artifact_not_found", "Artifact not found");
    }
    const { assets, ...artifactPayload } = patched;
    return validatedJson(updateArtifactResponseSchema, {
      artifact: artifactPayload,
      assets,
    });
  } catch (error) {
    if (error instanceof ArtifactVersionConflictError) {
      const latest = await getArtifactWithAssets(params.id);
      if (!latest) {
        return returnError(404, "artifact_not_found", "Artifact not found");
      }
      const { assets, ...artifactPayload } = latest;
      return validatedJson(
        updateArtifactResponseSchema,
        {
          artifact: artifactPayload,
          assets,
          conflict: true,
        },
        { status: 409 },
      );
    }
    console.error("artifact patch failed", error);
    return returnError(500, "artifact_patch_failed", "Failed to update artifact");
  }
}






