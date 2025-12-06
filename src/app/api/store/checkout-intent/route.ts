import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { ensureSupabaseUser } from "@/lib/auth/payload";
import { createCheckoutIntent } from "@/server/store/service";
import { returnError, validatedJson } from "@/server/validation/http";

const checkoutRequestSchema = z.object({
  capsuleId: z.string().min(1, "capsuleId is required"),
  cart: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().nullable().optional(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1, "Cart cannot be empty"),
  contact: z.object({
    email: z.string().email(),
    phone: z.string().optional().nullable(),
  }),
  shippingOptionId: z.string().optional().nullable(),
  shippingAddress: z
    .object({
      name: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      line1: z.string().optional().nullable(),
      line2: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      region: z.string().optional().nullable(),
      postal: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  billingAddress: z
    .object({
      name: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      line1: z.string().optional().nullable(),
      line2: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      region: z.string().optional().nullable(),
      postal: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  billingSameAsShipping: z.boolean().optional(),
  promoCode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  termsVersion: z.string().optional().nullable(),
  termsAcceptedAt: z.string().optional().nullable(),
});

const checkoutResponseSchema = z.object({
  orderId: z.string(),
  paymentIntentId: z.string(),
  clientSecret: z.string(),
  subtotalCents: z.number(),
  shippingCents: z.number(),
  taxCents: z.number(),
  totalCents: z.number(),
  currency: z.string(),
  stripeTaxCalculationId: z.string().nullable(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON body");
  }

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid checkout payload", parsed.error.flatten());
  }

  try {
    // Attach the signed-in buyer when available, but keep guest checkout possible.
    const { userId } = await auth();
    const user = userId ? await currentUser() : null;
    const buyerUserId = user
      ? await ensureSupabaseUser({
          key: `clerk:${user.id}`,
          provider: "clerk",
          clerk_id: user.id,
          email: user.emailAddresses[0]?.emailAddress ?? null,
          full_name: user.fullName ?? null,
          avatar_url: user.imageUrl ?? null,
        })
      : null;

    const normalizeAddress = (address: (typeof parsed.data.shippingAddress) | null | undefined) => {
      if (!address) return null;
      return {
        name: address.name ?? null,
        email: address.email ?? null,
        phone: address.phone ?? null,
        line1: address.line1 ?? null,
        line2: address.line2 ?? null,
        city: address.city ?? null,
        region: address.region ?? null,
        postal: address.postal ?? null,
        country: address.country ?? null,
        notes: address.notes ?? null,
      };
    };

    const normalized = {
      capsuleId: parsed.data.capsuleId,
      contact: {
        ...parsed.data.contact,
        phone: parsed.data.contact.phone ?? null,
      },
      cart: parsed.data.cart.map((entry) => ({
        ...entry,
        variantId: entry.variantId ?? null,
      })),
      shippingOptionId: parsed.data.shippingOptionId ?? null,
      shippingAddress: normalizeAddress(parsed.data.shippingAddress),
      billingAddress: normalizeAddress(parsed.data.billingAddress),
      billingSameAsShipping: parsed.data.billingSameAsShipping ?? true,
      promoCode: parsed.data.promoCode ?? null,
      notes: parsed.data.notes ?? null,
      termsVersion: parsed.data.termsVersion ?? null,
      termsAcceptedAt: parsed.data.termsAcceptedAt ?? null,
      paymentMethod: null,
      buyerUserId,
    };
    const result = await createCheckoutIntent(normalized);
    return validatedJson(checkoutResponseSchema, result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("store.checkout_intent.failed", error);
    return returnError(500, "checkout_failed", "Unable to start checkout");
  }
}
