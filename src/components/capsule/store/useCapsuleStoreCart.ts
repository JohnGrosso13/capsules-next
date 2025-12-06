"use client";

import * as React from "react";
import type { StoreCartItem, StoreProduct, StoreProductVariant } from "./types";

type UseCapsuleStoreCartParams = {
  products: StoreProduct[];
  visibleProducts: StoreProduct[];
  variantSelection: Record<string, string | null>;
  getDefaultVariantId: (product: StoreProduct) => string | null;
  resolveVariant: (product: StoreProduct, variantId?: string | null) => StoreProductVariant | null;
  getAvailableInventory: (product: StoreProduct, variantId?: string | null) => number;
  isFounder: boolean;
  onInventoryError?: (message: string) => void;
};

export function useCapsuleStoreCart({
  products,
  visibleProducts,
  variantSelection,
  getDefaultVariantId,
  resolveVariant,
  getAvailableInventory,
  isFounder,
  onInventoryError,
}: UseCapsuleStoreCartParams) {
  const [cart, setCart] = React.useState<Record<string, number>>({});

  const createCartKey = React.useCallback(
    (productId: string, variantId: string | null | undefined) =>
      `${productId}::${variantId ?? "base"}`,
    [],
  );

  const parseCartKey = React.useCallback(
    (key: string) => {
      const [productId, variantId] = key.split("::");
      return { productId, variantId: variantId === "base" ? null : variantId };
    },
    [],
  );

  const addToCart = React.useCallback(
    (productId: string, variantId?: string | null) => {
      const product = products.find((entry) => entry.id === productId);
      if (!product) return;
      if (!product.active && !isFounder) return;
      const resolvedVariantId =
        variantId ?? variantSelection[productId] ?? getDefaultVariantId(product);
      const key = createCartKey(productId, resolvedVariantId);
      const available = getAvailableInventory(product, resolvedVariantId);
      setCart((previous) => {
        const current = previous[key] ?? 0;
        if (available !== Number.POSITIVE_INFINITY && current + 1 > available) {
          onInventoryError?.("Not enough inventory for this option.");
          return previous;
        }
        return {
          ...previous,
          [key]: current + 1,
        };
      });
    },
    [createCartKey, getAvailableInventory, getDefaultVariantId, isFounder, products, variantSelection, onInventoryError],
  );

  const removeFromCart = React.useCallback((cartKey: string) => {
    setCart((previous) => {
      const next = { ...previous };
      delete next[cartKey];
      return next;
    });
  }, []);

  const increment = React.useCallback(
    (cartKey: string) => {
      setCart((previous) => {
        const current = previous[cartKey] ?? 0;
        const { productId, variantId } = parseCartKey(cartKey);
        const product = products.find((entry) => entry.id === productId);
        if (!product) return previous;
        const available = getAvailableInventory(product, variantId);
        if (available !== Number.POSITIVE_INFINITY && current + 1 > available) {
          onInventoryError?.("Inventory limit reached for this item.");
          return previous;
        }
        return {
          ...previous,
          [cartKey]: Math.max(1, current + 1),
        };
      });
    },
    [getAvailableInventory, onInventoryError, parseCartKey, products],
  );

  const decrement = React.useCallback((cartKey: string) => {
    setCart((previous) => {
      const current = previous[cartKey] ?? 0;
      if (current <= 1) {
        const next = { ...previous };
        delete next[cartKey];
        return next;
      }
      return {
        ...previous,
        [cartKey]: current - 1,
      };
    });
  }, []);

  const cartItems = React.useMemo<StoreCartItem[]>(() => {
    const entries = Object.entries(cart);
    const items = entries
      .map(([key, quantity]) => {
        if (quantity <= 0) return null;
        const { productId, variantId } = parseCartKey(key);
        const product = visibleProducts.find((p) => p.id === productId);
        if (!product) return null;
        const variant = resolveVariant(product, variantId);
        const unitPrice = variant?.price ?? product.price;
        return { key, product, variant, quantity, unitPrice };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    return items;
  }, [cart, parseCartKey, resolveVariant, visibleProducts]);

  const hasItems = cartItems.length > 0;

  return {
    cart,
    setCart,
    cartItems,
    hasItems,
    createCartKey,
    parseCartKey,
    addToCart,
    removeFromCart,
    increment,
    decrement,
  };
}
