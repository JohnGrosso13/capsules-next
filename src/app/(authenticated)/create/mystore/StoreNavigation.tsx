"use client";

import type { JSX, MouseEvent } from "react";
import Link from "next/link";

import { ChartLineUp, House, Package, Receipt } from "@phosphor-icons/react/dist/ssr";

import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";

import styles from "./mystore.page.module.css";

type StoreNavKey = "home" | "products" | "orders" | "reports";

type StoreNavItem = {
  id: StoreNavKey;
  label: string;
  path: string;
  icon: JSX.Element;
  query?: Record<string, string>;
};

const NAV_ITEMS: StoreNavItem[] = [
  {
    id: "home",
    label: "Home",
    path: "/create/mystore",
    icon: <House size={18} weight="bold" className={capTheme.tabIcon} />,
  },
  {
    id: "products",
    label: "Products",
    path: "/create/mystore/products",
    icon: <Package size={18} weight="bold" className={capTheme.tabIcon} />,
  },
  {
    id: "orders",
    label: "Orders",
    path: "/create/mystore/orders",
    icon: <Receipt size={18} weight="bold" className={capTheme.tabIcon} />,
  },
  {
    id: "reports",
    label: "Reports",
    path: "/create/mystore",
    query: { view: "reports" },
    icon: <ChartLineUp size={18} weight="bold" className={capTheme.tabIcon} />,
  },
];

type StoreNavigationProps = {
  capsuleId: string | null;
  capsuleName?: string | null;
  active: StoreNavKey;
  disabled?: boolean;
};

function buildHref(item: StoreNavItem, capsuleId: string | null): string {
  const params = new URLSearchParams();
  if (capsuleId) {
    params.set("capsuleId", capsuleId);
  }
  if (item.query) {
    Object.entries(item.query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  const query = params.toString();
  return query ? `${item.path}?${query}` : item.path;
}

export function StoreNavigation({
  capsuleId,
  capsuleName,
  active,
  disabled = false,
}: StoreNavigationProps) {
  const navItems = NAV_ITEMS.map((item) =>
    item.id === "home" ? { ...item, label: capsuleName?.trim() || item.label } : item,
  );

  return (
    <nav className={styles.storeNav} aria-label="My Store navigation">
      <div className={`${capTheme.tabStrip} ${styles.storeTabStrip}`}>
        {navItems.map((item) => {
          const isActive = item.id === active;
          const isDisabled = disabled;
          const className = [
            capTheme.tab,
            styles.storeTab,
            isActive ? capTheme.tabActive : null,
          ]
            .filter(Boolean)
            .join(" ");

          const href = buildHref(item, capsuleId);

          const handleClick = (event: MouseEvent) => {
            if (isDisabled) {
              event.preventDefault();
              event.stopPropagation();
            }
          };

          return (
            <Link
              key={item.id}
              href={href}
              className={className}
              aria-disabled={isDisabled ? "true" : undefined}
              data-disabled={isDisabled ? "true" : undefined}
              aria-current={isActive ? "page" : undefined}
              tabIndex={isDisabled ? -1 : undefined}
              onClick={handleClick}
              prefetch
            >
              {item.icon}
              <span className={styles.storeTabLabel}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
