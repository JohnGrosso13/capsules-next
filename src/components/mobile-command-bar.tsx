"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import * as React from "react";
import styles from "./mobile-command-bar.module.css";

export function MobileCommandBar() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement | null>(null);
  const barRef = React.useRef<HTMLElement | null>(null);
  const recentKey = "menuUsageCounts";

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
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
      try { ro.disconnect(); } catch {}
      root.classList.remove("has-mobile-dock");
      root.style.removeProperty("--mobile-dock-height");
    };
  }, []);

  function intentAttrs(intent: string) {
    return { "data-intent": intent } as React.HTMLAttributes<HTMLElement>;
  }

  function recordUse(key: string){
    try {
      const map = JSON.parse(localStorage.getItem(recentKey) || "{}") as Record<string, number>;
      map[key] = (map[key] || 0) + 1;
      localStorage.setItem(recentKey, JSON.stringify(map));
      // Hook for future: notify AI/runtime of usage
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ai:menu_used", { detail: { key, source: "mobile-bar" } }));
    } catch {}
  }

  return (
    <nav ref={barRef} className={styles.bar} aria-label="Capsules mobile command bar" data-fixedlayer="true">
      <div className={styles.inner}>
        <div className={styles.dock} data-surface="ai-dock">
          <Link href="/" className={`${styles.btn} ${pathname === "/" ? styles.active : ""}`} aria-label="Home" aria-current={pathname === "/" ? "page" : undefined} onClick={() => recordUse("home")} {...intentAttrs("navigate_home")}>
            <HomeIcon />
            <span>Home</span>
          </Link>

          <Link href="/create" className={`${styles.btn} ${pathname === "/create" ? styles.active : ""}`} aria-label="Create" aria-current={pathname === "/create" ? "page" : undefined} onClick={() => recordUse("create")} {...intentAttrs("navigate_create")}>
            <CreateIcon />
            <span>Create</span>
          </Link>

          <Link href="/capsule" className={`${styles.btn} ${pathname === "/capsule" ? styles.active : ""}`} aria-label="Capsule" aria-current={pathname === "/capsule" ? "page" : undefined} onClick={() => recordUse("capsule")} {...intentAttrs("navigate_capsule")}>
            <CapsuleIcon />
            <span>Capsule</span>
          </Link>

          <div className={styles.moreWrap} ref={moreRef}>
            <button type="button" className={`${styles.btn} ${open ? styles.active : ""}`} onClick={() => { setOpen((v) => !v); recordUse("more"); }} aria-expanded={open} aria-haspopup="true" aria-label="More options" {...intentAttrs("open_more")}>
              <MenuIcon />
              <span>More</span>
            </button>
            {open ? (
              <div className={styles.sheet} role="menu" data-surface="ai-dock-more">
                <Link href="/friends" className={styles.sheetItem} role="menuitem" onClick={() => setOpen(false)} {...intentAttrs("navigate_friends")}>
                  <FriendsIcon />
                  Friends
                </Link>
                <Link href="/memory" className={styles.sheetItem} role="menuitem" onClick={() => setOpen(false)} {...intentAttrs("navigate_memory")}>
                  <MemoryIcon />
                  Memory
                </Link>
                <SignOutButton redirectUrl="/" signOutCallback={() => setOpen(false)}>
                  <button
                    type="button"
                    className={styles.sheetItem}
                    role="menuitem"
                    onClick={() => { recordUse("signout"); setOpen(false); }}
                    {...intentAttrs("sign_out")}
                  >
                    <ProfileIcon />
                    Profile
                  </button>
                </SignOutButton>
                <Link href="/settings" className={styles.sheetItem} role="menuitem" onClick={() => setOpen(false)} {...intentAttrs("navigate_settings")}>
                  <SettingsIcon />
                  Settings
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}

function grad(id: string){
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#8b5cf6"/>
        <stop offset="1" stopColor="#22d3ee"/>
      </linearGradient>
    </defs>
  );
}

function HomeIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {grad("mcHome")}
      <path d="M3 10.5 12 3l9 7.5" stroke="url(#mcHome)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 9.5V20h14V9.5" stroke="url(#mcHome)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function CreateIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {grad("mcCreate")}
      <path d="M12 6v12M6 12h12" stroke="url(#mcCreate)" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function CapsuleIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {grad("mcCapsule")}
      <rect x="4" y="6.5" width="16" height="11" rx="5.5" stroke="url(#mcCapsule)" strokeWidth="1.8"/>
      <path d="M12 8v8" stroke="url(#mcCapsule)" strokeWidth="1.8"/>
    </svg>
  );
}
function MenuIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {grad("mcMenu")}
      <path d="M5 8h14M5 12h14M5 16h10" stroke="url(#mcMenu)" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function MemoryIcon(){
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mcMemo" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <rect x="3" y="4" width="14" height="12" rx="3" stroke="url(#mcMemo)" strokeWidth="1.4"/>
      <path d="M6.5 8.5h7" stroke="url(#mcMemo)" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M6.5 11.5h4" stroke="url(#mcMemo)" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function SettingsIcon(){
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mcSettings" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <g stroke="url(#mcSettings)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="5.4"/>
        <circle cx="10" cy="10" r="2.6"/>
        <path d="M10 2.4v2M17.6 10h-2M10 17.6v-2M2.4 10h2M4.6 4.6l1.4 1.4M15.4 4.6l-1.4 1.4M15.4 15.4l-1.4-1.4M4.6 15.4l1.4-1.4"/>
      </g>
    </svg>
  );
}
function FriendsIcon(){
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mcFriends" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <g stroke="url(#mcFriends)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="8" r="2.6"/>
        <path d="M2.8 15.2c1.2-2 3.2-3 4.2-3s3.0 1 4.2 3"/>
        <circle cx="14" cy="9" r="2.1"/>
        <path d="M10.8 15.2c.9-1.6 2.4-2.4 3.1-2.4 .7 0 2.1 .8 3.1 2.4"/>
      </g>
    </svg>
  );
}
function ProfileIcon(){
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="mcProfile" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <circle cx="10" cy="7" r="3.2" stroke="url(#mcProfile)" strokeWidth="1.4"/>
      <path d="M4.5 15.5c1.6-2.2 4-3.2 5.5-3.2s3.9 1 5.5 3.2" stroke="url(#mcProfile)" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

