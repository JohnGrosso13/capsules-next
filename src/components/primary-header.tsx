"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
  { key: "home", label: "Home", href: "/home" },
  { key: "explore", label: "Explore", href: "/explore" },
  { key: "create", label: "Create", href: "/create" },
  { key: "memory", label: "Memory", href: "/memory" },
  { key: "market", label: "Market", href: "/market" },
];

function hasSwitchParam(href: string): boolean {
  const searchStart = href.indexOf("?");
  if (searchStart === -1) return false;
  const hashStart = href.indexOf("#", searchStart);
  const search = href.slice(searchStart + 1, hashStart === -1 ? undefined : hashStart);
  const params = new URLSearchParams(search);
  return params.has("switch");
}

function withSwitchParam(href: string): string {
  const hashStart = href.indexOf("#");
  const base = hashStart === -1 ? href : href.slice(0, hashStart);
  const hash = hashStart === -1 ? "" : href.slice(hashStart);
  const searchStart = base.indexOf("?");
  const path = searchStart === -1 ? base : base.slice(0, searchStart);
  const search = searchStart === -1 ? "" : base.slice(searchStart + 1);
  const params = new URLSearchParams(search);
  params.delete("capsuleId");
  params.set("switch", "1");
  const nextSearch = params.toString();
  return `${path}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}

export function PrimaryHeader({
  activeKey = null,
  navItems = DEFAULT_NAV_ITEMS,
  showSettingsLink = true,
  launchLabel = "Launch Capsule",
}: PrimaryHeaderProps) {
  const [capsuleNavHref, setCapsuleNavHref] = React.useState<string>(() => {
    const capsuleItem = navItems.find((item) => item.key === "capsule");
    return capsuleItem?.href ?? "/capsule";
  });
  const hasCapsuleNavItem = React.useMemo(
    () => navItems.some((item) => item.key === "capsule"),
    [navItems],
  );
  const baseCapsuleHref = React.useMemo(() => {
    const capsuleItem = navItems.find((item) => item.key === "capsule");
    return capsuleItem?.href ?? "/capsule";
  }, [navItems]);
  const baseCapsuleHasSwitch = React.useMemo(
    () => hasSwitchParam(baseCapsuleHref),
    [baseCapsuleHref],
  );

  React.useEffect(() => {
    if (!hasCapsuleNavItem) return;
    setCapsuleNavHref((current) => {
      const withSwitch = withSwitchParam(baseCapsuleHref);
      if (current === baseCapsuleHref || current === withSwitch) {
        return current;
      }
      return baseCapsuleHref;
    });
  }, [baseCapsuleHref, hasCapsuleNavItem]);

  React.useEffect(() => {
    if (!hasCapsuleNavItem) return;
    if (baseCapsuleHasSwitch) return;

    const controller = new AbortController();
    let cancelled = false;

    const determineDestination = async () => {
      try {
        const response = await fetch("/api/capsules", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) return;
          throw new Error(`capsule nav fetch failed (${response.status})`);
        }

        const payload = (await response.json().catch(() => null)) as { capsules?: unknown } | null;
        const capsules = Array.isArray(payload?.capsules) ? payload?.capsules : null;
        if (!capsules || capsules.length <= 1) return;

        if (!cancelled) {
          const nextHref = withSwitchParam(baseCapsuleHref);
          setCapsuleNavHref((current) => (current === nextHref ? current : nextHref));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (process.env.NODE_ENV === "development") {
          console.warn("primary-header: unable to resolve capsule nav destination", error);
        }
      }
    };

    void determineDestination();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [baseCapsuleHref, baseCapsuleHasSwitch, hasCapsuleNavItem]);

  const router = useRouter();
  const pathname = usePathname();
  const launchDestination = "/capsule?switch=1";
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
  const handleLaunch = React.useCallback(() => {
    if (pathname?.startsWith("/capsule")) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("capsule:switch", { detail: { source: "header-launch" } }),
        );
      }
    } else {
      router.push(launchDestination);
    }
    return true;
  }, [pathname, router, launchDestination]);
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
                href={item.key === "capsule" ? capsuleNavHref : item.href}
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
            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className={styles.iconButton}
            >
              <Gear className={styles.iconSvg} weight="duotone" />
            </Link>
          ) : null}
          <LaunchCta
            variant="gradient"
            size="lg"
            label={launchLabel}
            className={cn("hidden font-extrabold sm:inline-flex", styles.launchCta)}
            hrefWhenSignedIn={launchDestination}
            onLaunch={handleLaunch}
          />
        </div>
      </div>
    </header>
  );
}
