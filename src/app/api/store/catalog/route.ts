import { z } from "zod";

import { loadStoreCatalog } from "@/server/store/service";
import { returnError, validatedJson } from "@/server/validation/http";

const responseSchema = z.object({
  products: z.array(
    z.object({
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
    }),
  ),
  shippingOptions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      detail: z.string().nullable(),
      price: z.number(),
      currency: z.string(),
      etaMinDays: z.number().nullable(),
      etaMaxDays: z.number().nullable(),
      active: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }),
  ),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const capsuleId = searchParams.get("capsuleId");
  if (!capsuleId) {
    return returnError(400, "invalid_request", "capsuleId is required");
  }

  try {
    const { products, variants, shippingOptions } = await loadStoreCatalog(capsuleId);
    const variantByProduct = variants.reduce<Record<string, typeof variants>>((acc, variant) => {
      const productVariants = acc[variant.productId] ?? [];
      productVariants.push(variant);
      acc[variant.productId] = productVariants;
      return acc;
    }, {});

    const payload = {
      products: products.map((product) => ({
        id: product.id,
        capsuleId: product.capsuleId,
        title: product.title,
        description: product.description,
        price: product.priceCents / 100,
        currency: product.currency,
        imageUrl: product.imageUrl ?? product.mediaUrl ?? null,
        memoryId: product.memoryId,
        featured: product.featured,
        order: product.sortOrder,
        salesCount: product.salesCount,
        active: product.active,
        kind: product.kind,
        fulfillmentKind: product.fulfillmentKind,
        inventoryCount: product.inventoryCount,
        fulfillmentUrl: product.fulfillmentUrl,
        sku: product.sku,
        hero: product.hero,
        createdAt: product.createdAt,
        variants: (variantByProduct[product.id] ?? []).map((variant) => ({
          id: variant.id,
          productId: variant.productId,
          label: variant.label,
          price: variant.priceCents !== null ? variant.priceCents / 100 : null,
          inventoryCount: variant.inventoryCount,
          sku: variant.sku,
          printfulVariantId:
            (variant.metadata?.["printful_variant_id"] as string | number | null | undefined) ?? null,
          active: variant.active,
        })),
      })),
      shippingOptions: shippingOptions.map((option) => ({
        id: option.id,
        label: option.label,
        detail: option.detail,
        price: option.priceCents / 100,
        currency: option.currency,
        etaMinDays: option.etaMinDays,
        etaMaxDays: option.etaMaxDays,
        active: option.active,
        sortOrder: option.sortOrder,
      })),
    };

    return validatedJson(responseSchema, payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("store.catalog.error", error);
    return returnError(500, "catalog_error", "Failed to load store catalog");
  }
}
