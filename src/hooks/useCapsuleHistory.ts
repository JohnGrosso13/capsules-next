"use client";

import * as React from "react";

import type { CapsuleHistorySection, CapsuleHistorySnapshot } from "@/types/capsules";

type UseCapsuleHistoryResult = {
  sections: CapsuleHistorySection[];
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
};

const EMPTY_SECTIONS: CapsuleHistorySection[] = [];

export function useCapsuleHistory(
  capsuleId: string | null | undefined,
): UseCapsuleHistoryResult {
  const [sections, setSections] = React.useState<CapsuleHistorySection[]>(EMPTY_SECTIONS);
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchHistory = React.useCallback(
    async (force?: boolean) => {
      if (!capsuleId) {
        setSections(EMPTY_SECTIONS);
        setGeneratedAt(null);
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
        setSections(Array.isArray(payload.sections) ? payload.sections : EMPTY_SECTIONS);
        setGeneratedAt(typeof payload.generatedAt === "string" ? payload.generatedAt : null);
      } catch (err) {
        console.error("capsule history fetch failed", err);
        setError(err instanceof Error ? err.message : "Failed to load capsule history");
        setSections(EMPTY_SECTIONS);
        setGeneratedAt(null);
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
    sections,
    generatedAt,
    loading,
    error,
    refresh,
  };
}
