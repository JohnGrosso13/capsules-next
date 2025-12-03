"use client";

import * as React from "react";

import { useFriendsActions, useFriendsSelector } from "@/lib/friends/store";
import type { FriendsChannelInfo, PresenceMap } from "@/lib/friends/types";
import type { RealtimeAuthPayload } from "@/ports/realtime";
import { friendsRealtimeService } from "@/services/friends/realtime";

export type { PresenceStatus, PresenceMap } from "@/lib/friends/types";
export type ChannelInfo = FriendsChannelInfo;

export function useFriendsRealtime(
  channels: FriendsChannelInfo,
  tokenProvider: () => Promise<RealtimeAuthPayload>,
  onEvent: () => void,
): PresenceMap {
  const presence = useFriendsSelector((state) => state.presence);
  const updatePresence = useFriendsActions().updatePresence;

  const tokenProviderRef = React.useRef(tokenProvider);
  const onEventRef = React.useRef(onEvent);

  React.useEffect(() => {
    tokenProviderRef.current = tokenProvider;
  }, [tokenProvider]);

  React.useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    friendsRealtimeService.syncPresence(presence);
  }, [presence]);

  React.useEffect(() => {
    if (
      !channels ||
      !channels.events ||
      !Array.isArray(channels.presence) ||
      channels.presence.length === 0
    ) {
      return;
    }

    return friendsRealtimeService.subscribe({
      channels,
      tokenProvider: () => tokenProviderRef.current(),
      onEvent: () => onEventRef.current?.(),
      updatePresence: updatePresence,
    });
  }, [channels, updatePresence]);

  return presence;
}
