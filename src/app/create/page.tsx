import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { HeaderAuth } from "@/components/header-auth";
import { LaunchCta } from "@/components/launch-cta";
import { SignedIn } from "@clerk/nextjs";

import styles from "./create.module.css";
import landing from "../landing.module.css";
import home from "@/components/home.module.css";
import { ComposeForm } from "./compose-form";

export const metadata: Metadata = {
  title: "Create a Capsule - Capsules",
  description: "Create a post for your capsule using Next.js UI.",
};

export default function CreatePage() {
  return (
    <div className={styles.page}>
      <header className={landing.header}>
        <div className={landing.headerInner}>
          <Link href="/" className={landing.brand} aria-label="Capsules home">
            <span className={landing.brandMark} aria-hidden="true" />
            <span className={landing.brandName}>Capsules</span>
          </Link>
          <nav className={landing.nav} aria-label="Primary navigation">
            <Link href="/" className={landing.navLink}>Home</Link>
            <span className={`${landing.navLink} ${landing.navLinkActive}`}>Create</span>
            <Link href="/capsule" className={landing.navLink}>Capsule</Link>
            <Link href="/memory" className={landing.navLink}>Memory</Link>
          </nav>
          <div className={landing.headerActions}>
            {/* Profile */}
            <HeaderAuth />
            {/* Settings */}
            <SignedIn>
              <Link href="/settings" className={landing.iconButton} aria-label="Settings">
                <svg className={landing.iconGlyph} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                  <defs>
                    <linearGradient id="hdrGearGradCreate" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#8b5cf6"/>
                      <stop offset="1" stopColor="#22d3ee"/>
                    </linearGradient>
                  </defs>
                  <g stroke="url(#hdrGearGradCreate)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                    <circle cx="12" cy="12" r="7.25" strokeDasharray="2.1 2.1"/>
                    <path d="M12 3.6v2.2M20.4 12h-2.2M12 20.4v-2.2M3.6 12h2.2"/>
                    <circle cx="12" cy="12" r="3.4"/>
                  </g>
                </svg>
              </Link>
            </SignedIn>
            {/* Launch */}
            <LaunchCta className={landing.primaryCta} hrefWhenSignedIn="/capsule" label="Launch Capsule" />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* AI Prompter at top */}
        <section className={home.prompterStage} aria-label="AI Prompter">
          <div className={home.prompter}>
            <div className={home.promptBar}>
              <input className={home.input} placeholder={"Ask your Capsule AI to create anything…"} />
              <button className={home.genBtn} type="button">
                <span aria-hidden>✨</span>
                <span className={home.genLabel}>Generate</span>
              </button>
            </div>
            <div className={home.chips}>
              {['Make a post', 'Share a photo', 'Remix last image', 'Summarize my feed'].map((c) => (
                <button key={c} className={home.chip} type="button">{c}</button>
              ))}
            </div>
          </div>
        </section>

        <ComposeForm />
      </main>
    </div>
  );
}

 
