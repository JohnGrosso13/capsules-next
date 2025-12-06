import { describe, expect, it } from "vitest";

import { assembleCartItems, filterActiveItems } from "@/server/store/repository";
import type { StoreProductRecord, StoreProductVariantRecord } from "@/server/store/types";

const product = (overrides: Partial<StoreProductRecord>): StoreProductRecord => ({
  id: "p1",
  capsuleId: "c1",
  createdBy: null,
  title: "Item",
  description: null,
  priceCents: 1000,
  currency: "usd",
  active: true,
  inventoryCount: null,
  fulfillmentKind: "ship",
  fulfillmentUrl: null,
  mediaUrl: null,
  imageUrl: null,
  memoryId: null,
  metadata: {},
  featured: false,
  sortOrder: 0,
  salesCount: 0,
  sku: null,
  hero: false,
  kind: "physical",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

const variant = (overrides: Partial<StoreProductVariantRecord>): StoreProductVariantRecord => ({
  id: "v1",
  productId: "p1",
  label: "Variant",
  priceCents: 1200,
  currency: "usd",
  inventoryCount: null,
  sku: null,
  active: true,
  sortOrder: 0,
  metadata: {},
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

describe("store.repository helpers", () => {
  it("filters active items only", () => {
    const items = filterActiveItems([
      { id: "a", active: true },
      { id: "b", active: false },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("a");
  });

  it("assembles cart items using variant price and skips inactive products/variants", () => {
    const products: StoreProductRecord[] = [
      product({ id: "p1", active: true, priceCents: 1000 }),
      product({ id: "p2", active: false, priceCents: 5000 }),
    ];
    const variants: StoreProductVariantRecord[] = [
      variant({ id: "v1", productId: "p1", active: true, priceCents: 1200 }),
      variant({ id: "v2", productId: "p1", active: false, priceCents: 3000 }),
    ];
    const { subtotalCents, items } = assembleCartItems(
      [
        { productId: "p1", variantId: "v1", quantity: 2 }, // uses variant price 1200 * 2
        { productId: "p1", variantId: "v2", quantity: 1 }, // inactive variant -> skipped
        { productId: "p2", variantId: null, quantity: 1 }, // inactive product -> skipped
        { productId: "p1", variantId: null, quantity: 0 }, // quantity coerced to 1, uses product price
      ],
      products,
      variants,
    );

    expect(items).toHaveLength(2);
    expect(subtotalCents).toBe(1200 * 2 + 1000 * 1);
    const first = items.find((i) => i.variant?.id === "v1");
    expect(first?.unitPriceCents).toBe(1200);
  });
});
