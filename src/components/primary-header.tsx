"use client";

import Link from "next/link";

import { HeaderAuth } from "@/components/header-auth";
import { LaunchCta } from "@/components/launch-cta";
import { cn } from "@/lib/cn";

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
    <header className="border-border/40 bg-surface-elevated/80 fixed inset-x-0 top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-4">
        <Link
          href="/"
          aria-label="Capsules home"
          className="group text-fg flex items-center gap-3 text-lg font-semibold"
        >
          <span className="bg-brand/20 shadow-brand/20 relative flex h-9 w-9 items-center justify-center rounded-2xl shadow-inner">
            <span className="bg-brand h-6 w-6 rounded-xl" />
          </span>
          <span className="font-display text-xl tracking-tight">Capsules</span>
        </Link>
        <nav className="hidden items-center gap-2 md:flex" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "rounded-pill text-fg-subtle px-4 py-2 text-sm font-medium transition",
                  "hover:text-fg hover:bg-surface-muted/60",
                  isActive && "border-brand/40 bg-brand/15 text-fg border shadow-xs",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {showSettingsLink ? (
            <Link
              href="/settings"
              className="rounded-pill border-border/40 bg-surface-muted/60 text-fg-subtle hover:border-border hover:text-fg focus-visible:ring-brand focus-visible:ring-offset-background hidden h-9 w-9 items-center justify-center border transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex"
              aria-label="Settings"
              title="Settings"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
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
          <HeaderAuth />
          <LaunchCta
            variant="gradient"
            size="sm"
            label={launchLabel}
            className="hidden sm:inline-flex"
            hrefWhenSignedIn="/capsule"
          />
        </div>
      </div>
    </header>
  );
}
