"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconWeight } from "@phosphor-icons/react";
import { Brain, MagnifyingGlass, UsersThree } from "@phosphor-icons/react/dist/ssr";

import { HeaderNotifications } from "@/components/header-notifications";
import { cn } from "@/lib/cn";

import styles from "./mobile-header.module.css";

type MobileAction = {
  key: "search" | "friends";
  label: string;
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
};

const SEARCH_EVENT_NAME = "capsules:search:open";

export function MobileHeader() {
  const pathname = usePathname() || "/";
  const iconClass = styles.iconSvg || "";
  const handleSearch = React.useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(SEARCH_EVENT_NAME));
  }, []);

  const actions = React.useMemo<MobileAction[]>(
    () => [
      { key: "search", label: "Search", onClick: handleSearch, icon: MagnifyingGlass },
      { key: "friends", label: "Friends", href: "/friends", icon: UsersThree },
    ],
    [handleSearch],
  );

  return (
    <header className={styles.header} aria-label="Mobile header">
      <div className={styles.inner}>
        <Link href="/home" className={styles.brand} aria-label="Back to home">
          <span className={styles.brandMark} aria-hidden>
            <Brain weight="duotone" className={styles.brandIcon} />
            <span className={styles.brandGlow} />
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>Capsules</span>
          <span className={styles.brandHint}>Home</span>
          </span>
        </Link>

        <div className={styles.actions} role="toolbar" aria-label="Mobile quick actions">
          <HeaderNotifications
            buttonClassName={styles.actionButton}
            iconClassName={styles.iconSvg}
          />
          {actions.map((action) => {
            const Icon = action.icon;
            const isActive =
              action.href === "/"
                ? pathname === "/"
                : action.href
                  ? pathname.startsWith(action.href) || pathname === action.href
                  : false;

            if (action.href) {
              return (
                <Link
                  key={action.key}
                  href={action.href}
                  aria-label={action.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(styles.actionButton, isActive && styles.actionButtonActive)}
                >
                  <span className={styles.iconWrap} aria-hidden>
                    <Icon weight="duotone" className={iconClass} />
                  </span>
                </Link>
              );
            }

            return (
              <button
                key={action.key}
                type="button"
                aria-label={action.label}
                onClick={action.onClick}
                className={styles.actionButton}
              >
                <span className={styles.iconWrap} aria-hidden>
                  <Icon weight="duotone" className={iconClass} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
