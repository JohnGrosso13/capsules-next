import type { Metadata } from "next";
import Link from "next/link";

import { HeaderAuth } from "@/components/header-auth";
import { LaunchCta } from "@/components/launch-cta";
import { SignedIn } from "@clerk/nextjs";
import { CapsuleSignedIn } from "@/components/capsule-signed-in";

import styles from "./capsule.page.module.css";
import capTheme from "./capsule.module.css";

export const metadata: Metadata = {
  title: "Capsule - Capsules",
  description: "Your capsule feed built with Next.js + Clerk.",
};

export default async function CapsulePage() {
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
            <Link href="/create" className={styles.navLink}>Create</Link>
            <span className={`${styles.navLink} ${styles.navLinkActive}`}>Capsule</span>
            <Link href="/memory" className={styles.navLink}>Memory</Link>
          </nav>
          <div className={styles.headerActions}>
            <HeaderAuth />
            <SignedIn>
              <Link href="/settings" className={styles.iconButton} aria-label="Settings">
                <svg className={styles.iconGlyph} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <defs>
                    <linearGradient id="hdrGearGradCapsule" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#8b5cf6"/>
                      <stop offset="1" stopColor="#22d3ee"/>
                    </linearGradient>
                  </defs>
                  <g stroke="url(#hdrGearGradCapsule)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                    <circle cx="12" cy="12" r="7.25" strokeDasharray="2.1 2.1"/>
                    <path d="M12 3.6v2.2M20.4 12h-2.2M12 20.4v-2.2M3.6 12h2.2"/>
                    <circle cx="12" cy="12" r="3.4"/>
                  </g>
                </svg>
              </Link>
            </SignedIn>
            <LaunchCta className={styles.primaryCta} hrefWhenSignedIn="/capsule" label="Launch Capsule" />
          </div>
        </div>
      </header>

      <main>
        <div className={capTheme.theme}>
          <CapsuleSignedIn />
        </div>
      </main>
    </div>
  );
}
