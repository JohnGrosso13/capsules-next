import type { Metadata, Viewport } from "next";
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/nextjs";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import "./light-theme.css";
import "./cta-overrides.css";
import "./theme-aliases.css";
import { clerkAppearance } from "@/lib/clerk/appearance";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/script";
import { ACCESSIBILITY_BOOTSTRAP_SCRIPT } from "@/lib/accessibility/script";
import { AccessibilityProvider } from "@/components/providers/AccessibilityProvider";

export const runtime = "nodejs";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

const HYDRATION_SHIELD_SCRIPT = `
(function () {
  const ATTR = "fdprocessedid";
  const strip = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll("[" + ATTR + "]").forEach((node) => {
      try {
        node.removeAttribute(ATTR);
      } catch {
        // ignore
      }
    });
  };
  const start = () => {
    if (typeof document === "undefined") return;
    strip(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === ATTR) {
          try {
            mutation.target.removeAttribute(ATTR);
          } catch {
            // ignore
          }
        }
        if (mutation.type === "childList" && mutation.addedNodes?.length) {
          mutation.addedNodes.forEach((node) => {
            if (node && node.nodeType === Node.ELEMENT_NODE) {
              strip(node);
            }
          });
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [ATTR],
    });
  };
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
`;

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
    <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
      <html lang="en" data-theme="dark" suppressHydrationWarning>
        <body className={inter.className} suppressHydrationWarning>
          <Script id="theme-init" strategy="beforeInteractive">
            {THEME_BOOTSTRAP_SCRIPT}
          </Script>
          <Script id="accessibility-init" strategy="beforeInteractive">
            {ACCESSIBILITY_BOOTSTRAP_SCRIPT}
          </Script>
          <Script id="hydration-guard" strategy="beforeInteractive">
            {HYDRATION_SHIELD_SCRIPT}
          </Script>
          <AccessibilityProvider>
            {/* BackgroundFX removed: no animated/static glow overlay */}
            <SignedIn>{children}</SignedIn>
            <SignedOut>{children}</SignedOut>
          </AccessibilityProvider>
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
