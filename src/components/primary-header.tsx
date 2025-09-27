"use client";

import * as React from "react";
import Link from "next/link";

import { HeaderAuth } from "@/components/header-auth";
import { LaunchCta } from "@/components/launch-cta";
import { cn } from "@/lib/cn";
import styles from "./primary-header.module.css";

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
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={cn(styles.header, scrolled && styles.headerScrolled)}>
      <div className={styles.inner}>
        <Link href="/" aria-label="Capsules home" className={styles.brand}>
          <span className={styles.brandMark} />
          <span className={styles.brandName}>Capsules</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(styles.navItem, isActive && styles.navItemActive)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.actions}>
          {/* Order: Profile → Settings → Launch Capsule */}
          <HeaderAuth />
          {showSettingsLink ? (
            <Link href="/settings" aria-label="Settings" title="Settings" className={styles.iconButton}>
              <svg
                className={styles.iconSvg}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="12" cy="12" r="6.2" />
                <circle cx="12" cy="12" r="2.8" />
                <path d="M12 3v2.4m0 13.2V21m9-9h-2.4M5.4 12H3m15.8-6.2-1.7 1.7M6.5 17.5 4.8 19.2m0-12.7 1.7 1.7m12.1 9.8-1.7-1.7" />
              </svg>
            </Link>
          ) : null}
          <LaunchCta
            variant="gradient"
            size="lg"
            label={launchLabel}
            className={cn("hidden sm:inline-flex font-extrabold", styles.launchCta)}
            hrefWhenSignedIn="/capsule"
          />
        </div>
      </div>
    </header>
  );
}


