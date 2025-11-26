"use client";

import * as React from "react";

import type { CapsuleLadderMember, LadderChallenge, LadderChallengeOutcome, LadderMatchRecord } from "@/types/ladders";

type UseLadderChallengesOptions = {
  capsuleId: string | null;
  ladderId: string | null;
};

type ChallengePayload = {
  challengerId: string;
  opponentId: string;
  note?: string | null;
};

type ResolvePayload = {
  outcome: LadderChallengeOutcome;
  note?: string | null;
};

type ChallengeResponse = {
  challenges: LadderChallenge[];
  history: LadderMatchRecord[];
  members?: CapsuleLadderMember[];
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

export function useLadderChallenges(options: UseLadderChallengesOptions) {
  const { capsuleId, ladderId } = options;
  const [challenges, setChallenges] = React.useState<LadderChallenge[]>([]);
  const [history, setHistory] = React.useState<LadderMatchRecord[]>([]);
  const [membersSnapshot, setMembersSnapshot] = React.useState<CapsuleLadderMember[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [mutating, setMutating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (isRefresh = false) => {
      if (!capsuleId || !ladderId) {
        setChallenges([]);
        setHistory([]);
        setMembersSnapshot([]);
        return;
      }
      setError(null);
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await fetchJson<ChallengeResponse>(
          `/api/capsules/${capsuleId}/ladders/${ladderId}/challenges`,
          { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" },
        );
        setChallenges(data.challenges ?? []);
        setHistory(data.history ?? []);
        setMembersSnapshot(Array.isArray(data.members) ? data.members : []);
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
    void load();
  }, [load]);

  const refresh = React.useCallback(async () => {
    await load(true);
  }, [load]);

  const createChallenge = React.useCallback(
    async (payload: ChallengePayload): Promise<ChallengeResponse> => {
      if (!capsuleId || !ladderId) {
        throw new Error("Select a ladder before creating a challenge.");
      }
      setMutating(true);
      setError(null);
      try {
        const data = await fetchJson<ChallengeResponse>(
          `/api/capsules/${capsuleId}/ladders/${ladderId}/challenges`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
          },
        );
        setChallenges(data.challenges ?? []);
        setHistory(data.history ?? []);
        if (Array.isArray(data.members)) {
          setMembersSnapshot(data.members);
        }
        return data;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [capsuleId, ladderId],
  );

  const resolveChallenge = React.useCallback(
    async (challengeId: string, payload: ResolvePayload): Promise<ChallengeResponse> => {
      if (!capsuleId || !ladderId) {
        throw new Error("Select a ladder before reporting a match.");
      }
      setMutating(true);
      setError(null);
      try {
        const data = await fetchJson<ChallengeResponse>(
          `/api/capsules/${capsuleId}/ladders/${ladderId}/challenges/${challengeId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
          },
        );
        setChallenges(data.challenges ?? []);
        setHistory(data.history ?? []);
        if (Array.isArray(data.members)) {
          setMembersSnapshot(data.members);
        }
        return data;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [capsuleId, ladderId],
  );

  return {
    challenges,
    history,
    membersSnapshot,
    loading,
    refreshing,
    mutating,
    error,
    refresh,
    createChallenge,
    resolveChallenge,
  };
}
