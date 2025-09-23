"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import styles from "./bottom-nav.module.css";

export function BottomNav() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = React.useState(false);
  const moreRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, []);

  function dispatchCommand(command: string) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ai:command", { detail: { command, source: "bottom-nav" } }));
    }
  }

  return (
    <nav className={styles.bar} aria-label="Capsules navigation dock">
      <div className={styles.inner}>
        <div className={styles.dock} data-surface="ai-dock">
          <Link
            href="/"
            className={`${styles.btn} ${pathname === "/" ? styles.active : ""}`}
            aria-label="Home"
            aria-current={pathname === "/" ? "page" : undefined}
            data-intent="navigate_home"
          >
            <HomeIcon />
            <span>Home</span>
          </Link>

          <Link
            href="/create"
            className={`${styles.btn} ${pathname === "/create" ? styles.active : ""}`}
            aria-label="Create"
            aria-current={pathname === "/create" ? "page" : undefined}
            data-intent="navigate_create"
          >
            <CreateIcon />
            <span>Create</span>
          </Link>

          <div className={styles.command}>
            <div className={styles.commandGlow} aria-hidden />
            <button
              type="button"
              className={styles.commandBtn}
              onClick={() => dispatchCommand("open_prompter")}
              aria-label="Open AI prompter"
              data-intent="open_prompter"
            >
              <CommandIcon />
              <span>Command</span>
              <span className={styles.commandStatus} aria-hidden />
            </button>
          </div>

          <Link
            href="/capsule"
            className={`${styles.btn} ${pathname === "/capsule" ? styles.active : ""}`}
            aria-label="Capsule"
            aria-current={pathname === "/capsule" ? "page" : undefined}
            data-intent="navigate_capsule"
          >
            <CapsuleIcon />
            <span>Capsule</span>
          </Link>

          <div className={styles.moreWrap} ref={moreRef}>
            <button
              type="button"
              className={`${styles.btn} ${open ? styles.active : ""}`}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="true"
              aria-label="More options"
              data-intent="open_more"
            >
              <MenuIcon />
              <span>More</span>
            </button>
            {open ? (
              <div className={styles.sheet} role="menu" data-surface="ai-dock-more">
                <Link
                  href="/memory"
                  className={styles.sheetItem}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  data-intent="navigate_memory"
                >
                  <MemoryIcon />
                  Memory
                </Link>
                <Link
                  href="/settings"
                  className={styles.sheetItem}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  data-intent="navigate_settings"
                >
                  <SettingsIcon />
                  Settings
                </Link>
              </div>
            ) : null}
          </div>
        </div>
        <div className={styles.filler} aria-hidden />
      </div>
    </nav>
  );
}

function HomeIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bnHome" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <path d="M3 10.5 12 3l9 7.5" stroke="url(#bnHome)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 9.5V20h14V9.5" stroke="url(#bnHome)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function CreateIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bnCreate" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <path d="M12 6v12M6 12h12" stroke="url(#bnCreate)" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function CapsuleIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bnCapsule" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <rect x="4" y="6.5" width="16" height="11" rx="5.5" stroke="url(#bnCapsule)" strokeWidth="1.8"/>
      <path d="M12 8v8" stroke="url(#bnCapsule)" strokeWidth="1.8"/>
    </svg>
  );
}
function MenuIcon(){
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bnMenu" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <path d="M5 8h14M5 12h14M5 16h10" stroke="url(#bnMenu)" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function CommandIcon(){
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bnCmd" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <path d="M10.5 6.5h7l4 4v7l-4 4h-7l-4-4v-7l4-4Z" stroke="url(#bnCmd)" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M11 14h6" stroke="url(#bnCmd)" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M14 11v6" stroke="url(#bnCmd)" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

function MemoryIcon(){
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bnMemo" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <rect x="3" y="4" width="14" height="12" rx="3" stroke="url(#bnMemo)" strokeWidth="1.4"/>
      <path d="M6.5 8.5h7" stroke="url(#bnMemo)" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M6.5 11.5h4" stroke="url(#bnMemo)" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function SettingsIcon(){
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="bnSettings" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
      <path d="M10 6.25A3.75 3.75 0 1 1 6.25 10 3.75 3.75 0 0 1 10 6.25Z" stroke="url(#bnSettings)" strokeWidth="1.4"/>
      <path d="m3.9 7.24 1.2-.3m9.8 0 1.2.3m-12.2 5.52 1.2.3m9.8 0 1.2-.3M10 3.3v1.2m0 10.14v1.2" stroke="url(#bnSettings)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
