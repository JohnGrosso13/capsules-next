"use client";

import * as React from "react";
import type { ShippingOption } from "./types";

type UseCapsuleStoreShippingOptionsParams = {
  capsuleId: string | null;
  currency: string;
  initialOptions: ShippingOption[];
  onError?: (message: string) => void;
};

const normalizeOptions = (options: ShippingOption[]): ShippingOption[] =>
  options.map((option, index) => ({
    ...option,
    detail: option.detail ?? "",
    active: option.active ?? true,
    sortOrder: option.sortOrder ?? index,
  }));

export function useCapsuleStoreShippingOptions({
  capsuleId,
  currency,
  initialOptions,
  onError,
}: UseCapsuleStoreShippingOptionsParams) {
  const [shippingOptions, setShippingOptions] = React.useState<ShippingOption[]>(() =>
    normalizeOptions(initialOptions),
  );
  const [shippingSaveBusy, setShippingSaveBusy] = React.useState(false);
  const [shippingSaveError, setShippingSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setShippingOptions(normalizeOptions(initialOptions));
  }, [initialOptions]);

  const addShippingOption = React.useCallback(() => {
    const nextId = `shipping-${Date.now()}`;
    const nextOrder = shippingOptions.length
      ? Math.max(...shippingOptions.map((o) => o.sortOrder ?? 0)) + 1
      : 0;
    const fresh: ShippingOption = {
      id: nextId,
      label: "New option",
      detail: "",
      price: 0,
      currency,
      etaMinDays: null,
      etaMaxDays: null,
      active: true,
      sortOrder: nextOrder,
    };
    setShippingOptions((previous) => [...previous, fresh]);
  }, [currency, shippingOptions]);

  const updateShippingOptionField = React.useCallback(
    (optionId: string, field: keyof ShippingOption, value: unknown) => {
      setShippingOptions((previous) =>
        previous.map((option) => (option.id === optionId ? { ...option, [field]: value } : option)),
      );
    },
    [],
  );

  const persistShippingOption = React.useCallback(
    async (optionId: string) => {
      const option = shippingOptions.find((entry) => entry.id === optionId);
      if (!option || !capsuleId) {
        setShippingSaveError("Capsule is not available.");
        return;
      }
      setShippingSaveBusy(true);
      setShippingSaveError(null);
      try {
        const response = await fetch("/api/store/shipping-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capsuleId,
            option: {
              id: optionId.startsWith("shipping-") ? null : option.id,
              label: option.label,
              detail: option.detail ?? "",
              price: option.price,
              currency: option.currency ?? currency,
              etaMinDays: option.etaMinDays ?? null,
              etaMaxDays: option.etaMaxDays ?? null,
              active: option.active,
              sortOrder: option.sortOrder ?? 0,
            },
          }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to save shipping option");
        }
        const data: { option: ShippingOption } = await response.json();
        const savedOption: ShippingOption = {
          ...data.option,
          detail: data.option.detail ?? "",
        };
        setShippingOptions((previous) => {
          const withoutTemp = optionId.startsWith("shipping-")
            ? previous.filter((entry) => entry.id !== optionId)
            : previous;
          const exists = withoutTemp.some((entry) => entry.id === savedOption.id);
          const next = exists
            ? withoutTemp.map((entry) => (entry.id === savedOption.id ? savedOption : entry))
            : [...withoutTemp, savedOption];
          return next.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save shipping option";
        setShippingSaveError(message);
        onError?.(message);
      } finally {
        setShippingSaveBusy(false);
      }
    },
    [capsuleId, currency, onError, shippingOptions],
  );

  const deleteShippingOption = React.useCallback(
    async (optionId: string) => {
      const option = shippingOptions.find((entry) => entry.id === optionId);
      setShippingOptions((previous) => previous.filter((entry) => entry.id !== optionId));
      if (!option || optionId.startsWith("shipping-")) return;
      if (!capsuleId) {
        setShippingSaveError("Capsule is not available.");
        return;
      }
      try {
        const response = await fetch("/api/store/shipping-options", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capsuleId, optionId }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to delete shipping option");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete shipping option";
        setShippingSaveError(message);
        onError?.(message);
        if (option) {
          setShippingOptions((previous) =>
            [...previous, option].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
          );
        }
      }
    },
    [capsuleId, onError, shippingOptions],
  );

  return {
    shippingOptions,
    shippingSaveBusy,
    shippingSaveError,
    setShippingSaveError,
    addShippingOption,
    updateShippingOptionField,
    persistShippingOption,
    deleteShippingOption,
  };
}
