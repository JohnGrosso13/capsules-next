import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";
import { BackgroundFX } from "@/components/background-fx";
import { SignedIn } from "@clerk/nextjs";
import { MobileCommandBar } from "@/components/mobile-command-bar";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/script";

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
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <html lang="en" data-theme="dark" suppressHydrationWarning>
        <body className={inter.className} suppressHydrationWarning>
          <Script id="theme-init" strategy="beforeInteractive">
            {THEME_BOOTSTRAP_SCRIPT}
          </Script>
          <BackgroundFX />
          {children}
          <SignedIn>
            <MobileCommandBar />
          </SignedIn>
        </body>
      </html>
    </ClerkProvider>
  );
}
