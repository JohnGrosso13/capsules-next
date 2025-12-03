import * as React from "react";

import type { AlertTone } from "@/components/ui/alert";

export type LadderToast = {
  id: string;
  tone: AlertTone;
  title: string;
  description?: string;
  persist?: boolean;
};

export const useToastNotifications = () => {
  const [toasts, setToasts] = React.useState<LadderToast[]>([]);
  const timers = React.useRef<Record<string, number>>({});

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timerId = timers.current[id];
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
      delete timers.current[id];
    }
  }, []);

  const pushToast = React.useCallback(
    (toast: Omit<LadderToast, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      if (!toast.persist) {
        const timeout = window.setTimeout(() => {
          dismissToast(id);
        }, toast.tone === "danger" ? 6000 : 4200);
        timers.current[id] = timeout;
      }
      return id;
    },
    [dismissToast],
  );

  React.useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((timerId) => {
        if (typeof timerId === "number") {
          window.clearTimeout(timerId);
        }
      });
      timers.current = {};
    };
  }, []);

  return { toasts, pushToast, dismissToast };
};
