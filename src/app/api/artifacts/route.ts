import { ensureUserFromRequest } from "@/lib/auth/payload";
import type { IncomingUserPayload } from "@/lib/auth/payload";
import { createArtifact, listArtifactsForOwner } from "@/server/artifacts/service";
import {
  createArtifactRequestSchema,
  createArtifactResponseSchema,
  listArtifactsResponseSchema,
} from "@/server/validation/schemas/artifacts";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  let ownerId: string | null = null;
  try {
    ownerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  } catch (error) {
    console.warn("artifact list auth failed", error);
  }
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }
  try {
    const artifacts = await listArtifactsForOwner(ownerId);
    return validatedJson(listArtifactsResponseSchema, { artifacts });
  } catch (error) {
    console.error("artifact list failed", error);
    return returnError(500, "artifact_list_failed", "Failed to load artifacts");
  }
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, createArtifactRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }
  const { artifact, user } = parsed.data;
  const ownerId = await ensureUserFromRequest(req, (user ?? {}) as IncomingUserPayload, {
    allowGuests: false,
  });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }
  try {
    const created = await createArtifact({
      ownerUserId: ownerId,
      artifactType: artifact.artifactType,
      title: artifact.title,
      description: artifact.description ?? null,
      metadata: artifact.metadata ?? null,
      context: artifact.context,
      blocks: artifact.blocks,
      templateId: artifact.templateId ?? null,
    });
    const { assets, ...artifactPayload } = created;
    return validatedJson(createArtifactResponseSchema, {
      artifact: artifactPayload,
      assets,
    });
  } catch (error) {
    console.error("artifact create failed", error);
    return returnError(500, "artifact_create_failed", "Failed to create artifact");
  }
}
