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
};

type UseCapsuleLaddersResult = {
  ladders: CapsuleLadderSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useCapsuleLadders(capsuleId: string | null): UseCapsuleLaddersResult {
  const [ladders, setLadders] = React.useState<CapsuleLadderSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchLadders = React.useCallback(async () => {
    if (!capsuleId) {
      setLadders([]);
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
      setLadders(Array.isArray(data.ladders) ? data.ladders : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [capsuleId]);

  React.useEffect(() => {
    void fetchLadders();
  }, [fetchLadders]);

  return {
    ladders,
    loading,
    error,
    refresh: fetchLadders,
  };
}

