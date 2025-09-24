import type { Metadata } from "next";
import Link from "next/link";

import { HeaderAuth } from "@/components/header-auth";

import { FriendsClient } from "./FriendsClient";
import styles from "./friends.module.css";

export const metadata: Metadata = {
  title: "Friends - Capsules",
  description: "Manage and view your friends.",
  robots: { index: false },
};

export default function FriendsPage() {
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
            <Link href="/capsule" className={styles.navLink}>Capsule</Link>
            <Link href="/memory" className={styles.navLink}>Memory</Link>
          </nav>
          <div className={styles.headerActions}>
            <Link href="/settings" className={styles.secondaryAction}>Settings</Link>
            <Link href="/create" className={styles.primaryCta}>Launch Capsule</Link>
            <HeaderAuth />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <FriendsClient />
      </main>
    </div>
  );
}

