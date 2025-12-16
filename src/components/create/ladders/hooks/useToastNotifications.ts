import * as React from "react";

import type { AlertTone } from "@/components/ui/alert";

export type LadderToast = {
  id: string;
  tone: AlertTone;
  title: string;
  description?: string;
  persist?: boolean;
  /** Optional override for how long the toast stays visible (in milliseconds) when not persisted. */
  durationMs?: number;
};

export const useToastNotifications = () => {
  const [toasts, setToasts] = React.useState<LadderToast[]>([]);
  const timers = React.useRef<Record<string, number>>({});

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timerId = timers.current[id];
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      delete timers.current[id];
    }
  }, []);

  const pushToast = React.useCallback(
    (toast: Omit<LadderToast, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      if (!toast.persist && typeof window !== "undefined") {
        const duration =
          typeof toast.durationMs === "number"
            ? toast.durationMs
            : toast.tone === "danger"
              ? 6000
              : 4200;
        const timeout = window.setTimeout(() => {
          dismissToast(id);
        }, duration);
        timers.current[id] = timeout;
      }
      return id;
    },
    [dismissToast],
  );

  React.useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      timers.current = {};
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const active = new Set(toasts.map((toast) => toast.id));

    Object.entries(timers.current).forEach(([id, timerId]) => {
      if (!active.has(id)) {
        window.clearTimeout(timerId);
        delete timers.current[id];
      }
    });

    toasts.forEach((toast) => {
      if (toast.persist || timers.current[toast.id]) return;
      const duration =
        typeof toast.durationMs === "number"
          ? toast.durationMs
          : toast.tone === "danger"
            ? 6000
            : 4200;
      timers.current[toast.id] = window.setTimeout(() => dismissToast(toast.id), duration);
    });
  }, [dismissToast, toasts]);

  return { toasts, pushToast, dismissToast };
};
