"use client";

import * as React from "react";

import { getRealtimeClientFactory } from "@/config/realtime-client";
import type {
  RealtimeAuthPayload,
  RealtimeClient,
  RealtimePresenceChannel,
} from "@/ports/realtime";
import type { FriendsChannelInfo } from "@/services/friends/client";

export type PresenceStatus = "online" | "offline" | "away";
export type PresenceMap = Record<string, { status: PresenceStatus; updatedAt: string | null }>;
export type ChannelInfo = FriendsChannelInfo;

let presenceCache: PresenceMap = {};

function normalizePresenceStatus(value: unknown): PresenceStatus {
  if (typeof value !== "string") return "online";
  const normalized = value.toLowerCase();
  if (normalized === "away") return "away";
  if (normalized === "offline") return "offline";
  return "online";
}

function presenceMapsEqual(a: PresenceMap, b: PresenceMap): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return bKeys.every((key) => {
    const aValue = a[key];
    const bValue = b[key];
    return !!aValue && !!bValue && aValue.status === bValue.status && aValue.updatedAt === bValue.updatedAt;
  });
}

const AWAY_TIMEOUT_MS = 8 * 60 * 1000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "mousemove"];
const ACTIVITY_THROTTLE_MS = 1000;

type PresenceMessageHandler = Parameters<RealtimePresenceChannel["subscribe"]>[0];
type PresenceMember = Awaited<ReturnType<RealtimePresenceChannel["getMembers"]>> extends Array<infer Member>
  ? Member
  : never;

function wrapCleanup(cleanup: () => unknown, label: string): () => void {
  return () => {
    Promise.resolve(cleanup()).catch((error) => {
      console.error(label, error);
    });
  };
}

function createPresenceManager(
  setPresence: React.Dispatch<React.SetStateAction<PresenceMap>>,
) {
  let presenceChannel: RealtimePresenceChannel | null = null;
  let selfClientId: string | null = null;
  let currentStatus: PresenceStatus = "online";
  let awayTimer: number | null = null;
  let activityHandler: ((event: Event) => void) | null = null;
  let visibilityHandler: (() => void) | null = null;
  let lastActivityEmit = 0;

  const clearAwayTimer = () => {
    if (awayTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(awayTimer);
      awayTimer = null;
    }
  };

  const applyLocalStatus = (status: PresenceStatus, timestamp: string) => {
    const selfId = selfClientId;
    if (!selfId) return;
    setPresence((prev) => {
      const current = prev[selfId];
      if (current && current.status === status && current.updatedAt === timestamp) {
        return prev;
      }
      return {
        ...prev,
        [selfId]: {
          status,
          updatedAt: timestamp,
        },
      };
    });
  };

  const updateStatus = (nextStatus: PresenceStatus) => {
    if (currentStatus === nextStatus) return;
    currentStatus = nextStatus;

    const channel = presenceChannel;
    if (!channel) return;

    const timestamp = new Date().toISOString();
    channel.update({ status: nextStatus, updatedAt: timestamp }).catch(() => {});
    applyLocalStatus(nextStatus, timestamp);
  };

  const scheduleAway = () => {
    if (typeof window === "undefined") return;
    clearAwayTimer();
    awayTimer = window.setTimeout(() => {
      updateStatus("away");
    }, AWAY_TIMEOUT_MS);
  };

  const markActive = () => {
    clearAwayTimer();
    updateStatus("online");
    scheduleAway();
  };

  const handleActivity = (_event?: Event) => {
    const now = Date.now();
    if (now - lastActivityEmit < ACTIVITY_THROTTLE_MS) return;
    lastActivityEmit = now;
    markActive();
  };

  const attachActivityListeners = () => {
    if (activityHandler || typeof window === "undefined") return;
    activityHandler = handleActivity;
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, activityHandler as EventListener, { passive: true });
    });
  };

  const detachActivityListeners = () => {
    if (!activityHandler || typeof window === "undefined") return;
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, activityHandler as EventListener);
    });
    activityHandler = null;
  };

  const startVisibilityTracking = () => {
    if (visibilityHandler || typeof document === "undefined") return;
    visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        scheduleAway();
      } else {
        markActive();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  };

  const stopVisibilityTracking = () => {
    if (!visibilityHandler || typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  };

  const handlePresenceMessage: PresenceMessageHandler = (message) => {
    const clientId = String(message.clientId ?? "").trim();
    if (!clientId) return;
    if (message.action === "leave" || message.action === "absent") {
      setPresence((prev) => {
        if (!prev[clientId]) return prev;
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
      return;
    }
    const data = (message.data ?? {}) as {
      status?: string;
      updatedAt?: string;
    };
    const status = normalizePresenceStatus(data.status);
    const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
    setPresence((prev) => {
      const current = prev[clientId];
      if (current && current.status === status && current.updatedAt === updatedAt) {
        return prev;
      }
      return {
        ...prev,
        [clientId]: {
          status,
          updatedAt,
        },
      };
    });
  };

  const syncMembers = (members: ReadonlyArray<PresenceMember>) => {
    const current: PresenceMap = {};
    members.forEach((member) => {
      const clientId = String(member?.clientId ?? "").trim();
      if (!clientId) return;
      if (member?.action === "leave" || member?.action === "absent") return;
      const data = (member?.data ?? {}) as {
        status?: string;
        updatedAt?: string;
      };
      current[clientId] = {
        status: normalizePresenceStatus(data.status),
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
      };
    });
    setPresence((prev) => (presenceMapsEqual(prev, current) ? prev : current));
  };

  const enterPresence = async (channel: RealtimePresenceChannel, clientId: string) => {
    const timestamp = new Date().toISOString();
    await channel.enter({
      status: "online",
      updatedAt: timestamp,
    });
    selfClientId = clientId;
    currentStatus = "online";
    applyLocalStatus("online", timestamp);
    scheduleAway();
  };

  const leavePresence = () => {
    const channel = presenceChannel;
    if (!channel) return;
    const timestamp = new Date().toISOString();
    channel.update({ status: "offline", updatedAt: timestamp }).catch(() => {});
    applyLocalStatus("offline", timestamp);
    channel.leave().catch(() => {});
    presenceChannel = null;
    selfClientId = null;
    currentStatus = "online";
    clearAwayTimer();
  };

  const teardown = () => {
    clearAwayTimer();
    stopVisibilityTracking();
    detachActivityListeners();
    lastActivityEmit = 0;
  };

  return {
    setPresenceChannel: (channel: RealtimePresenceChannel | null) => {
      presenceChannel = channel;
    },
    handlePresenceMessage,
    syncMembers,
    enterPresence,
    leavePresence,
    attachActivityListeners,
    detachActivityListeners,
    startVisibilityTracking,
    stopVisibilityTracking,
    teardown,
  };
}

export function useFriendsRealtime(
  channels: ChannelInfo,
  tokenProvider: () => Promise<RealtimeAuthPayload>,
  onEvent: () => void,
): PresenceMap {
  const [presence, setPresenceState] = React.useState<PresenceMap>(() => presenceCache);

  const setPresence = React.useCallback<React.Dispatch<React.SetStateAction<PresenceMap>>>((update) => {
    setPresenceState((prev) => {
      const next =
        typeof update === "function" ? (update as (value: PresenceMap) => PresenceMap)(prev) : update;
      if (next === prev || presenceMapsEqual(prev, next)) {
        presenceCache = prev;
        return prev;
      }
      presenceCache = next;
      return next;
    });
  }, []);

  const eventsChannelName = channels?.events ?? "";
  const presenceChannelName = channels?.presence ?? "";

  React.useEffect(() => {
    if (!eventsChannelName || !presenceChannelName) {
      return;
    }
    const factory = getRealtimeClientFactory();
    if (!factory) {
      console.warn("Realtime client factory not configured");
      return;
    }

    const manager = createPresenceManager(setPresence);

    let unsubscribed = false;
    let clientInstance: RealtimeClient | null = null;
    let unsubscribeEvents: (() => void) | null = null;
    let unsubscribePresence: (() => void) | null = null;

    const connect = async () => {
      try {
        const client = await factory.getClient(tokenProvider);
        if (unsubscribed) {
          await client.close().catch(() => {});
          return;
        }
        clientInstance = client;

        const eventsCleanup = await client.subscribe(eventsChannelName, () => onEvent());
        unsubscribeEvents = wrapCleanup(eventsCleanup, "Realtime events unsubscribe error");
        if (unsubscribed) {
          unsubscribeEvents();
          return;
        }

        const presenceChannel = client.presence(presenceChannelName);
        manager.setPresenceChannel(presenceChannel);

        const presenceCleanup = await presenceChannel.subscribe(manager.handlePresenceMessage);
        unsubscribePresence = wrapCleanup(presenceCleanup, "Realtime presence unsubscribe error");
        if (unsubscribed) {
          unsubscribePresence();
          return;
        }

        try {
          const members = await presenceChannel.getMembers();
          if (!unsubscribed) {
            manager.syncMembers(members);
          }
        } catch (err) {
          console.error("presence get failed", err);
        }

        const clientId = client.clientId();
        if (clientId && !unsubscribed) {
          try {
            await manager.enterPresence(presenceChannel, clientId);
          } catch (err) {
            console.error("presence enter failed", err);
          }
        }

        if (!unsubscribed) {
          manager.attachActivityListeners();
          manager.startVisibilityTracking();
        }
      } catch (err) {
        console.error("Realtime connect failed", err);
      }
    };

    void connect();

    return () => {
      unsubscribed = true;
      manager.teardown();
      if (unsubscribeEvents) unsubscribeEvents();
      if (unsubscribePresence) unsubscribePresence();
      manager.leavePresence();
      if (clientInstance) {
        clientInstance.close().catch(() => {});
      }
      factory.reset();
    };
  }, [eventsChannelName, presenceChannelName, tokenProvider, onEvent, setPresence]);

  return presence;
}
