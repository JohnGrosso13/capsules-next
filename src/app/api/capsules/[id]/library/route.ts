import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { getCapsuleLibrary, CapsuleMembershipError } from "@/server/capsules/service";
import { returnError, validatedJson } from "@/server/validation/http";

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

const responseSchema = z.object({
  media: z.array(z.any()),
  files: z.array(z.any()),
});

type LibraryRouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

async function resolveParams(context: LibraryRouteContext): Promise<{ id: string }> {
  const value = context.params;
  if (value instanceof Promise) {
    return value;
  }
  return value;
}

export const runtime = "nodejs";

export async function GET(req: Request, context: LibraryRouteContext) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: true });
  const params = await resolveParams(context);
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsed.error.flatten());
  }

  try {
    const library = await getCapsuleLibrary(parsed.data.id, viewerId, {
      origin: deriveRequestOrigin(req),
    });
    return validatedJson(responseSchema, library);
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("capsules.library error", error);
    return returnError(500, "capsule_library_error", "Failed to load capsule library.");
  }
}
