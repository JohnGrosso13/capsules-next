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

  function btnClass(href: string) {
    return `${styles.btn} ${pathname === href ? styles.active : ""}`.trim();
  }

  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <div className={styles.dock}>
          <Link href="/" className={btnClass("/")}
            aria-label="Home" aria-current={pathname === "/" ? "page" : undefined}>
            <HomeIcon />
            <span>Home</span>
          </Link>
          <Link href="/create" className={btnClass("/create")}
            aria-label="Create" aria-current={pathname === "/create" ? "page" : undefined}>
            <CreateIcon />
            <span>Create</span>
          </Link>
          <Link href="/capsule" className={btnClass("/capsule")}
            aria-label="Capsule" aria-current={pathname === "/capsule" ? "page" : undefined}>
            <CapsuleIcon />
            <span>Capsule</span>
          </Link>
          <div className={styles.moreWrap} ref={moreRef}>
            <button type="button" className={btnClass("/more")} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true" aria-label="More">
              <MenuIcon />
              <span>Menu</span>
            </button>
            {open ? (
              <div className={styles.sheet} role="menu">
                <Link href="/memory" className={styles.sheetItem} role="menuitem" onClick={() => setOpen(false)}>Memory</Link>
                <Link href="/settings" className={styles.sheetItem} role="menuitem" onClick={() => setOpen(false)}>Settings</Link>
              </div>
            ) : null}
          </div>
        </div>
        <div className={styles.filler} aria-hidden />
      </div>
    </div>
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
