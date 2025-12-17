import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { ensureSupabaseUser } from "@/lib/auth/payload";
import { canCustomizeCapsule, resolveCapsuleActor } from "@/server/capsules/permissions";
import { deleteProductForCapsule, saveProductForCapsule } from "@/server/store/service";
import { returnError, validatedJson } from "@/server/validation/http";

const variantSchema = z.object({
  id: z.string().nullable().optional(),
  label: z.string(),
  price: z.number().nullable().optional(),
  inventoryCount: z.number().nullable().optional(),
  sku: z.string().nullable().optional(),
  printfulVariantId: z.union([z.string(), z.number()]).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

const productSchema = z.object({
  id: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  price: z.number(),
  currency: z.string().optional(),
  active: z.boolean().optional(),
  inventoryCount: z.number().nullable().optional(),
  fulfillmentKind: z.enum(["download", "ship", "external"]).optional(),
  fulfillmentUrl: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  memoryId: z.string().nullable().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().optional(),
  sku: z.string().nullable().optional(),
  kind: z.enum(["digital", "physical", "service"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  variants: z.array(variantSchema),
});

const requestSchema = z.object({
  capsuleId: z.string(),
  product: productSchema,
});

const deleteSchema = z.object({
  capsuleId: z.string(),
  productId: z.string(),
});

const responseSchema = z.object({
  product: z.object({
    id: z.string(),
    capsuleId: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    price: z.number(),
    currency: z.string(),
    imageUrl: z.string().nullable(),
    memoryId: z.string().nullable(),
    featured: z.boolean(),
    order: z.number(),
    salesCount: z.number(),
    active: z.boolean(),
    kind: z.string(),
    fulfillmentKind: z.string(),
    inventoryCount: z.number().nullable(),
    fulfillmentUrl: z.string().nullable(),
    sku: z.string().nullable(),
    hero: z.boolean(),
    createdAt: z.string(),
  }),
  variants: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      label: z.string(),
      price: z.number().nullable(),
      inventoryCount: z.number().nullable(),
      sku: z.string().nullable(),
      printfulVariantId: z.union([z.string(), z.number()]).nullable().optional(),
      active: z.boolean(),
    }),
  ),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to manage products");
  }
  const user = await currentUser();
  if (!user) {
    return returnError(401, "auth_required", "Sign in to manage products");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON body");
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid product payload", parsed.error.flatten());
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
    const saved = await saveProductForCapsule({
      capsuleId: parsed.data.capsuleId,
      actorUserId: supabaseUserId,
      product: {
        id: parsed.data.product.id ?? null,
        title: parsed.data.product.title,
        description: parsed.data.product.description ?? null,
        priceCents: Math.round((parsed.data.product.price ?? 0) * 100),
        currency: parsed.data.product.currency ?? "usd",
        active: parsed.data.product.active ?? true,
        inventoryCount: parsed.data.product.inventoryCount ?? null,
        fulfillmentKind: parsed.data.product.fulfillmentKind ?? "ship",
        fulfillmentUrl: parsed.data.product.fulfillmentUrl ?? null,
        imageUrl: parsed.data.product.imageUrl ?? null,
        memoryId: parsed.data.product.memoryId ?? null,
        featured: parsed.data.product.featured ?? false,
        sortOrder: parsed.data.product.sortOrder ?? 0,
        sku: parsed.data.product.sku ?? null,
        kind: parsed.data.product.kind ?? "physical",
        metadata: parsed.data.product.metadata ?? {},
      },
      variants: parsed.data.product.variants.map((variant, index) => ({
        id: variant.id ?? null,
        label: variant.label,
        priceCents: variant.price !== null && variant.price !== undefined ? Math.round(variant.price * 100) : null,
        currency: parsed.data.product.currency ?? "usd",
        inventoryCount: variant.inventoryCount ?? null,
        sku: variant.sku ?? null,
        printfulVariantId: variant.printfulVariantId ?? null,
        active: variant.active ?? true,
        sortOrder: typeof variant.sortOrder === "number" ? variant.sortOrder : index,
      })),
    });

    return validatedJson(
      responseSchema,
      {
        product: {
          id: saved.product.id,
          capsuleId: saved.product.capsuleId,
          title: saved.product.title,
          description: saved.product.description,
          price: saved.product.priceCents / 100,
          currency: saved.product.currency,
          imageUrl: saved.product.imageUrl,
          memoryId: saved.product.memoryId,
          featured: saved.product.featured,
          order: saved.product.sortOrder,
          salesCount: saved.product.salesCount,
          active: saved.product.active,
          kind: saved.product.kind,
          fulfillmentKind: saved.product.fulfillmentKind,
          inventoryCount: saved.product.inventoryCount,
          fulfillmentUrl: saved.product.fulfillmentUrl,
          sku: saved.product.sku ?? null,
          hero: saved.product.hero,
          createdAt: saved.product.createdAt,
        },
        variants: saved.variants.map((variant) => ({
          id: variant.id,
          productId: variant.productId,
          label: variant.label,
          price: variant.priceCents !== null ? variant.priceCents / 100 : null,
          inventoryCount: variant.inventoryCount,
          sku: variant.sku ?? null,
          printfulVariantId: (variant.metadata?.["printful_variant_id"] as string | number | null | undefined) ?? null,
          active: variant.active,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("store.products.save_error", error);
    return returnError(500, "save_failed", "Failed to save product");
  }
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to manage products");
  }
  const user = await currentUser();
  if (!user) {
    return returnError(401, "auth_required", "Sign in to manage products");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return returnError(400, "invalid_request", "Invalid JSON body");
  }

  const parsed = deleteSchema.safeParse(body);
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
    return returnError(403, "forbidden", "You do not have permission to manage products for this capsule.");
  }

  try {
    await deleteProductForCapsule(parsed.data.capsuleId, parsed.data.productId);
    return validatedJson(z.object({ ok: z.boolean() }), { ok: true }, { status: 200 });
  } catch (error) {
    console.error("store.products.delete_error", error);
    return returnError(500, "delete_failed", "Failed to remove product");
  }
}
