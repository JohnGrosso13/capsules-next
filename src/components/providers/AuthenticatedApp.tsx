"use client";

import * as React from "react";
import dynamic from "next/dynamic";

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
};

export function AuthenticatedApp({ children }: AuthenticatedAppProps) {
  return (
    <>
      {children}
      <React.Suspense fallback={null}>
        <GlobalSearchOverlay />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <MobileCommandBar />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <AiImageRunToasts />
      </React.Suspense>
    </>
  );
}
