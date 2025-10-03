"use client";

import * as React from "react";
import Link from "next/link";

import { HeaderAuth } from "@/components/header-auth";
import { Gear, Brain, User } from "@phosphor-icons/react/dist/ssr";
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
  const [scrolling, setScrolling] = React.useState(false);
  const scrollTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 4);
      setScrolling(true);
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => setScrolling(false), 160);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    };
  }, []);
  return (
    <header
      className={cn(
        styles.header,
        scrolled && styles.headerScrolled,
        scrolling && styles.headerScrolling,
      )}
    >
      <div className={styles.inner}>
        <div className={styles.brand} role="img" aria-label="Capsules brand mark">
          <span className={styles.brandMark} aria-hidden>
            <Brain
              className={`${styles.brandGlyph} ${styles.brandGlyphAi}`.trim()}
              weight="duotone"
            />
            <User
              className={`${styles.brandGlyph} ${styles.brandGlyphHuman}`.trim()}
              weight="duotone"
            />
          </span>
        </div>
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
          {/* Order: Profile â†’ Settings â†’ Launch Capsule */}
          <HeaderAuth />
          {showSettingsLink ? (
            <Link href="/settings" aria-label="Settings" title="Settings" className={styles.iconButton}>
              <Gear className={styles.iconSvg} weight="duotone" />
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

