"use client";

import * as React from "react";

import type { CapsuleLadderDetail, CapsuleLadderMember } from "@/types/ladders";

type UseLadderDetailOptions = {
  capsuleId: string | null;
  ladderId: string | null;
  includeMembers?: boolean;
  disabled?: boolean;
};

type UseLadderDetailResult = {
  ladder: CapsuleLadderDetail | null;
  members: CapsuleLadderMember[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? response.statusText ?? "Request failed";
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function useLadderDetail(options: UseLadderDetailOptions): UseLadderDetailResult {
  const { capsuleId, ladderId, includeMembers = true, disabled = false } = options;
  const [ladder, setLadder] = React.useState<CapsuleLadderDetail | null>(null);
  const [members, setMembers] = React.useState<CapsuleLadderMember[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDetail = React.useCallback(
    async (isRefresh = false) => {
      if (disabled) {
        setLadder(null);
        setMembers([]);
        return;
      }
      if (!capsuleId || !ladderId) {
        setLadder(null);
        setMembers([]);
        return;
      }
      setError(null);
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const query = includeMembers ? "?includeMembers=1" : "";
        const data = await fetchJson<{ ladder: CapsuleLadderDetail; members?: CapsuleLadderMember[] }>(
          `/api/capsules/${capsuleId}/ladders/${ladderId}${query}`,
          { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" },
        );
        setLadder(data.ladder ?? null);
        setMembers(Array.isArray(data.members) ? data.members : []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [capsuleId, disabled, includeMembers, ladderId],
  );

  React.useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const refresh = React.useCallback(async () => {
    await fetchDetail(true);
  }, [fetchDetail]);

  return {
    ladder,
    members,
    loading,
    refreshing,
    error,
    refresh,
  };
}
