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
    if (existing && existing.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
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
      execute: (siteKey: string, options?: { action?: string }) => Promise<string>;
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
  return window.turnstile.execute(siteKey, { action });
}
