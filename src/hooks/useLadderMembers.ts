"use client";

import * as React from "react";

import type { CapsuleLadderMember, CapsuleLadderMemberInput, CapsuleLadderMemberUpdateInput } from "@/types/ladders";

type UseLadderMembersOptions = {
  capsuleId: string | null;
  ladderId: string | null;
};

type UseLadderMembersResult = {
  members: CapsuleLadderMember[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  mutating: boolean;
  addMembers: (payload: CapsuleLadderMemberInput[]) => Promise<void>;
  updateMember: (memberId: string, patch: CapsuleLadderMemberUpdateInput) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
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

export function useLadderMembers(options: UseLadderMembersOptions): UseLadderMembersResult {
  const { capsuleId, ladderId } = options;
  const [members, setMembers] = React.useState<CapsuleLadderMember[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [mutating, setMutating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchMembers = React.useCallback(
    async (isRefresh = false) => {
      if (!capsuleId || !ladderId) {
        setMembers([]);
        return;
      }
      setError(null);
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await fetchJson<{ members: CapsuleLadderMember[] }>(
          `/api/capsules/${capsuleId}/ladders/${ladderId}/members`,
          { method: "GET", headers: { Accept: "application/json" } },
        );
        setMembers(data.members ?? []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [capsuleId, ladderId],
  );

  React.useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  const addMembers = React.useCallback(
    async (payload: CapsuleLadderMemberInput[]) => {
      if (!capsuleId || !ladderId || !payload.length) return;
      setMutating(true);
      setError(null);
      try {
        const data = await fetchJson<{ members: CapsuleLadderMember[] }>(
          `/api/capsules/${capsuleId}/ladders/${ladderId}/members`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ members: payload }),
          },
        );
        if (data.members?.length) {
          setMembers((prev) => {
            const existingIds = new Set(prev.map((member) => member.id));
            const appended = data.members.filter((member) => !existingIds.has(member.id));
            return [...prev, ...appended];
          });
        }
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [capsuleId, ladderId],
  );

  const updateMember = React.useCallback(
    async (memberId: string, patch: CapsuleLadderMemberUpdateInput) => {
      if (!capsuleId || !ladderId) return;
      setMutating(true);
      setError(null);
      try {
        const data = await fetchJson<{ member: CapsuleLadderMember }>(
          `/api/capsules/${capsuleId}/ladders/${ladderId}/members/${memberId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setMembers((prev) =>
          prev.map((member) => (member.id === data.member.id ? data.member : member)),
        );
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [capsuleId, ladderId],
  );

  const removeMember = React.useCallback(
    async (memberId: string) => {
      if (!capsuleId || !ladderId) return;
      setMutating(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/capsules/${capsuleId}/ladders/${ladderId}/members/${memberId}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.message ?? response.statusText ?? "Unable to remove member.";
          throw new Error(message);
        }
        setMembers((prev) => prev.filter((member) => member.id !== memberId));
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [capsuleId, ladderId],
  );

  const refresh = React.useCallback(async () => {
    await fetchMembers(true);
  }, [fetchMembers]);

  return {
    members,
    loading,
    error,
    refreshing,
    mutating,
    addMembers,
    updateMember,
    removeMember,
    refresh,
  };
}
