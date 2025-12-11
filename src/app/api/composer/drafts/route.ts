import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { composerChatMessageSchema } from "@/shared/schemas/ai";
import {
  composerDraftResponseSchema,
  composerDraftSchema,
  listComposerDrafts,
  saveComposerDraft,
} from "@/server/composer/drafts";
import { returnError, validatedJson } from "@/server/validation/http";

export const runtime = "nodejs";

const saveRequestSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
  threadId: z.string().optional(),
  prompt: z.string().default(""),
  message: z.string().nullable().optional(),
  draft: z.unknown().default({}),
  rawPost: z.unknown().nullable().optional(),
  history: z.array(composerChatMessageSchema).default([]),
});

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  try {
    const drafts = await listComposerDrafts(ownerId);
    return validatedJson(composerDraftResponseSchema, { drafts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load drafts.";
    return returnError(500, "composer_drafts_fetch_failed", message);
  }
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const payload = await req.json().catch(() => null);
  const parsed = saveRequestSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid draft payload.");
  }

  try {
    const draft = await saveComposerDraft(ownerId, parsed.data);
    return validatedJson(z.object({ draft: composerDraftSchema }), { draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save draft.";
    return returnError(500, "composer_drafts_save_failed", message);
  }
}
