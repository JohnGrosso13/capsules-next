import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  createStylePersona,
  listStylePersonas,
  type CapsuleStylePersonaRecord,
} from "@/server/capsules/style-personas";

const querySchema = z.object({
  capsuleId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  capsuleId: z.string().uuid().nullable().optional(),
  palette: z.string().max(280).nullable().optional(),
  medium: z.string().max(280).nullable().optional(),
  camera: z.string().max(280).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const personaResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  palette: z.string().nullable(),
  medium: z.string().nullable(),
  camera: z.string().nullable(),
  notes: z.string().nullable(),
  capsuleId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const listResponseSchema = z.object({
  personas: z.array(personaResponseSchema),
});

function mapPersona(persona: CapsuleStylePersonaRecord) {
  return {
    id: persona.id,
    name: persona.name,
    palette: persona.palette,
    medium: persona.medium,
    camera: persona.camera,
    notes: persona.notes,
    capsuleId: persona.capsuleId,
    createdAt: persona.createdAt,
    updatedAt: persona.updatedAt,
  };
}

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to manage style personas.");
  }

  const url = new URL(req.url);
  const rawParams: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    rawParams[key] = value;
  });
  const parsedQuery = querySchema.safeParse(rawParams);
  if (!parsedQuery.success) {
    return returnError(400, "invalid_request", "Invalid query parameters.", {
      issues: parsedQuery.error.issues,
    });
  }

  try {
    const personas = await listStylePersonas({
      ownerUserId: ownerId,
      capsuleId: parsedQuery.data.capsuleId ?? null,
      limit: parsedQuery.data.limit ?? 20,
    });

    return validatedJson(listResponseSchema, {
      personas: personas.map(mapPersona),
    });
  } catch (error) {
    console.error("style persona list error", error);
    return returnError(500, "style_persona_list_failed", "Failed to load style personas.");
  }
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to manage style personas.");
  }

  const parsed = await parseJsonBody(req, createSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const persona = await createStylePersona({
      ownerUserId: ownerId,
      capsuleId: parsed.data.capsuleId ?? null,
      name: parsed.data.name.trim(),
      palette: parsed.data.palette?.trim() || null,
      medium: parsed.data.medium?.trim() || null,
      camera: parsed.data.camera?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
    });

    return validatedJson(personaResponseSchema, mapPersona(persona));
  } catch (error) {
    console.error("style persona create error", error);
    return returnError(500, "style_persona_create_failed", "Failed to save style persona.");
  }
}

export const runtime = "nodejs";
