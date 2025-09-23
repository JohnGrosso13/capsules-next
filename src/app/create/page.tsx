import type { Metadata } from "next";
import Link from "next/link";
import React from "react";

import { HeaderAuth } from "@/components/header-auth";

import styles from "./create.module.css";
import { ComposeForm } from "./compose-form";

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
            <Link href="/settings" className={styles.secondaryAction}>Settings</Link>
            <Link href="/capsule" className={styles.primaryCta}>Open Capsule</Link>
            <HeaderAuth />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <ComposeForm />
      </main>
    </div>
  );
}

 
