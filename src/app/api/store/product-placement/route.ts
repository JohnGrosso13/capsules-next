import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { ensureSupabaseUser } from "@/lib/auth/payload";
import { canCustomizeCapsule, resolveCapsuleActor } from "@/server/capsules/permissions";
import { inferProductPlacement } from "@/server/store/ai-placement";
import { returnError, validatedJson } from "@/server/validation/http";
import type { PlacementPlan } from "@/components/create/products/placement-types";

const placementPlanSchema = z.object({
  surface: z.string(),
  scale: z.number(),
  offsetX: z.number(),
  offsetY: z.number(),
  fit: z.string().optional(),
});

const requestSchema = z.object({
  capsuleId: z.string(),
  templateId: z.string(),
  templateLabel: z.string().optional(),
  templateCategory: z.string().optional(),
  templateBase: z.string().nullable().optional(),
  text: z.string(),
  currentPlan: placementPlanSchema.partial().optional(),
});

const responseSchema = z.object({
  plan: placementPlanSchema,
  summary: z.string(),
  surfaceLabel: z.string(),
  message: z.string(),
  warnings: z.array(z.string()),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to place this design.");
  }
  const user = await currentUser();
  if (!user) {
    return returnError(401, "auth_required", "Sign in to place this design.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON body");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid placement payload", parsed.error.flatten());
  }

  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    full_name: user.fullName ?? null,
    avatar_url: user.imageUrl ?? null,
  });

  const actor = await resolveCapsuleActor(parsed.data.capsuleId, supabaseUserId);
  if (!canCustomizeCapsule(actor)) {
    return returnError(403, "forbidden", "You do not have permission to edit this capsule.");
  }

  try {
    const result = await inferProductPlacement({
      capsuleId: parsed.data.capsuleId,
      actorId: supabaseUserId,
      templateId: parsed.data.templateId,
      text: parsed.data.text,
      currentPlan: (parsed.data.currentPlan ?? null) as Partial<PlacementPlan> | null,
    });

    return validatedJson(
      responseSchema,
      {
        plan: result.plan,
        summary: result.summary,
        surfaceLabel: result.surfaceLabel,
        message: result.message,
        warnings: result.warnings,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("store.products.placement_error", error);
    return returnError(
      500,
      "placement_failed",
      error instanceof Error ? error.message : "Capsule AI could not place that design.",
    );
  }
}
