import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  getUserPanelLayouts,
  upsertUserPanelLayouts,
  type PanelLayoutEntry,
} from "@/lib/supabase/studio-layouts";
import { parseJsonBody, returnError } from "@/server/validation/http";
import { z } from "zod";

export const runtime = "nodejs";

const DEFAULT_VIEW = "ai-stream-studio";

const layoutStateSchema = z
  .object({
    layout: z.array(z.number()),
    expandToSizes: z.record(z.number()).optional(),
  })
  .passthrough();

const saveRequestSchema = z.object({
    view: z.string().min(1).max(120).default(DEFAULT_VIEW),
    entries: z
      .array(
        z.object({
          storageKey: z.string().min(1).max(255),
          state: layoutStateSchema,
        }),
      )
      .min(1)
      .max(12),
  });

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const { searchParams } = new URL(req.url);
  const view = (searchParams.get("view") ?? DEFAULT_VIEW).trim() || DEFAULT_VIEW;

  const keysParam = searchParams.getAll("key");
  const keys: string[] = [];
  for (const value of keysParam) {
    const normalized = value.trim();
    if (normalized) {
      normalized.split(",").forEach((token) => {
        const key = token.trim();
        if (key) keys.push(key);
      });
    }
  }

  const layouts = await getUserPanelLayouts(ownerId, view, keys.length ? keys : undefined);
  return Response.json({ view, layouts });
}

export async function PUT(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsed = await parseJsonBody(req, saveRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { view, entries } = parsed.data;

  const normalizedEntries: PanelLayoutEntry[] = entries.map((entry) => ({
    storageKey: entry.storageKey,
    state: entry.state,
  }));

  await upsertUserPanelLayouts(ownerId, view, normalizedEntries);

  return Response.json({ ok: true });
}
