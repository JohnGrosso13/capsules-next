import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { ensureSupabaseUser } from "@/lib/auth/payload";
import { canCustomizeCapsule, resolveCapsuleActor } from "@/server/capsules/permissions";
import { deleteShippingOptionForCapsule, saveShippingOptionForCapsule } from "@/server/store/service";
import { returnError, validatedJson } from "@/server/validation/http";

const optionSchema = z.object({
  id: z.string().optional().nullable(),
  label: z.string(),
  detail: z.string().optional().nullable(),
  price: z.number(),
  currency: z.string().optional(),
  etaMinDays: z.number().int().nullable().optional(),
  etaMaxDays: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

const saveRequestSchema = z.object({
  capsuleId: z.string(),
  option: optionSchema,
});

const saveResponseSchema = z.object({
  option: z.object({
    id: z.string(),
    capsuleId: z.string(),
    label: z.string(),
    detail: z.string().nullable(),
    price: z.number(),
    currency: z.string(),
    etaMinDays: z.number().nullable(),
    etaMaxDays: z.number().nullable(),
    active: z.boolean(),
    sortOrder: z.number(),
  }),
});

const deleteRequestSchema = z.object({
  capsuleId: z.string(),
  optionId: z.string(),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to manage shipping options");
  }
  const user = await currentUser();
  if (!user) {
    return returnError(401, "auth_required", "Sign in to manage shipping options");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON body");
  }

  const parsed = saveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid shipping option", parsed.error.flatten());
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
    return returnError(403, "forbidden", "You do not have permission to manage shipping options for this capsule.");
  }

  try {
    const saved = await saveShippingOptionForCapsule({
      capsuleId: parsed.data.capsuleId,
      option: {
        id: parsed.data.option.id ?? null,
        label: parsed.data.option.label,
        detail: parsed.data.option.detail ?? null,
        priceCents: Math.round(parsed.data.option.price * 100),
        currency: parsed.data.option.currency ?? "usd",
        etaMinDays: parsed.data.option.etaMinDays ?? null,
        etaMaxDays: parsed.data.option.etaMaxDays ?? null,
        active: parsed.data.option.active ?? true,
        sortOrder: parsed.data.option.sortOrder ?? 0,
      },
    });

    return validatedJson(
      saveResponseSchema,
      {
        option: {
          id: saved.id,
          capsuleId: saved.capsuleId,
          label: saved.label,
          detail: saved.detail,
          price: saved.priceCents / 100,
          currency: saved.currency,
          etaMinDays: saved.etaMinDays,
          etaMaxDays: saved.etaMaxDays,
          active: saved.active,
          sortOrder: saved.sortOrder,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("store.shipping_options.save_error", error);
    return returnError(500, "save_failed", "Failed to save shipping option");
  }
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to manage shipping options");
  }
  const user = await currentUser();
  if (!user) {
    return returnError(401, "auth_required", "Sign in to manage shipping options");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON body");
  }

  const parsed = deleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid delete payload", parsed.error.flatten());
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
    return returnError(403, "forbidden", "You do not have permission to manage shipping options for this capsule.");
  }

  try {
    await deleteShippingOptionForCapsule(parsed.data.capsuleId, parsed.data.optionId);
    return validatedJson(z.object({ ok: z.boolean() }), { ok: true }, { status: 200 });
  } catch (error) {
    console.error("store.shipping_options.delete_error", error);
    return returnError(500, "delete_failed", "Failed to delete shipping option");
  }
}
