"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { getRealtimeClientFactory } from "@/config/realtime-client";
import { getAiImageChannel } from "@/lib/ai/channels";
import { buildRealtimeEnvelope } from "@/lib/realtime/envelope";
import { requestRealtimeToken } from "@/lib/realtime/token";
import { useCurrentUser } from "@/services/auth/client";
import type { AuthClientUser } from "@/ports/auth-client";
import type { RealtimeClient, RealtimeEvent } from "@/ports/realtime";
import styles from "./ai-image-run-toast.module.css";

type RunMode = "generate" | "edit";

type AiImageRunRealtimeEvent =
  | {
      type: "ai.image.run.started";
      runId: string;
      assetKind: string;
      mode: RunMode;
      userPrompt: string;
      resolvedPrompt: string;
      stylePreset: string | null;
      options?: Record<string, unknown>;
    }
  | {
      type: "ai.image.run.attempt";
      runId: string;
      attempt: number;
      model: string | null;
      status: "started" | "succeeded" | "failed";
      errorCode?: string | null;
      errorMessage?: string | null;
    }
  | {
      type: "ai.image.run.completed";
      runId: string;
      status: "succeeded" | "failed";
      imageUrl: string | null;
      errorCode: string | null;
      errorMessage: string | null;
    };

type NotificationStatus = "running" | "success" | "error";

type Notification = {
  runId: string;
  assetKind: string;
  mode: RunMode;
  status: NotificationStatus;
  title: string;
  message: string;
  detail: string | null;
  attempt?: number;
  model?: string | null;
  updatedAt: number;
};

const MAX_NOTIFICATIONS = 4;
const REMOVE_DELAY_SUCCESS = 4000;
const REMOVE_DELAY_ERROR = 6000;

const ASSET_LABELS: Record<string, string> = {
  avatar: "Avatar",
  banner: "Banner",
  "store-banner": "Store Banner",
  tile: "Tile",
  logo: "Logo",
  generic: "Image",
};

function formatAsset(kind: string, mode: RunMode): { title: string; action: string } {
  const mappedLabel = ASSET_LABELS[kind];
  const transformedLabel =
    mappedLabel ??
    kind
      .split(/[\s_-]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  const normalizedLabel = transformedLabel && transformedLabel.length ? transformedLabel : "Image";
  const title = mode === "edit" ? `${normalizedLabel} edit` : `${normalizedLabel} generation`;
  const action =
    mode === "edit"
      ? `editing the ${normalizedLabel.toLowerCase()}`
      : `generating a ${normalizedLabel.toLowerCase()}`;
  return { title, action };
}

function truncate(value: string, max = 160): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function normalizeEvent(data: RealtimeEvent["data"]): AiImageRunRealtimeEvent | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : null;
  if (!type) return null;

  if (type === "ai.image.run.started") {
    const runId = typeof record.runId === "string" ? record.runId : null;
    const assetKind =
      typeof record.assetKind === "string" && record.assetKind.trim().length
        ? record.assetKind
        : "generic";
    const mode =
      record.mode === "edit" || record.mode === "generate" ? (record.mode as RunMode) : "generate";
    const userPrompt = typeof record.userPrompt === "string" ? record.userPrompt : "";
    const resolvedPrompt = typeof record.resolvedPrompt === "string" ? record.resolvedPrompt : "";
    const stylePreset =
      typeof record.stylePreset === "string" && record.stylePreset.trim().length
        ? record.stylePreset
        : null;
    if (!runId) return null;
    const options =
      record.options && typeof record.options === "object"
        ? (record.options as Record<string, unknown>)
        : null;
    const startedEvent: AiImageRunRealtimeEvent = {
      type,
      runId,
      assetKind,
      mode,
      userPrompt,
      resolvedPrompt,
      stylePreset,
    };
    if (options) {
      startedEvent.options = options;
    }
    return startedEvent;
  }

  if (type === "ai.image.run.attempt") {
    const runId = typeof record.runId === "string" ? record.runId : null;
    const attemptNumber =
      typeof record.attempt === "number" && Number.isFinite(record.attempt)
        ? Math.max(1, Math.round(record.attempt))
        : null;
    const model =
      typeof record.model === "string" && record.model.trim().length ? record.model : null;
    const status =
      record.status === "started" || record.status === "succeeded" || record.status === "failed"
        ? record.status
        : null;
    if (!runId || !attemptNumber || !status) return null;
    const errorCode =
      typeof record.errorCode === "string" && record.errorCode.trim().length
        ? record.errorCode
        : null;
    const errorMessage =
      typeof record.errorMessage === "string" && record.errorMessage.trim().length
        ? record.errorMessage
        : null;
    return { type, runId, attempt: attemptNumber, model, status, errorCode, errorMessage };
  }

  if (type === "ai.image.run.completed") {
    const runId = typeof record.runId === "string" ? record.runId : null;
    const status =
      record.status === "succeeded" || record.status === "failed" ? record.status : null;
    if (!runId || !status) return null;
    const imageUrl =
      typeof record.imageUrl === "string" && record.imageUrl.trim().length
        ? record.imageUrl
        : null;
    const errorCode =
      typeof record.errorCode === "string" && record.errorCode.trim().length
        ? record.errorCode
        : null;
    const errorMessage =
      typeof record.errorMessage === "string" && record.errorMessage.trim().length
        ? record.errorMessage
        : null;
    return { type, runId, status, imageUrl, errorCode, errorMessage };
  }

  return null;
}

type AiImageRunProviderProps = {
  children: React.ReactNode;
};

export function AiImageRunProvider({ children }: AiImageRunProviderProps) {
  const { user } = useCurrentUser();
  const userRef = React.useRef<AuthClientUser | null>(user);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const timersRef = React.useRef<Map<string, number>>(new Map());
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalTarget(document.body);
  }, []);

  const clearTimer = React.useCallback((runId: string) => {
    if (typeof window === "undefined") return;
    const timers = timersRef.current;
    const existing = timers.get(runId);
    if (typeof existing === "number") {
      window.clearTimeout(existing);
      timers.delete(runId);
    }
  }, []);

  const removeNotification = React.useCallback((runId: string) => {
    clearTimer(runId);
    setNotifications((prev) => prev.filter((item) => item.runId !== runId));
  }, [clearTimer]);

  const scheduleRemoval = React.useCallback(
    (runId: string, delay: number) => {
      if (typeof window === "undefined") return;
      clearTimer(runId);
      const timeout = window.setTimeout(() => removeNotification(runId), delay);
      timersRef.current.set(runId, timeout);
    },
    [clearTimer, removeNotification],
  );

  const upsertNotification = React.useCallback(
    (runId: string, update: Partial<Notification> & { fallbackAsset?: { kind: string; mode: RunMode } }) => {
      setNotifications((prev) => {
        const index = prev.findIndex((item) => item.runId === runId);
        const existing = index >= 0 ? prev[index] : null;
        const nextAssetKind = update.assetKind ?? existing?.assetKind ?? update.fallbackAsset?.kind ?? "generic";
        const nextMode = update.mode ?? existing?.mode ?? update.fallbackAsset?.mode ?? "generate";
        const meta = formatAsset(nextAssetKind, nextMode);
        const base: Notification =
          existing ?? {
            runId,
            assetKind: nextAssetKind,
            mode: nextMode,
            status: "running",
            title: meta.title,
            message: "",
            detail: null,
            updatedAt: Date.now(),
          };
        const merged: Notification = {
          ...base,
          ...update,
          assetKind: nextAssetKind,
          mode: nextMode,
          title: update.title ?? base.title ?? meta.title,
          updatedAt: Date.now(),
        };
        const next = index >= 0 ? [...prev] : [...prev.slice(-(MAX_NOTIFICATIONS - 1)), merged];
        if (index >= 0) {
          next[index] = merged;
        } else {
          next.push(merged);
        }
        return next;
      });
    },
    [],
  );

  const handleEvent = React.useCallback(
    (event: AiImageRunRealtimeEvent) => {
      if (event.type === "ai.image.run.started") {
        const promptPreview = event.userPrompt ? truncate(event.userPrompt.trim(), 140) : null;
        const meta = formatAsset(event.assetKind, event.mode);
        const detailParts: string[] = [];
        if (promptPreview) {
          detailParts.push(`Prompt: ${promptPreview}`);
        }
        if (event.stylePreset) {
          detailParts.push(`Style: ${event.stylePreset}`);
        }
        clearTimer(event.runId);
        upsertNotification(event.runId, {
          assetKind: event.assetKind,
          mode: event.mode,
          status: "running",
          title: meta.title,
          message: `Started ${meta.action}.`,
          detail: detailParts.length ? detailParts.join(" · ") : null,
          fallbackAsset: { kind: event.assetKind, mode: event.mode },
        });
        return;
      }

      if (event.type === "ai.image.run.attempt") {
        const attemptLabel = `Attempt ${event.attempt}`;
        if (event.status === "started") {
          clearTimer(event.runId);
          upsertNotification(event.runId, {
            status: "running",
            message: `${attemptLabel} running${event.model ? ` on ${event.model}` : ""}…`,
            attempt: event.attempt,
            model: event.model ?? null,
          });
          return;
        }
        if (event.status === "succeeded") {
          clearTimer(event.runId);
          upsertNotification(event.runId, {
            status: "running",
            message: `${attemptLabel} succeeded${event.model ? ` on ${event.model}` : ""}. Finishing up…`,
            attempt: event.attempt,
            model: event.model ?? null,
          });
          return;
        }
        // failed attempt
        clearTimer(event.runId);
        const errorDetail = event.errorMessage || event.errorCode || "Unknown error";
        upsertNotification(event.runId, {
          status: "running",
          message: `${attemptLabel} failed.`,
          detail: truncate(errorDetail, 160),
          attempt: event.attempt,
          model: event.model ?? null,
        });
        return;
      }

      if (event.type === "ai.image.run.completed") {
        if (event.status === "succeeded") {
          upsertNotification(event.runId, {
            status: "success",
            message: "Image ready! Preview will refresh shortly.",
            detail: null,
          });
          scheduleRemoval(event.runId, REMOVE_DELAY_SUCCESS);
        } else {
          const detail = truncate(event.errorMessage || event.errorCode || "Image generation failed.", 160);
          upsertNotification(event.runId, {
            status: "error",
            message: "Image generation failed.",
            detail,
          });
          scheduleRemoval(event.runId, REMOVE_DELAY_ERROR);
        }
      }
    },
    [clearTimer, scheduleRemoval, upsertNotification],
  );

  React.useEffect(() => {
    return () => {
      timersRef.current.forEach((handle) => {
        if (typeof handle === "number") {
          window.clearTimeout(handle);
        }
      });
      timersRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    // Reset notifications when user changes (prevents stale toasts).
    timersRef.current.forEach((handle) => {
      if (typeof handle === "number") {
        window.clearTimeout(handle);
      }
    });
    timersRef.current.clear();
    setNotifications([]);
  }, [user?.id]);

  React.useEffect(() => {
    if (!user?.id) return;
    const factory = getRealtimeClientFactory();
    if (!factory) return;

    let isActive = true;
    let client: RealtimeClient | null = null;
    let unsubscribe: (() => void) | null = null;
    let retryCount = 0;

    const tokenProvider = async () => {
      return requestRealtimeToken(buildRealtimeEnvelope(userRef.current));
    };

    const attemptReconnect = (delayMs: number) => {
      if (!isActive || typeof window === "undefined") return;
      window.setTimeout(() => {
        if (!isActive) return;
        void connect(retryCount + 1);
      }, delayMs);
    };

    const connect = async (attempt = 0) => {
      retryCount = attempt;
      let connection: RealtimeClient | null = null;
      try {
        connection = await factory.getClient(tokenProvider);
        if (!connection) return;
        if (!isActive) {
          await factory.release(connection);
          return;
        }
        client = connection;
        const channel = getAiImageChannel(user.id);
        const cleanup = await client.subscribe(channel, (event) => {
          const normalized = normalizeEvent(event?.data);
          if (!normalized) return;
          handleEvent(normalized);
        });
        unsubscribe = () => {
          Promise.resolve(cleanup()).catch((error: unknown) => {
            console.error("AI image realtime unsubscribe error", error);
          });
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("AI image realtime connection failed", error);
        if (connection) {
          await Promise.resolve(factory.release(connection)).catch((releaseError: unknown) => {
            console.error("AI image realtime release error", releaseError);
          });
          connection = null;
        }
        const lower = message.toLowerCase();
        const denied =
          lower.includes("denied access based on given capability") ||
          lower.includes("channel denied");
        if (denied && attempt < 3) {
          factory.reset();
          attemptReconnect(300);
        }
      }
    };

    void connect(0);

    return () => {
      isActive = false;
      if (unsubscribe) unsubscribe();
      if (client) {
        Promise.resolve(factory.release(client)).catch((error) => {
          console.error("AI image realtime release error", error);
        });
      }
    };
  }, [handleEvent, user?.id]);

  return (
    <>
      {children}
      {portalTarget && notifications.length > 0
        ? createPortal(
            <div className={styles.container} role="status" aria-live="polite">
              {notifications.map((item) => (
                <div key={item.runId} className={styles.toast} data-status={item.status}>
                  <div className={styles.header}>
                    <span className={styles.dot} data-status={item.status} aria-hidden="true" />
                    <span className={styles.title}>{item.title}</span>
                  </div>
                  <p className={styles.message}>{item.message}</p>
                  {item.detail ? <p className={styles.detail}>{item.detail}</p> : null}
                </div>
              ))}
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}
