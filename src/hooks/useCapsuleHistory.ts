"use client";

import * as React from "react";

import type { CapsuleHistorySnapshot } from "@/types/capsules";

type UseCapsuleHistoryResult = {
  snapshot: CapsuleHistorySnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
};

export function useCapsuleHistory(
  capsuleId: string | null | undefined,
): UseCapsuleHistoryResult {
  const [snapshot, setSnapshot] = React.useState<CapsuleHistorySnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchHistory = React.useCallback(
    async (force?: boolean) => {
      if (!capsuleId) {
        setSnapshot(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const query = force ? "?refresh=1" : "";
        const response = await fetch(
          `/api/capsules/${encodeURIComponent(capsuleId)}/history${query}`,
          {
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || `Request failed (${response.status})`);
        }
        const payload = (await response.json()) as CapsuleHistorySnapshot;
        setSnapshot(payload);
      } catch (err) {
        console.error("capsule history fetch failed", err);
        setError(err instanceof Error ? err.message : "Failed to load capsule history");
        setSnapshot(null);
      } finally {
        setLoading(false);
      }
    },
    [capsuleId],
  );

  React.useEffect(() => {
    void fetchHistory(undefined);
  }, [fetchHistory]);

  const refresh = React.useCallback(
    async (force?: boolean) => {
      await fetchHistory(force);
    },
    [fetchHistory],
  );

  return {
    snapshot,
    loading,
    error,
    refresh,
  };
}
