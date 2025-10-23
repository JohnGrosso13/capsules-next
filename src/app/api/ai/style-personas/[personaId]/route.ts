import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deleteStylePersona } from "@/server/capsules/style-personas";
import { returnError, validatedJson } from "@/server/validation/http";

const paramsSchema = z.object({
  personaId: z.string().uuid(),
});

const deleteResponseSchema = z.object({
  success: z.boolean(),
});

export async function DELETE(req: Request, context: { params: unknown }) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to manage style personas.");
  }

  const parsedParams = paramsSchema.safeParse(context.params ?? {});
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid persona id.");
  }

  try {
    const removed = await deleteStylePersona(parsedParams.data.personaId, ownerId);
    if (!removed) {
      return returnError(404, "not_found", "Style persona not found.");
    }
    return validatedJson(deleteResponseSchema, { success: true });
  } catch (error) {
    console.error("style persona delete error", error);
    return returnError(500, "style_persona_delete_failed", "Failed to delete style persona.");
  }
}

export const runtime = "nodejs";
