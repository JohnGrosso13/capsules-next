import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { HeaderAuth } from "@/components/header-auth";
import { LaunchCta } from "@/components/launch-cta";
import { SignedIn } from "@clerk/nextjs";
import { CreateSignedIn } from "@/components/create-signed-in";

import styles from "./create.page.module.css";
import createTheme from "./create.module.css";

export const metadata: Metadata = {
  title: "Create a Capsule - Capsules",
  description: "Create a post for your capsule using Next.js UI.",
};

export default function CreatePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Capsules home">
            <span className={styles.brandMark} aria-hidden="true" />
            <span className={styles.brandName}>Capsules</span>
          </Link>
          <nav className={styles.nav} aria-label="Primary navigation">
            <Link href="/" className={styles.navLink}>Home</Link>
            <span className={`${styles.navLink} ${styles.navLinkActive}`}>Create</span>
            <Link href="/capsule" className={styles.navLink}>Capsule</Link>
            <Link href="/memory" className={styles.navLink}>Memory</Link>
          </nav>
          <div className={styles.headerActions}>
            {/* Profile */}
            <HeaderAuth />
            {/* Settings */}
            <SignedIn>
              <Link href="/settings" className={styles.iconButton} aria-label="Settings">
                <svg className={styles.iconGlyph} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <defs>
                    <linearGradient id="hdrCogGradCreate" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#8b5cf6"/>
                      <stop offset="1" stopColor="#22d3ee"/>
                    </linearGradient>
                  </defs>
                  <g stroke="url(#hdrCogGradCreate)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                    <circle cx="12" cy="12" r="6.5"/>
                    <circle cx="12" cy="12" r="3.2"/>
                    <path d="M12 2.8v2.4M21.2 12h-2.4M12 21.2v-2.4M2.8 12h2.4M5.4 5.4l1.7 1.7M18.6 5.4l-1.7 1.7M18.6 18.6l-1.7-1.7M5.4 18.6l1.7-1.7"/>
                  </g>
                </svg>
              </Link>
            </SignedIn>
            {/* Launch */}
            <LaunchCta className={styles.primaryCta} hrefWhenSignedIn="/capsule" label="Launch Capsule" />
          </div>
        </div>
      </header>

      <main>
        <div className={createTheme.theme}>
          <CreateSignedIn />
        </div>
      </main>
    </div>
  );
}

 
