"use client";

import * as React from "react";

type WalletResponse = {
  balance: {
    computeGranted: number;
    computeUsed: number;
    storageGranted: number;
    storageUsed: number;
  };
  bypass: boolean;
};

export function useCreditUsage(): {
  percentRemaining: number | null;
  loading: boolean;
  error: string | null;
  bypass: boolean;
} {
  const [percentRemaining, setPercentRemaining] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [bypass, setBypass] = React.useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;
    const fetchUsage = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/billing/wallet", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = (await response.json()) as WalletResponse;
        if (cancelled) return;

        const computeTotal = Math.max(0, payload.balance.computeGranted);
        const computeUsed = Math.max(0, payload.balance.computeUsed);
        const storageTotal = Math.max(0, payload.balance.storageGranted);
        const storageUsed = Math.max(0, payload.balance.storageUsed);

        const computeRemaining = Math.max(0, computeTotal - computeUsed);
        const storageRemaining = Math.max(0, storageTotal - storageUsed);

        const computePercent =
          computeTotal > 0 ? (computeRemaining / computeTotal) * 100 : 0;
        const storagePercent =
          storageTotal > 0 ? (storageRemaining / storageTotal) * 100 : 0;

        const rawPercent = Math.min(computePercent, storagePercent);
        const clamped = Math.max(0, Math.min(100, Math.round(rawPercent)));

        setPercentRemaining(clamped);
        setBypass(Boolean(payload.bypass));
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message ?? "Unable to load usage");
        setPercentRemaining(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchUsage();

    return () => {
      cancelled = true;
    };
  }, []);

  return { percentRemaining, loading, error, bypass };
}

