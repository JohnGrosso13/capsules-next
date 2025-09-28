import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import "./light-theme.css";
import "./cta-overrides.css";
import { SignedIn } from "@clerk/nextjs";
import { MobileCommandBar } from "@/components/mobile-command-bar";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/script";
import { ComposerProvider, AiComposerRoot } from "@/components/composer/ComposerProvider";

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
          <ComposerProvider>
            {children}
            <AiComposerRoot />
          </ComposerProvider>
          <SignedIn>
            <MobileCommandBar />
          </SignedIn>
        </body>
      </html>
    </ClerkProvider>
  );
}
