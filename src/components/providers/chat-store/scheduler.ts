export type TimerHandle = unknown;

export type TimerAdapter = {
  schedule(callback: () => void, delay: number): TimerHandle | null;
  cancel(handle: TimerHandle | null | undefined): void;
  isSupported(): boolean;
};

export const noopTimerAdapter: TimerAdapter = {
  schedule() {
    return null;
  },
  cancel() {
    // noop
  },
  isSupported() {
    return false;
  },
};

export const browserTimerAdapter: TimerAdapter = {
  schedule(callback: () => void, delay: number) {
    if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
      return null;
    }
    return window.setTimeout(callback, delay);
  },
  cancel(handle: TimerHandle | null | undefined) {
    if (typeof window === "undefined" || typeof window.clearTimeout !== "function") {
      return;
    }
    if (handle !== null && handle !== undefined) {
      window.clearTimeout(handle as number);
    }
  },
  isSupported() {
    return typeof window !== "undefined" && typeof window.setTimeout === "function";
  },
};
