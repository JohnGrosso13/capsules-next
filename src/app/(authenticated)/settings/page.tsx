import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import cards from "@/components/home.module.css";
import { ThemeToggle } from "@/components/theme-toggle";
import { SavedStylesPanel } from "@/components/saved-styles-panel";

import layout from "./settings.module.css";

export const metadata: Metadata = {
  title: "Capsules Preferences",
  description: "Manage your account and profile.",
};

export default function SettingsPage() {
  return (
    <AppPage showPrompter={false}>
      <div className={layout.main}>
        <section className={layout.shell}>
          <aside className={layout.side} aria-label="Settings sections">
            <div className={layout.sideInner}>
              <strong className={layout.sideTitle}>Capsules</strong>
              <nav className={layout.sideNav}>
                <button className={layout.sideItem} disabled aria-disabled>
                  Account
                </button>
                <button className={`${layout.sideItem} ${layout.sideItemActive}`} aria-label="Appearance">
                  Appearance
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Notifications
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Voice
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Devices
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Privacy
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Accessibility
                </button>
                <button className={layout.sideItem} disabled aria-disabled>
                  Advanced
                </button>
              </nav>
            </div>
          </aside>

          <div className={layout.content}>
            <section aria-label="Appearance settings" className={layout.section}>
              <div className={layout.grid}>
                <article className={`${cards.card} ${layout.card}`}>
                  <header className={cards.cardHead}>Theme</header>
                  <div className={cards.cardBody}>
                    <ThemeToggle />
                  </div>
                </article>
                <article className={`${cards.card} ${layout.card}`}>
                  <header className={cards.cardHead}>Saved Styles</header>
                  <div className={cards.cardBody}>
                    <SavedStylesPanel />
                  </div>
                </article>
              </div>
            </section>
          </div>
        </section>
      </div>
    </AppPage>
  );
}





