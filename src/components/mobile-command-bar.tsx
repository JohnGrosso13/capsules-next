"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import * as React from "react";
import styles from "./mobile-command-bar.module.css";
import {
  House,
  PencilSimple,
  Pill,
  List,
  Brain,
  UserCircle,
  Gear,
  SignOut,
  Compass,
} from "@phosphor-icons/react/dist/ssr";
import { buildProfileHref } from "@/lib/profile/routes";
import { useCurrentUser } from "@/services/auth/client";

export function MobileCommandBar() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement | null>(null);
  const barRef = React.useRef<HTMLElement | null>(null);
  const recentKey = "menuUsageCounts";
  const { user } = useCurrentUser();

  const profileHref = React.useMemo(
    () => buildProfileHref(user?.key ?? user?.id ?? "me") ?? "/profile/me",
    [user?.key, user?.id],
  );

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    // Reserve space for the dock globally on mobile (measure live height)
    const root = document.body;
    root.classList.add("has-mobile-dock");
    const measure = () => {
      const el = barRef.current;
      if (!el) return;
      const h = el.getBoundingClientRect().height;
      root.style.setProperty("--mobile-dock-height", `${Math.round(h)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (barRef.current) ro.observe(barRef.current);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("resize", measure);
      try {
        ro.disconnect();
      } catch {}
      root.classList.remove("has-mobile-dock");
      root.style.removeProperty("--mobile-dock-height");
    };
  }, []);

  function intentAttrs(intent: string) {
    return { "data-intent": intent };
  }

  function recordUse(key: string) {
    try {
      const map = JSON.parse(localStorage.getItem(recentKey) || "{}") as Record<string, number>;
      map[key] = (map[key] || 0) + 1;
      localStorage.setItem(recentKey, JSON.stringify(map));
      // Hook for future: notify AI/runtime of usage
      if (typeof window !== "undefined")
        window.dispatchEvent(
          new CustomEvent("ai:menu_used", { detail: { key, source: "mobile-bar" } }),
        );
    } catch {}
  }

  return (
    <nav
      ref={barRef}
      className={styles.bar}
      aria-label="Capsules mobile command bar"
      data-fixedlayer="true"
    >
      <div className={styles.inner}>
        <div className={styles.dock} data-surface="ai-dock">
          <Link
            href="/"
            className={`${styles.btn} ${pathname === "/" ? styles.active : ""}`}
            aria-label="Home"
            aria-current={pathname === "/" ? "page" : undefined}
            onClick={() => recordUse("home")}
            {...intentAttrs("navigate_home")}
          >
            <House weight="duotone" />
            <span>Home</span>
          </Link>

          <Link
            href="/create"
            className={`${styles.btn} ${pathname === "/create" ? styles.active : ""}`}
            aria-label="Create"
            aria-current={pathname === "/create" ? "page" : undefined}
            onClick={() => recordUse("create")}
            {...intentAttrs("navigate_create")}
          >
            <PencilSimple weight="duotone" />
            <span>Create</span>
          </Link>

          <Link
            href="/capsule"
            className={`${styles.btn} ${pathname === "/capsule" ? styles.active : ""}`}
            aria-label="Capsule"
            aria-current={pathname === "/capsule" ? "page" : undefined}
            onClick={() => recordUse("capsule")}
            {...intentAttrs("navigate_capsule")}
          >
            <Pill weight="duotone" />
            <span>Capsule</span>
          </Link>

          <div className={styles.moreWrap} ref={moreRef}>
            <button
              type="button"
              className={`${styles.btn} ${open ? styles.active : ""}`}
              onClick={() => {
                setOpen((v) => !v);
                recordUse("more");
              }}
              aria-expanded={open}
              aria-haspopup="true"
              aria-label="More options"
              {...intentAttrs("open_more")}
            >
              <List weight="duotone" />
              <span>More</span>
            </button>
            {open ? (
              <div className={styles.sheet} role="menu" data-surface="ai-dock-more">
                <Link
                  href="/explore"
                  className={styles.sheetItem}
                  role="menuitem"
                  onClick={() => {
                    recordUse("explore");
                    setOpen(false);
                  }}
                  {...intentAttrs("navigate_explore")}
                >
                  <Compass weight="duotone" />
                  Explore
                </Link>
                <Link
                  href="/memory"
                  className={styles.sheetItem}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  {...intentAttrs("navigate_memory")}
                >
                  <Brain weight="duotone" />
                  Memory
                </Link>
                <Link
                  href={profileHref}
                  className={styles.sheetItem}
                  role="menuitem"
                  onClick={() => {
                    recordUse("profile");
                    setOpen(false);
                  }}
                  {...intentAttrs("navigate_profile")}
                >
                  <UserCircle weight="duotone" />
                  Profile
                </Link>
                <Link
                  href="/settings"
                  className={styles.sheetItem}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  {...intentAttrs("navigate_settings")}
                >
                  <Gear weight="duotone" />
                  Settings
                </Link>
                <SignOutButton redirectUrl="/">
                  <button
                    type="button"
                    className={styles.sheetItem}
                    role="menuitem"
                    onClick={() => {
                      recordUse("signout");
                      setOpen(false);
                    }}
                    {...intentAttrs("sign_out")}
                  >
                    <SignOut weight="duotone" />
                    Log Out
                  </button>
                </SignOutButton>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
