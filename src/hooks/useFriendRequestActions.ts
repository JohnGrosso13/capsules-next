"use client";

import * as React from "react";

import { broadcastFriendsGraphRefresh } from "@/hooks/useFriendsGraph";

type RequestAction = "accept" | "decline" | "cancel";

type FriendRequestAction = (requestId: string) => Promise<void>;

type FriendRequestActions = {
  accept: FriendRequestAction;
  decline: FriendRequestAction;
  cancel: FriendRequestAction;
};

async function mutateRequest(action: RequestAction, requestId: string): Promise<void> {
  const res = await fetch("/api/friends/update", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, requestId }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);

    const message =
      (payload && typeof payload?.message === "string" && payload.message) ||
      (payload && typeof payload?.error === "string" && payload.error) ||
      `Failed to ${action} request.`;
    throw new Error(message);
  }
}

export function useFriendRequestActions(refresh?: () => Promise<void>): FriendRequestActions {
  return React.useMemo(
    () => ({
      accept: async (requestId: string) => {
        await mutateRequest("accept", requestId);
        if (refresh) await refresh();
        broadcastFriendsGraphRefresh();
      },
      decline: async (requestId: string) => {
        await mutateRequest("decline", requestId);
        if (refresh) await refresh();
        broadcastFriendsGraphRefresh();
      },
      cancel: async (requestId: string) => {
        await mutateRequest("cancel", requestId);
        if (refresh) await refresh();
        broadcastFriendsGraphRefresh();
      },
    }),
    [refresh],
  );
}
