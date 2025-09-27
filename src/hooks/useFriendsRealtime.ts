"use client";

import * as React from "react";
import type { Types as AblyTypes } from "ably";
import {
  getRealtimeClient,
  resetRealtimeClient,
  type TokenResponse,
} from "@/lib/realtime/ably-client";

export type PresenceStatus = "online" | "offline" | "away";
export type PresenceMap = Record<string, { status: PresenceStatus; updatedAt: string | null }>;
export type ChannelInfo = { events: string; presence: string } | null;

export function useFriendsRealtime(
  channels: ChannelInfo,
  tokenProvider: () => Promise<TokenResponse>,
  onEvent: () => void,
  setPresence: React.Dispatch<React.SetStateAction<PresenceMap>>,
) {
  React.useEffect(() => {
    if (!channels || !channels.events || !channels.presence) return;
    let unsubscribed = false;
    let eventsChannel: AblyTypes.RealtimeChannelPromise | null = null;
    let presenceChannel: AblyTypes.RealtimeChannelPromise | null = null;
    let visibilityHandler: (() => void) | null = null;

    getRealtimeClient(tokenProvider)
      .then(async (client) => {
        if (unsubscribed) return;
        eventsChannel = client.channels.get(channels.events);
        const handleEvent = () => onEvent();
        eventsChannel.subscribe(handleEvent);

        presenceChannel = client.channels.get(channels.presence);
        presenceChannel.presence.subscribe((message) => {
          const clientId = String(message.clientId ?? "");
          if (!clientId) return;
          setPresence((prev) => ({
            ...prev,
            [clientId]: {
              status: (message.data && typeof message.data.status === "string"
                ? message.data.status
                : "online") as PresenceStatus,
              updatedAt:
                typeof message.data?.updatedAt === "string" ? message.data.updatedAt : null,
            },
          }));
        });

        try {
          const members = await presenceChannel.presence.get();
          const current: PresenceMap = {};
          members.forEach((member) => {
            const clientId = String(member.clientId ?? "");
            if (!clientId) return;
            current[clientId] = {
              status: (member.data && typeof member.data.status === "string"
                ? member.data.status
                : "online") as PresenceStatus,
              updatedAt: typeof member.data?.updatedAt === "string" ? member.data.updatedAt : null,
            };
          });
          setPresence((prev) => ({ ...prev, ...current }));
        } catch (err) {
          console.error("presence get failed", err);
        }

        const clientId = client.auth.clientId ? String(client.auth.clientId) : null;
        if (clientId) {
          try {
            await presenceChannel.presence.enter({
              status: "online",
              updatedAt: new Date().toISOString(),
            });
          } catch (err) {
            console.error("presence enter failed", err);
          }
        }

        visibilityHandler = () => {
          const status: PresenceStatus = document.visibilityState === "hidden" ? "away" : "online";
          presenceChannel?.presence
            .update({ status, updatedAt: new Date().toISOString() })
            .catch(() => {});
        };
        document.addEventListener("visibilitychange", visibilityHandler);

        // return a cleanup function reference if needed
        return () => {
          eventsChannel?.unsubscribe();
          presenceChannel?.presence.unsubscribe();
          if (document.visibilityState === "hidden") {
            presenceChannel?.presence
              .update({ status: "offline", updatedAt: new Date().toISOString() })
              .catch(() => {});
          }
          presenceChannel?.presence.leave().catch(() => {});
        };
      })
      .catch((err) => {
        console.error("Realtime connect failed", err);
      });

    return () => {
      unsubscribed = true;
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      // also reset global client on unmount to avoid leaks
      resetRealtimeClient();
    };
  }, [channels, tokenProvider, onEvent, setPresence]);
}
