"use client";

import * as React from "react";

import type { ShippingOption, StoreProduct } from "./types";

type CatalogResponse = {
  products: StoreProduct[];
  shippingOptions: ShippingOption[];
};

export function useCapsuleStoreCatalog(capsuleId: string | null) {
  const [products, setProducts] = React.useState<StoreProduct[]>([]);
  const [shippingOptions, setShippingOptions] = React.useState<ShippingOption[]>([]);
  const [currency, setCurrency] = React.useState<string>("USD");
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const refreshCatalog = React.useCallback(async () => {
    if (!capsuleId) {
      setError("Capsule is not available right now.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let response: Response | null = null;
    try {
      response = await fetch(`/api/store/catalog?capsuleId=${encodeURIComponent(capsuleId)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Store request failed (${response.status})`);
      }
      const data = (await response.json()) as CatalogResponse;
      setProducts(
        data.products.map((product) => ({
          ...product,
          description: product.description ?? "",
        })),
      );
      setShippingOptions(
        data.shippingOptions.map((option, index) => ({
          ...option,
          detail: option.detail ?? "",
          active: option.active ?? true,
          sortOrder: option.sortOrder ?? index,
        })),
      );
      const nextCurrency =
        data.products[0]?.currency ?? data.shippingOptions[0]?.currency ?? "USD";
      setCurrency(nextCurrency.toUpperCase());
    } catch (err) {
      console.error("capsule.store.catalog.load_error", err);
      setError("Unable to load store catalog right now.");
    } finally {
      setLoading(false);
    }
  }, [capsuleId]);

  React.useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  return {
    products,
    setProducts,
    shippingOptions,
    setShippingOptions,
    currency,
    setCurrency,
    loading,
    error,
    refreshCatalog,
  };
}
