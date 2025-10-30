import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { AIConfigError } from "@/lib/ai/prompter";
import { getCapsuleHistory, CapsuleMembershipError } from "@/server/capsules/service";
import { returnError, validatedJson } from "@/server/validation/http";

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

const timelineItemSchema = z.object({
  label: z.string(),
  detail: z.string(),
  timestamp: z.string().nullable(),
  postId: z.string().optional().nullable(),
  permalink: z.string().optional().nullable(),
});

const sectionSchema = z.object({
  period: z.enum(["weekly", "monthly", "all_time"]),
  title: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextFocus: z.array(z.string()),
  timeline: z.array(timelineItemSchema),
  timeframe: z.object({
    start: z.string().nullable(),
    end: z.string().nullable(),
  }),
  postCount: z.number().int().nonnegative(),
  isEmpty: z.boolean(),
});

const responseSchema = z.object({
  capsuleId: z.string(),
  capsuleName: z.string().nullable(),
  generatedAt: z.string(),
  sections: z.array(sectionSchema),
});

type HistoryRouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

async function resolveParams(context: HistoryRouteContext): Promise<{ id: string }> {
  const value = context.params;
  if (value instanceof Promise) {
    return value;
  }
  return value;
}

function shouldForceRefresh(url: URL): boolean {
  const refresh = url.searchParams.get("refresh");
  if (!refresh) return false;
  const normalized = refresh.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export const runtime = "nodejs";

export async function GET(req: Request, context: HistoryRouteContext) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!viewerId) {
    return returnError(401, "auth_required", "Sign in to view capsule history.");
  }

  const params = await resolveParams(context);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsedParams.error.flatten());
  }

  const forceRefresh = shouldForceRefresh(new URL(req.url));

  try {
    const history = await getCapsuleHistory(parsedParams.data.id, viewerId, {
      forceRefresh,
    });
    return validatedJson(responseSchema, history);
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    if (error instanceof AIConfigError) {
      return returnError(
        503,
        "ai_configuration_required",
        "OpenAI configuration is required to generate capsule history.",
      );
    }
    console.error("capsules.history GET error", error);
    return returnError(500, "capsule_history_error", "Failed to load capsule history.");
  }
}
