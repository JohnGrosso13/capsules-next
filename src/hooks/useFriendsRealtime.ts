"use client";

import * as React from "react";

import { getRealtimeClientFactory } from "@/config/realtime-client";
import type {
  RealtimeAuthPayload,
  RealtimeClient,
  RealtimePresenceChannel,
} from "@/ports/realtime";

export type PresenceStatus = "online" | "offline" | "away";
export type PresenceMap = Record<string, { status: PresenceStatus; updatedAt: string | null }>;
export type ChannelInfo = { events: string; presence: string } | null;

export function useFriendsRealtime(
  channels: ChannelInfo,
  tokenProvider: () => Promise<RealtimeAuthPayload>,
  onEvent: () => void,
  setPresence: React.Dispatch<React.SetStateAction<PresenceMap>>,
) {
  React.useEffect(() => {
    if (!channels || !channels.events || !channels.presence) return;
    const factory = getRealtimeClientFactory();
    if (!factory) {
      console.warn("Realtime client factory not configured");
      return;
    }

    let unsubscribed = false;
    let unsubscribeEvents: (() => void) | null = null;
    let unsubscribePresence: (() => void) | null = null;
    let presenceChannel: RealtimePresenceChannel | null = null;
    let clientInstance: RealtimeClient | null = null;
    let visibilityHandler: (() => void) | null = null;

    factory
      .getClient(tokenProvider)
      .then(async (client) => {
        if (unsubscribed) {
          await client.close();
          return;
        }

        clientInstance = client;

        const eventsCleanup = await client.subscribe(channels.events, () => onEvent());
        unsubscribeEvents = () => {
          Promise.resolve(eventsCleanup()).catch((error) => {
            console.error("Realtime events unsubscribe error", error);
          });
        };

        presenceChannel = client.presence(channels.presence);
        const presenceCleanup = await presenceChannel.subscribe((message) => {
          const clientId = String(message.clientId ?? "").trim();
          if (!clientId) return;
          const data = (message.data ?? {}) as {
            status?: string;
            updatedAt?: string;
          };
          setPresence((prev) => ({
            ...prev,
            [clientId]: {
              status: (typeof data.status === "string" ? data.status : "online") as PresenceStatus,
              updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
            },
          }));
        });
        unsubscribePresence = () => {
          Promise.resolve(presenceCleanup()).catch((error) => {
            console.error("Realtime presence unsubscribe error", error);
          });
        };

        try {
          const members = await presenceChannel.getMembers();
          const current: PresenceMap = {};
          members.forEach((member) => {
            const clientId = String(member.clientId ?? "").trim();
            if (!clientId) return;
            const data = (member.data ?? {}) as {
              status?: string;
              updatedAt?: string;
            };
            current[clientId] = {
              status: (typeof data.status === "string" ? data.status : "online") as PresenceStatus,
              updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
            };
          });
          setPresence((prev) => ({ ...prev, ...current }));
        } catch (err) {
          console.error("presence get failed", err);
        }

        const clientId = client.clientId();
        if (clientId) {
          try {
            await presenceChannel.enter({
              status: "online",
              updatedAt: new Date().toISOString(),
            });
          } catch (err) {
            console.error("presence enter failed", err);
          }
        }

        visibilityHandler = () => {
          if (!presenceChannel) return;
          const status: PresenceStatus = document.visibilityState === "hidden" ? "away" : "online";
          presenceChannel.update({ status, updatedAt: new Date().toISOString() }).catch(() => {});
        };
        document.addEventListener("visibilitychange", visibilityHandler);
      })
      .catch((err) => {
        console.error("Realtime connect failed", err);
      });

    return () => {
      unsubscribed = true;
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      if (unsubscribeEvents) unsubscribeEvents();
      if (unsubscribePresence) unsubscribePresence();
      if (presenceChannel) {
        presenceChannel
          .update({ status: "offline", updatedAt: new Date().toISOString() })
          .catch(() => {});
        presenceChannel.leave().catch(() => {});
      }
      if (clientInstance) {
        clientInstance.close().catch(() => {});
      }
      factory.reset();
    };
  }, [channels, tokenProvider, onEvent, setPresence]);
}
