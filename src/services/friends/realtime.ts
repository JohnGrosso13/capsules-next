"use client";

import { getRealtimeClientFactory } from "@/config/realtime-client";
import type { FriendsChannelInfo, PresenceMap, PresenceStatus } from "@/lib/friends/types";
import type {
  RealtimeAuthPayload,
  RealtimeClient,
  RealtimePresenceChannel,
} from "@/ports/realtime";

type PresenceAdapter = {
  getSnapshot: () => PresenceMap;
  update: (update: PresenceMap | ((prev: PresenceMap) => PresenceMap)) => void;
};

type PresenceMessageHandler = Parameters<RealtimePresenceChannel["subscribe"]>[0];
type PresenceMember =
  Awaited<ReturnType<RealtimePresenceChannel["getMembers"]>> extends Array<infer Member>
    ? Member
    : never;

const AWAY_TIMEOUT_MS = 8 * 60 * 1000;
const OFFLINE_GRACE_MS = 30 * 1000;
const OFFLINE_RETENTION_MS = 60 * 60 * 1000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "keydown",
  "touchstart",
  "mousemove",
];
const ACTIVITY_THROTTLE_MS = 1000;

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
    return (
      !!aValue &&
      !!bValue &&
      aValue.status === bValue.status &&
      aValue.updatedAt === bValue.updatedAt
    );
  });
}

function wrapCleanup(cleanup: () => unknown, label: string): () => void {
  return () => {
    Promise.resolve(cleanup()).catch((error) => {
      console.error(label, error);
    });
  };
}

function createPresenceManager(adapter: PresenceAdapter) {
  let presenceChannel: RealtimePresenceChannel | null = null;
  let selfClientId: string | null = null;
  let currentStatus: PresenceStatus = "online";
  let awayTimer: number | null = null;
  let activityHandler: ((event: Event) => void) | null = null;
  let visibilityHandler: (() => void) | null = null;
  let lastActivityEmit = 0;
  const offlineTimers = new Map<string, number>();

  const clearOfflineTimer = (clientId: string) => {
    if (typeof window === "undefined") return;
    const handle = offlineTimers.get(clientId);
    if (typeof handle === "number") {
      window.clearTimeout(handle);
      offlineTimers.delete(clientId);
    }
  };

  const clearAllOfflineTimers = () => {
    if (typeof window === "undefined") return;
    offlineTimers.forEach((handle) => {
      window.clearTimeout(handle);
    });
    offlineTimers.clear();
  };

  const pruneOfflineEntries = (map: PresenceMap): PresenceMap => {
    const now = Date.now();
    let pruned = false;
    const next: PresenceMap = {};
    Object.entries(map).forEach(([clientId, value]) => {
      const updated =
        value.updatedAt && !Number.isNaN(Date.parse(value.updatedAt))
          ? Date.parse(value.updatedAt)
          : null;
      if (value.status === "offline" && updated !== null && now - updated > OFFLINE_RETENTION_MS) {
        pruned = true;
        return;
      }
      next[clientId] = value;
    });
    return pruned ? next : map;
  };

  const markOffline = (clientId: string) => {
    adapter.update((prev) => {
      const current = prev[clientId];
      if (current?.status === "offline") {
        return pruneOfflineEntries(prev);
      }
      const timestamp = new Date().toISOString();
      const next = pruneOfflineEntries({
        ...prev,
        [clientId]: {
          status: "offline",
          updatedAt: timestamp,
        },
      });
      return presenceMapsEqual(prev, next) ? prev : next;
    });
  };

  const scheduleOffline = (clientId: string) => {
    if (clientId === selfClientId) return;
    if (typeof window === "undefined") return;
    clearOfflineTimer(clientId);
    const existing = adapter.getSnapshot()[clientId];
    if (existing?.status === "offline") return;
    const handle = window.setTimeout(() => {
      markOffline(clientId);
    }, OFFLINE_GRACE_MS);
    offlineTimers.set(clientId, handle);
  };

  const clearAwayTimer = () => {
    if (typeof window === "undefined") return;
    if (typeof awayTimer === "number") {
      window.clearTimeout(awayTimer);
      awayTimer = null;
    }
  };

  const applyLocalStatus = (status: PresenceStatus, timestamp: string) => {
    if (!selfClientId) return;
    adapter.update((prev) => {
      const next = {
        ...prev,
        [selfClientId as string]: {
          status,
          updatedAt: timestamp,
        },
      };
      return presenceMapsEqual(prev, next) ? prev : next;
    });
  };

  const applyRemoteStatus = (clientId: string, status: PresenceStatus, updatedAt: string | null) => {
    adapter.update((prev) => {
      const current = prev[clientId];
      if (current?.status === status && current?.updatedAt === updatedAt) {
        return prev;
      }
      const next = {
        ...prev,
        [clientId]: {
          status,
          updatedAt,
        },
      };
      return presenceMapsEqual(prev, next) ? prev : next;
    });
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

  const handleActivity = () => {
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

  const updateStatus = (nextStatus: PresenceStatus) => {
    if (currentStatus === nextStatus) return;
    currentStatus = nextStatus;
    const channel = presenceChannel;
    if (!channel) return;
    const timestamp = new Date().toISOString();
    channel.update({ status: nextStatus, updatedAt: timestamp }).catch(() => {});
    applyLocalStatus(nextStatus, timestamp);
  };

  const handlePresenceMessage: PresenceMessageHandler = (message) => {
    const clientId = String(message.clientId ?? "").trim();
    if (!clientId) return;
    if (message.action === "leave" || message.action === "absent") {
      scheduleOffline(clientId);
      return;
    }
    clearOfflineTimer(clientId);
    const data = (message.data ?? {}) as {
      status?: string;
      updatedAt?: string;
    };
    const status = normalizePresenceStatus(data.status);
    const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;
    applyRemoteStatus(clientId, status, updatedAt);
  };

  const syncMembers = (members: ReadonlyArray<PresenceMember>) => {
    const memberPresence: PresenceMap = {};
    const activeIds = new Set<string>();
    members.forEach((member) => {
      const rawClientId =
        typeof member?.clientId === "string"
          ? member.clientId
          : typeof (member as { clientInfo?: { id?: string } })?.clientInfo?.id === "string"
            ? (member as { clientInfo?: { id?: string } }).clientInfo?.id
            : "";
      const clientId = String(rawClientId ?? "").trim();
      if (!clientId) return;
      if ((member as { action?: string }).action === "leave" || (member as { action?: string }).action === "absent")
        return;
      const data = (member?.data ?? {}) as {
        status?: string;
        updatedAt?: string;
      };
      memberPresence[clientId] = {
        status: normalizePresenceStatus(data.status),
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
      };
      activeIds.add(clientId);
      clearOfflineTimer(clientId);
    });

    adapter.update((prev) => {
      let changed = false;
      const merged: PresenceMap = { ...prev };
      Object.entries(memberPresence).forEach(([clientId, value]) => {
        const existing = merged[clientId];
        if (!existing || existing.status !== value.status || existing.updatedAt !== value.updatedAt) {
          merged[clientId] = value;
          changed = true;
        }
      });
      const cleaned = pruneOfflineEntries(merged);
      if (!changed && cleaned === prev) {
        return prev;
      }
      if (!changed && cleaned !== prev) {
        return cleaned;
      }
      return presenceMapsEqual(prev, cleaned) ? prev : cleaned;
    });

    const snapshot = adapter.getSnapshot();
    Object.keys(snapshot).forEach((clientId) => {
      if (activeIds.has(clientId)) return;
      const entry = snapshot[clientId];
      if (entry?.status === "offline") return;
      scheduleOffline(clientId);
    });
  };

  const enterPresence = async (channel: RealtimePresenceChannel, clientId: string) => {
    const timestamp = new Date().toISOString();
    await channel.enter({
      status: "online",
      updatedAt: timestamp,
    });
    clearOfflineTimer(clientId);
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
    if (selfClientId) {
      clearOfflineTimer(selfClientId);
    }
    channel.leave().catch(() => {});
    presenceChannel = null;
    selfClientId = null;
    currentStatus = "online";
    clearAwayTimer();
  };

  const teardown = () => {
    clearAwayTimer();
    clearAllOfflineTimers();
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

export type FriendsRealtimeSubscriptionOptions = {
  channels: Exclude<FriendsChannelInfo, null>;
  tokenProvider: () => Promise<RealtimeAuthPayload>;
  onEvent?: () => void;
  updatePresence: (
    update: PresenceMap | ((prev: PresenceMap) => PresenceMap),
  ) => void;
};

class FriendsRealtimeService {
  private presenceCache: PresenceMap = {};

  syncPresence(snapshot: PresenceMap): void {
    this.presenceCache = snapshot;
  }

  subscribe(options: FriendsRealtimeSubscriptionOptions): () => void {
    const { channels, tokenProvider, onEvent, updatePresence } = options;
    const factory = getRealtimeClientFactory();
    if (!factory) {
      console.warn("Realtime client factory not configured");
      return () => {};
    }

    const adapter: PresenceAdapter = {
      getSnapshot: () => this.presenceCache,
      update: (update) => {
        let snapshot: PresenceMap | null = null;
        updatePresence((prev) => {
          const next =
            typeof update === "function"
              ? (update as (value: PresenceMap) => PresenceMap)(prev)
              : update;
          if (next === prev || presenceMapsEqual(prev, next)) {
            snapshot = prev;
            return prev;
          }
          snapshot = next;
          return next;
        });
        if (snapshot) {
          this.presenceCache = snapshot;
        }
      },
    };

    const manager = createPresenceManager(adapter);

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

        const eventsCleanup = await client.subscribe(channels.events, () => {
          try {
            onEvent?.();
          } catch (error) {
            console.error("Realtime events handler error", error);
          }
        });
        unsubscribeEvents = wrapCleanup(eventsCleanup, "Realtime events unsubscribe error");
        if (unsubscribed && unsubscribeEvents) {
          unsubscribeEvents();
          return;
        }

        const presenceChannel = client.presence(channels.presence);
        manager.setPresenceChannel(presenceChannel);

        const presenceCleanup = await presenceChannel.subscribe(manager.handlePresenceMessage);
        unsubscribePresence = wrapCleanup(presenceCleanup, "Realtime presence unsubscribe error");
        if (unsubscribed && unsubscribePresence) {
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
      if (unsubscribeEvents) {
        unsubscribeEvents();
      }
      if (unsubscribePresence) {
        unsubscribePresence();
      }
      manager.leavePresence();
      if (clientInstance) {
        Promise.resolve(factory.release(clientInstance)).catch((error) => {
          console.error("Realtime release error", error);
        });
        clientInstance = null;
      }
    };
  }
}

export const friendsRealtimeService = new FriendsRealtimeService();
