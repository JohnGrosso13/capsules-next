"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { ComposerProvider, AiComposerRoot } from "@/components/composer/ComposerProvider";
import { ChatProvider } from "@/components/providers/ChatProvider";
import { FriendsDataProvider } from "@/components/providers/FriendsDataProvider";
import { PartyProvider } from "@/components/providers/PartyProvider";
import { AiImageRunProvider } from "@/components/providers/AiImageRunProvider";

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
    <FriendsDataProvider>
      <PartyProvider>
        <ChatProvider>
          <AiImageRunProvider>
            <ComposerProvider>
              {children}
              <AiComposerRoot />
            </ComposerProvider>
            <React.Suspense fallback={null}>
              <GlobalSearchOverlay />
            </React.Suspense>
            <React.Suspense fallback={null}>
              <MobileCommandBar />
            </React.Suspense>
          </AiImageRunProvider>
        </ChatProvider>
      </PartyProvider>
    </FriendsDataProvider>
  );
}
