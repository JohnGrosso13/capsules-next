"use client";

import * as React from "react";

import { useFriendsActions } from "@/lib/friends/store";

type FriendRequestAction = (requestId: string) => Promise<void>;

type FriendRequestActions = {
  accept: FriendRequestAction;
  decline: FriendRequestAction;
  cancel: FriendRequestAction;
};

export function useFriendRequestActions(refresh?: () => Promise<void>): FriendRequestActions {
  const actions = useFriendsActions();

  return React.useMemo(
    () => ({
      accept: async (requestId: string) => {
        await actions.acceptRequest(requestId);
        if (refresh) await refresh();
      },
      decline: async (requestId: string) => {
        await actions.declineRequest(requestId);
        if (refresh) await refresh();
      },
      cancel: async (requestId: string) => {
        await actions.cancelRequest(requestId);
        if (refresh) await refresh();
      },
    }),
    [actions, refresh],
  );
}
