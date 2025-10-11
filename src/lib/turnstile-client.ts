"use client";

import { clientEnv } from "@/lib/env/client";

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile is not available on the server"));
  }
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src*="turnstile"]`);
    if (existing) {
      existing.async = false;
      existing.defer = false;
      existing.removeAttribute("async");
      existing.removeAttribute("defer");
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
    }
    const script = existing ?? document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = false;
    script.defer = false;
    script.removeAttribute("async");
    script.removeAttribute("defer");
    script.dataset.loaded = "false";
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Turnstile"));
    if (!existing) {
      document.head.appendChild(script);
    }
  });
  return loadPromise;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          size?: "invisible" | "flex" | "normal" | "compact";
          callback: (token: string) => void;
          "error-callback"?: (error: Error) => void;
        },
      ) => string | undefined;
      execute: (containerOrId: string | HTMLElement) => void;
      remove: (widgetId: string) => void;
      ready: (cb: () => void) => void;
    };
  }
}

export async function getTurnstileToken(action = "upload"): Promise<string> {
  const siteKey = clientEnv.TURNSTILE_SITE_KEY;
  if (!siteKey) {
    throw new Error("Turnstile site key missing");
  }
  if (typeof window === "undefined") {
    throw new Error("Turnstile cannot run on the server");
  }
  await loadTurnstileScript();
  if (!window.turnstile) {
    throw new Error("Turnstile unavailable");
  }
  await new Promise<void>((resolve) => window.turnstile?.ready(() => resolve()));

  return new Promise<string>((resolve, reject) => {
    const container = document.createElement("div");
    container.style.display = "none";
    document.body.appendChild(container);

    const cleanup = (widgetId: string | undefined) => {
      try {
        if (widgetId && window.turnstile) {
          window.turnstile.remove(widgetId);
        }
      } catch {
        // ignore
      }
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };

    const widgetId = window.turnstile?.render(container, {
      sitekey: siteKey,
      action,
      size: "invisible",
      callback: (token: string) => {
        cleanup(widgetId);
        resolve(token);
      },
      "error-callback": () => {
        cleanup(widgetId);
        reject(new Error("Turnstile execution failed"));
      },
    });

    if (!widgetId) {
      cleanup(undefined);
      reject(new Error("Failed to render Turnstile widget"));
      return;
    }

    try {
      window.turnstile?.execute(widgetId);
    } catch (error) {
      cleanup(widgetId);
      reject(error instanceof Error ? error : new Error("Turnstile execute failed"));
    }
  });
}
