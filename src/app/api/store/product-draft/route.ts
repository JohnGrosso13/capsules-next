import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { ensureSupabaseUser } from "@/lib/auth/payload";
import { canCustomizeCapsule, resolveCapsuleActor } from "@/server/capsules/permissions";
import { draftStoreProductCopy } from "@/server/store/ai-products";
import { returnError, validatedJson } from "@/server/validation/http";

const requestSchema = z.object({
  capsuleId: z.string(),
  templateId: z.string(),
  templateLabel: z.string(),
  templateCategory: z.string(),
  templateBase: z.string().nullable().optional(),
  designPrompt: z.string().nullable().optional(),
  existingTitle: z.string().nullable().optional(),
  existingSummary: z.string().nullable().optional(),
  currency: z.string().optional(),
});

const responseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  price: z.number(),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to draft products");
  }
  const user = await currentUser();
  if (!user) {
    return returnError(401, "auth_required", "Sign in to draft products");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON body");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid product draft payload", parsed.error.flatten());
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
    return returnError(403, "forbidden", "You do not have permission to manage products for this capsule.");
  }

  try {
    const draft = await draftStoreProductCopy({
      capsuleId: parsed.data.capsuleId,
      actorId: supabaseUserId,
      templateId: parsed.data.templateId,
      templateLabel: parsed.data.templateLabel,
      templateCategory: parsed.data.templateCategory,
      templateBase: parsed.data.templateBase ?? null,
      designPrompt: parsed.data.designPrompt ?? null,
      existingTitle: parsed.data.existingTitle ?? null,
      existingSummary: parsed.data.existingSummary ?? null,
      currency: parsed.data.currency ?? "usd",
    });

    return validatedJson(
      responseSchema,
      {
        title: draft.title,
        summary: draft.summary,
        price: draft.price,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("store.products.draft_error", error);
    return returnError(500, "draft_failed", "The assistant could not draft this product.");
  }
}
