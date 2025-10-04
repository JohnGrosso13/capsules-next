import { ensureUserFromRequest } from "@/lib/auth/payload";
import type { IncomingUserPayload } from "@/lib/auth/payload";
import { commitArtifact, getArtifactWithAssets } from "@/server/artifacts/service";
import { ArtifactVersionConflictError } from "@/server/artifacts/service";
import {
  artifactIdParamSchema,
  commitArtifactRequestSchema,
  commitArtifactResponseSchema,
} from "@/server/validation/schemas/artifacts";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, context: RouteContext) {
  const paramsResult = artifactIdParamSchema.safeParse(context.params);
  if (!paramsResult.success) {
    return returnError(400, "invalid_params", "Invalid artifact identifier");
  }
  const parsed = await parseJsonBody(req, commitArtifactRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }
  const ownerId = await ensureUserFromRequest(req, (parsed.data.user ?? {}) as IncomingUserPayload, {
    allowGuests: false,
  });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }
  const artifact = await getArtifactWithAssets(paramsResult.data.id);
  if (!artifact || artifact.ownerUserId !== ownerId) {
    return returnError(404, "artifact_not_found", "Artifact not found");
  }
  try {
    const committed = await commitArtifact(paramsResult.data.id, parsed.data.version);
    if (!committed) {
      return returnError(404, "artifact_not_found", "Artifact not found");
    }
    const { assets, ...artifactPayload } = committed;
    return validatedJson(commitArtifactResponseSchema, {
      artifact: artifactPayload,
      assets,
    });
  } catch (error) {
    if (error instanceof ArtifactVersionConflictError) {
      const latest = await getArtifactWithAssets(paramsResult.data.id);
      if (!latest) {
        return returnError(404, "artifact_not_found", "Artifact not found");
      }
      const { assets, ...artifactPayload } = latest;
      return validatedJson(
        commitArtifactResponseSchema,
        {
          artifact: artifactPayload,
          assets,
        },
        { status: 409 },
      );
    }
    console.error("artifact commit failed", error);
    return returnError(500, "artifact_commit_failed", "Failed to commit artifact");
  }
}

