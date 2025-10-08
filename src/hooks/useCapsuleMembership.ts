"use client";

import * as React from "react";

import type {
  CapsuleMembershipAction,
  CapsuleMembershipState,
} from "@/types/capsules";

type PerformActionPayload =
  | { action: "request_join"; message?: string }
  | { action: "approve_request"; requestId: string }
  | { action: "decline_request"; requestId: string }
  | { action: "remove_member"; memberId: string };

type UseCapsuleMembershipResult = {
  membership: CapsuleMembershipState | null;
  loading: boolean;
  error: string | null;
  mutatingAction: CapsuleMembershipAction | null;
  lastUpdated: number;
  refresh: () => Promise<CapsuleMembershipState | null>;
  requestJoin: (options?: { message?: string }) => Promise<CapsuleMembershipState | null>;
  approveRequest: (requestId: string) => Promise<CapsuleMembershipState | null>;
  declineRequest: (requestId: string) => Promise<CapsuleMembershipState | null>;
  removeMember: (memberId: string) => Promise<CapsuleMembershipState | null>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function useCapsuleMembership(capsuleId: string | null | undefined): UseCapsuleMembershipResult {
  const normalizedId = React.useMemo(() => normalizeId(capsuleId), [capsuleId]);
  const [membership, setMembership] = React.useState<CapsuleMembershipState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mutatingAction, setMutatingAction] = React.useState<CapsuleMembershipAction | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState(0);

  const fetchMembership = React.useCallback(
    async (signal?: AbortSignal): Promise<CapsuleMembershipState | null> => {
      if (!normalizedId) return null;

      const response = await fetch(
        `/api/capsules/${normalizedId}/membership`,
        {
          method: "GET",
          cache: "no-store",
          ...(signal ? { signal } : {}),
        },
      );

      const payload = (await readJson(response)) as { membership?: CapsuleMembershipState; message?: string } | null;

      if (!response.ok) {
        const message =
          payload && typeof payload.message === "string"
            ? payload.message
            : "Failed to load capsule membership.";
        throw new Error(message);
      }

      return (payload?.membership ?? null) as CapsuleMembershipState | null;
    },
    [normalizedId],
  );

  React.useEffect(() => {
    if (!normalizedId) {
      setMembership(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetchMembership(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setMembership(data);
        setError(null);
        setLastUpdated(Date.now());
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load capsule membership.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [fetchMembership, normalizedId]);

  const refresh = React.useCallback(async () => {
    if (!normalizedId) return null;
    setLoading(true);
    try {
      const data = await fetchMembership();
      setMembership(data);
      setError(null);
      setLastUpdated(Date.now());
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load capsule membership.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchMembership, normalizedId]);

  const performAction = React.useCallback(
    async (payload: PerformActionPayload): Promise<CapsuleMembershipState | null> => {
      if (!normalizedId) {
        throw new Error("Capsule id is required for membership actions.");
      }

      setMutatingAction(payload.action);
      setError(null);
      try {
        const response = await fetch(`/api/capsules/${normalizedId}/membership`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await readJson(response)) as { membership?: CapsuleMembershipState; message?: string } | null;
        if (!response.ok) {
          const message =
            data && typeof data.message === "string"
              ? data.message
              : "Failed to update capsule membership.";
          throw new Error(message);
        }
        const nextMembership = (data?.membership ?? null) as CapsuleMembershipState | null;
        setMembership(nextMembership);
        setLastUpdated(Date.now());
        return nextMembership;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update capsule membership.");
        throw err;
      } finally {
        setMutatingAction(null);
      }
    },
    [normalizedId],
  );

  const requestJoin = React.useCallback(
    (options?: { message?: string }) => {
      if (options?.message) {
        return performAction({ action: "request_join", message: options.message });
      }
      return performAction({ action: "request_join" });
    },
    [performAction],
  );

  const approveRequest = React.useCallback(
    (requestId: string) => performAction({ action: "approve_request", requestId }),
    [performAction],
  );

  const declineRequest = React.useCallback(
    (requestId: string) => performAction({ action: "decline_request", requestId }),
    [performAction],
  );

  const removeMember = React.useCallback(
    (memberId: string) => performAction({ action: "remove_member", memberId }),
    [performAction],
  );

  return {
    membership,
    loading,
    error,
    mutatingAction,
    lastUpdated,
    refresh,
    requestJoin,
    approveRequest,
    declineRequest,
    removeMember,
    setError,
  };
}
