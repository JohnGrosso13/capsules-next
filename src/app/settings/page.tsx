import type { Metadata } from "next";
import Link from "next/link";

import { HeaderAuth } from "@/components/header-auth";
import headerStyles from "../landing.module.css";
import layout from "./settings.module.css";
import cards from "@/components/home.module.css";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Settings - Capsules",
  description: "Manage your account and profile.",
};

export default function SettingsPage() {
  return (
    <div className={headerStyles.page}>
      <header className={headerStyles.header}>
        <div className={headerStyles.headerInner}>
          <Link href="/" className={headerStyles.brand} aria-label="Capsules home">
            <span className={headerStyles.brandMark} aria-hidden="true" />
            <span className={headerStyles.brandName}>Capsules</span>
          </Link>
          <nav className={headerStyles.nav} aria-label="Primary navigation">
            <Link href="/" className={headerStyles.navLink}>Home</Link>
            <Link href="/create" className={headerStyles.navLink}>Create</Link>
            <Link href="/capsule" className={headerStyles.navLink}>Capsule</Link>
            <Link href="/memory" className={headerStyles.navLink}>Memory</Link>
          </nav>
          <div className={headerStyles.headerActions}>
            <HeaderAuth />
          </div>
        </div>
      </header>

      <main className={layout.main}>
        <section className={layout.shell}>
          <aside className={layout.side} aria-label="Settings sections">
            <div className={layout.sideInner}>
              <strong className={layout.sideTitle}>Capsules</strong>
              <nav className={layout.sideNav}>
                <button className={layout.sideItem} disabled aria-disabled>Account</button>
                <button className={`${layout.sideItem} ${layout.sideItemActive}`}>Appearance</button>
                <button className={layout.sideItem} disabled aria-disabled>Notifications</button>
                <button className={layout.sideItem} disabled aria-disabled>Voice</button>
                <button className={layout.sideItem} disabled aria-disabled>Devices</button>
                <button className={layout.sideItem} disabled aria-disabled>Privacy</button>
                <button className={layout.sideItem} disabled aria-disabled>Accessibility</button>
                <button className={layout.sideItem} disabled aria-disabled>Advanced</button>
              </nav>
            </div>
          </aside>

          <div className={layout.content}>
            <header className={layout.contentHead}>
              <h1 className={layout.contentTitle}>Settings</h1>
            </header>

            <section aria-labelledby="appearance-title" className={layout.section}>
              <h2 id="appearance-title" className={layout.sectionTitle}>Appearance</h2>
              <div className={layout.grid}>
                <article className={`${cards.card} ${layout.card}`}>
                  <header className={cards.cardHead}>Theme</header>
                  <div className={cards.cardBody}>
                    <ThemeToggle />
                  </div>
                </article>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
