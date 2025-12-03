"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { SupabaseSessionProvider } from "@/components/providers/SupabaseSessionProvider";

const AiImageRunToasts = dynamic(
  () =>
    import("@/components/providers/AiImageRunToasts").then((mod) => ({
      default: mod.AiImageRunToasts,
    })),
  { ssr: false, loading: () => null },
);

const GlobalSearchOverlay = dynamic(
  () =>
    import("@/components/global-search-overlay").then((mod) => ({
      default: mod.GlobalSearchOverlay,
    })),
  { ssr: false },
);

const MobileCommandBar = dynamic(
  () =>
    import("@/components/mobile-command-bar").then((mod) => ({
      default: mod.MobileCommandBar,
    })),
  { ssr: false },
);

type AuthenticatedAppProps = {
  children: React.ReactNode;
  supabaseUserId?: string | null;
};

export function AuthenticatedApp({ children, supabaseUserId = null }: AuthenticatedAppProps) {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    const warm = () => {
      fetch("/api/search/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: "", limit: 1 }),
        signal: controller.signal,
      }).catch(() => undefined);
    };
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleWindow.requestIdleCallback(warm, { timeout: 1000 });
    } else {
      globalThis.setTimeout(warm, 150);
    }
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <SupabaseSessionProvider supabaseUserId={supabaseUserId}>
      {children}
      <React.Suspense fallback={null}>
        <GlobalSearchOverlay />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <MobileCommandBar />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <AiImageRunToasts supabaseUserId={supabaseUserId} />
      </React.Suspense>
    </SupabaseSessionProvider>
  );
}
