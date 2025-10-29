"use client";

import * as React from "react";

export type CapsuleLadderSummary = {
  id: string;
  capsuleId: string;
  name: string;
  slug: string | null;
  summary: string | null;
  status: "draft" | "active" | "archived";
  visibility: "private" | "capsule" | "public";
  createdById: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  meta: Record<string, unknown> | null;
};

type UseCapsuleLaddersResult = {
  ladders: CapsuleLadderSummary[];
  tournaments: CapsuleLadderSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useCapsuleLadders(capsuleId: string | null): UseCapsuleLaddersResult {
  const [items, setItems] = React.useState<CapsuleLadderSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchLadders = React.useCallback(async () => {
    if (!capsuleId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/capsules/${capsuleId}/ladders`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load ladders (${response.status})`);
      }

      const data = (await response.json()) as { ladders?: CapsuleLadderSummary[] };
      setItems(Array.isArray(data.ladders) ? data.ladders : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [capsuleId]);

  React.useEffect(() => {
    void fetchLadders();
  }, [fetchLadders]);

  const ladders = React.useMemo(() => {
    return items.filter((entry) => {
      const variant =
        entry.meta && typeof entry.meta === "object"
          ? ((entry.meta as Record<string, unknown>).variant as string | undefined)
          : undefined;
      return !variant || variant === "ladder";
    });
  }, [items]);

  const tournaments = React.useMemo(() => {
    return items.filter((entry) => {
      const variant =
        entry.meta && typeof entry.meta === "object"
          ? ((entry.meta as Record<string, unknown>).variant as string | undefined)
          : undefined;
      return variant === "tournament";
    });
  }, [items]);

  return {
    ladders,
    tournaments,
    loading,
    error,
    refresh: fetchLadders,
  };
}

