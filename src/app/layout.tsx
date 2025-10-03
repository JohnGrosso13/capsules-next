﻿import type { Metadata, Viewport } from "next";
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/nextjs";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import "./light-theme.css";
import "./cta-overrides.css";
import { MobileCommandBar } from "@/components/mobile-command-bar";
import { GlobalSearchOverlay } from "@/components/global-search-overlay";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/script";
import { ComposerProvider, AiComposerRoot } from "@/components/composer/ComposerProvider";
import { FriendsDataProvider } from "@/components/providers/FriendsDataProvider";
import { ChatProvider } from "@/components/providers/ChatProvider";

export const runtime = 'nodejs';

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Capsules",
  description: "Capsules network with Supabase and Clerk",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not configured");
  }
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <html lang="en" data-theme="dark" suppressHydrationWarning>
        <body className={inter.className} suppressHydrationWarning>
          <Script id="theme-init" strategy="beforeInteractive">
            {THEME_BOOTSTRAP_SCRIPT}
          </Script>
          {/* BackgroundFX removed: no animated/static glow overlay */}
          <SignedIn>
            <FriendsDataProvider>
              <ChatProvider>
                <ComposerProvider>
                  {children}
                  <AiComposerRoot />
                </ComposerProvider>
                <GlobalSearchOverlay />
                <MobileCommandBar />
              </ChatProvider>
            </FriendsDataProvider>
          </SignedIn>
          <SignedOut>{children}</SignedOut>
        </body>
      </html>
    </ClerkProvider>
  );
}




export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};
