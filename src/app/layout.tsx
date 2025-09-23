import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";
import { BackgroundFX } from "@/components/background-fx";

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
      <html lang="en">
        <body className={inter.className}>
          <BackgroundFX />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
