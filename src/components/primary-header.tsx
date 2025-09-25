"use client";

import Link from "next/link";

import { HeaderAuth } from "@/components/header-auth";
import { LaunchCta } from "@/components/launch-cta";

import styles from "@/app/landing.module.css";

type NavItem = {
  key: string;
  label: string;
  href: string;
};

type PrimaryHeaderProps = {
  activeKey?: string | null;
  navItems?: NavItem[];
  showSettingsLink?: boolean;
  launchLabel?: string;
};

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", href: "/" },
  { key: "create", label: "Create", href: "/create" },
  { key: "capsule", label: "Capsule", href: "/capsule" },
  { key: "memory", label: "Memory", href: "/memory" },
];

export function PrimaryHeader({
  activeKey = null,
  navItems = DEFAULT_NAV_ITEMS,
  showSettingsLink = true,
  launchLabel = "Launch Capsule",
}: PrimaryHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="Capsules home">
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandName}>Capsules</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`${styles.navLink} ${activeKey === item.key ? styles.navLinkActive : ""}`.trim()}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <HeaderAuth />
          {showSettingsLink ? (
            <Link href="/settings" className={styles.iconButton} aria-label="Settings">
              <svg className={styles.iconGlyph} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <defs>
                  <linearGradient id="primaryHeaderCog" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#8b5cf6" />
                    <stop offset="1" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
                <g stroke="url(#primaryHeaderCog)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                  <circle cx="12" cy="12" r="6.5" />
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M12 2.8v2.4M21.2 12h-2.4M12 21.2v-2.4M2.8 12h2.4M5.4 5.4l1.7 1.7M18.6 5.4l-1.7 1.7M18.6 18.6l-1.7-1.7M5.4 18.6l1.7-1.7" />
                </g>
              </svg>
            </Link>
          ) : null}
          <LaunchCta className={styles.primaryCta} hrefWhenSignedIn="/capsule" label={launchLabel} />
        </div>
      </div>
    </header>
  );
}


