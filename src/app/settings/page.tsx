import type { Metadata } from "next";
import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";

import { HeaderAuth } from "@/components/header-auth";
import styles from "../capsule/capsule.module.css";

export const metadata: Metadata = {
  title: "Settings - Capsules",
  description: "Manage your account and profile.",
};

export default function SettingsPage() {
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
            <HeaderAuth />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div style={{ gridColumn: '1 / -1' }}>
          <UserProfile routing="hash"/>
        </div>
      </main>
    </div>
  );
}

