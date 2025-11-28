"use client";

import * as React from "react";

import {
  REDUCE_MOTION_STORAGE_KEY,
  TEXT_SCALE_STORAGE_KEY,
  TEXT_SCALE_DEFAULT,
  clampTextScale,
} from "@/lib/accessibility/constants";

type AccessibilityPreferences = {
  reduceMotion: boolean;
  textScale: number;
  hydrated: boolean;
  setReduceMotion: (value: boolean) => void;
  setTextScale: (value: number) => void;
  reset: () => void;
};

const DEFAULT_CONTEXT: AccessibilityPreferences = {
  reduceMotion: false,
  textScale: TEXT_SCALE_DEFAULT,
  hydrated: false,
  setReduceMotion: () => {
    /* noop by default */
  },
  setTextScale: () => {
    /* noop by default */
  },
  reset: () => {
    /* noop by default */
  },
};

const AccessibilityContext =
  React.createContext<AccessibilityPreferences>(DEFAULT_CONTEXT);

function applyDocumentPreferences(reduceMotion: boolean, textScale: number) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (reduceMotion) {
    root.setAttribute("data-reduce-motion", "true");
    root.style.setProperty("--accessibility-reduce-motion", "1");
  } else {
    root.removeAttribute("data-reduce-motion");
    root.style.removeProperty("--accessibility-reduce-motion");
  }
  root.style.setProperty("--accessibility-text-scale", textScale.toFixed(2));
}

function readInitialPreferences(): {
  reduceMotion: boolean;
  textScale: number;
} {
  if (typeof window === "undefined") {
    return { reduceMotion: false, textScale: TEXT_SCALE_DEFAULT };
  }
  try {
    const reduceMotionStored = window.localStorage.getItem(
      REDUCE_MOTION_STORAGE_KEY,
    );
    const textScaleStored = window.localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
    const reduceMotion = reduceMotionStored === "1" || reduceMotionStored === "true";
    const textScale = textScaleStored
      ? clampTextScale(Number.parseFloat(textScaleStored))
      : TEXT_SCALE_DEFAULT;
    return { reduceMotion, textScale };
  } catch {
    return { reduceMotion: false, textScale: TEXT_SCALE_DEFAULT };
  }
}

export function AccessibilityProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [{ reduceMotion, textScale }, setPreferences] = React.useState(() =>
    readInitialPreferences(),
  );
  const [hydrated, setHydrated] = React.useState(false);

  React.useLayoutEffect(() => {
    applyDocumentPreferences(reduceMotion, textScale);
    setHydrated(true);
  }, [reduceMotion, textScale]);

  const setReduceMotion = React.useCallback((value: boolean) => {
    setPreferences((prev) => {
      if (prev.reduceMotion === value) return prev;
      try {
        window.localStorage.setItem(
          REDUCE_MOTION_STORAGE_KEY,
          value ? "1" : "0",
        );
      } catch {
        // ignore storage errors
      }
      return { ...prev, reduceMotion: value };
    });
  }, []);

  const setTextScale = React.useCallback((value: number) => {
    const next = clampTextScale(value);
    setPreferences((prev) => {
      if (prev.textScale === next) return prev;
      try {
        window.localStorage.setItem(TEXT_SCALE_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return { ...prev, textScale: next };
    });
  }, []);

  const reset = React.useCallback(() => {
    setPreferences(() => {
      try {
        window.localStorage.removeItem(REDUCE_MOTION_STORAGE_KEY);
        window.localStorage.removeItem(TEXT_SCALE_STORAGE_KEY);
      } catch {
        // ignore
      }
      return { reduceMotion: false, textScale: TEXT_SCALE_DEFAULT };
    });
  }, []);

  const value = React.useMemo(
    () => ({
      reduceMotion,
      textScale,
      hydrated,
      setReduceMotion,
      setTextScale,
      reset,
    }),
    [reduceMotion, textScale, hydrated, setReduceMotion, setTextScale, reset],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibilityPreferences(): AccessibilityPreferences {
  return React.useContext(AccessibilityContext);
}
