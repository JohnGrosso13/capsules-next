"use client";

import * as React from "react";
import useSWRImmutable from "swr/immutable";

import {
  COMPOSER_IMAGE_SETTINGS_EVENT,
  COMPOSER_IMAGE_SETTINGS_STORAGE_KEY,
  DEFAULT_COMPOSER_IMAGE_SETTINGS,
  type ComposerImageSettings,
  parseComposerImageSettings,
  serializeComposerImageSettings,
} from "@/lib/composer/image-settings";

async function fetchComposerSettings(): Promise<ComposerImageSettings | null> {
  try {
    const response = await fetch("/api/composer/settings", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = (await response.json().catch(() => null)) as Partial<ComposerImageSettings> | null;
    if (!json || typeof json !== "object" || typeof json.quality !== "string") {
      return null;
    }
    return {
      quality: json.quality as ComposerImageSettings["quality"],
    };
  } catch {
    return null;
  }
}

async function persistComposerSettingsRemote(settings: ComposerImageSettings): Promise<void> {
  try {
    await fetch("/api/composer/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  } catch {
    // ignore remote persistence failures
  }
}

export function useComposerImageSettings(): {
  settings: ComposerImageSettings;
  updateSettings: (patch: Partial<ComposerImageSettings>) => void;
} {
  const [settings, setSettings] = React.useState<ComposerImageSettings>(DEFAULT_COMPOSER_IMAGE_SETTINGS);
  const { data: remoteSettings } = useSWRImmutable<ComposerImageSettings | null>(
    "/api/composer/settings",
    fetchComposerSettings,
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const persistLocal = React.useCallback((value: ComposerImageSettings) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(COMPOSER_IMAGE_SETTINGS_STORAGE_KEY, serializeComposerImageSettings(value));
    } catch {
      // ignore persistence errors
    }
    // Defer broadcast to avoid synchronous cross-component state updates during render.
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(COMPOSER_IMAGE_SETTINGS_EVENT, { detail: value }));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const local = parseComposerImageSettings(window.localStorage.getItem(COMPOSER_IMAGE_SETTINGS_STORAGE_KEY));
    setSettings(local);

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== COMPOSER_IMAGE_SETTINGS_STORAGE_KEY) {
        return;
      }
      setSettings(parseComposerImageSettings(window.localStorage.getItem(COMPOSER_IMAGE_SETTINGS_STORAGE_KEY)));
    };

    const handleBroadcast = (event: Event) => {
      const custom = event as CustomEvent<ComposerImageSettings>;
      if (!custom.detail) return;
      setSettings((prev) => {
        const next = custom.detail;
        return prev.quality === next.quality ? prev : next;
      });
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(COMPOSER_IMAGE_SETTINGS_EVENT, handleBroadcast as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(COMPOSER_IMAGE_SETTINGS_EVENT, handleBroadcast as EventListener);
    };
  }, [persistLocal]);

  React.useEffect(() => {
    if (!remoteSettings) return;
    setSettings((prev) => {
      if (prev.quality === remoteSettings.quality) return prev;
      return remoteSettings;
    });
    persistLocal(remoteSettings);
  }, [persistLocal, remoteSettings]);

  const updateSettings = React.useCallback((patch: Partial<ComposerImageSettings>) => {
    setSettings((prev) => {
      const next: ComposerImageSettings = {
        quality: patch.quality ?? prev.quality,
      };
      persistLocal(next);
      void persistComposerSettingsRemote(next);
      return next;
    });
  }, [persistLocal]);

  return { settings, updateSettings };
}
