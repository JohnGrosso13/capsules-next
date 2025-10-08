import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deleteCapsule } from "@/server/capsules/service";
import { returnError, validatedJson } from "@/server/validation/http";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

const deleteResponseSchema = z.object({
  deleted: z.boolean(),
});

export async function DELETE(
  req: Request,
  context: { params: { id: string } },
) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to delete a capsule.");
  }

  const parsedParams = paramsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsedParams.error.flatten());
  }

  try {
    const deleted = await deleteCapsule(ownerId, parsedParams.data.id);
    if (!deleted) {
      return returnError(404, "not_found", "Capsule not found or you do not have permission to delete it.");
    }
    return validatedJson(deleteResponseSchema, { deleted: true });
  } catch (error) {
    console.error("capsules.delete error", error);
    return returnError(500, "capsules_error", "Failed to delete capsule.");
  }
}

export const runtime = "nodejs";
