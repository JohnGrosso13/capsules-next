"use client";

import * as React from "react";

export const SMART_CONTEXT_STORAGE_KEY = "capsules:composer:smartContextEnabled";

export function useSmartContextPersistence(
  smartContextEnabled: boolean,
  setSmartContextEnabled: (enabled: boolean) => void,
) {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(SMART_CONTEXT_STORAGE_KEY);
      if (stored !== null) {
        setSmartContextEnabled(stored !== "false");
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("composer smart context load failed", error);
      }
    }
  }, [setSmartContextEnabled]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SMART_CONTEXT_STORAGE_KEY,
        smartContextEnabled ? "true" : "false",
      );
    } catch {
      // ignore persistence failures
    }
  }, [smartContextEnabled]);
}
