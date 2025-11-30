import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { returnError, validatedJson } from "@/server/validation/http";
import {
  getPrompterChipsForSurface,
  type PrompterSurface,
} from "@/server/prompter/chips";

const responseSchema = z.object({
  chips: z.array(
    z.object({
      id: z.string().optional(),
      label: z.string(),
      value: z.string().optional(),
      surface: z.string().optional(),
      handoff: z.unknown().optional(),
      meta: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

function normalizeSurface(value: string | null): PrompterSurface {
  const normalized = (value ?? "").trim().toLowerCase();
  const allowed: PrompterSurface[] = ["home", "explore", "create", "capsule", "market", "memory", "profile", "settings", "live", "studio"];
  return (allowed.find((entry) => entry === normalized) ?? "home") as PrompterSurface;
}

export async function GET(req: Request) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!viewerId) {
    return returnError(401, "auth_required", "Sign in to get personalized chips.");
  }

  const { searchParams } = new URL(req.url);
  const surfaceParam = searchParams.get("surface");
  const surface = normalizeSurface(surfaceParam);

  try {
    const chips = await getPrompterChipsForSurface({
      userId: viewerId,
      surface,
      context: {
        now: new Date(),
        // Future: derive context from activity signals and origin.
      },
    });
    return validatedJson(responseSchema, { chips });
  } catch (error) {
    console.error("prompter.chips error", error);
    return returnError(500, "chips_error", "Failed to load chips.");
  }
}

export const runtime = "nodejs";


