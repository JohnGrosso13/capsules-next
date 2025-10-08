"use client";

import * as React from "react";

import cards from "@/components/home.module.css";
import { ThemeStyleCarousel } from "@/components/theme-style-carousel";

import layout from "./settings.module.css";
import { CapsuleSettingsSection } from "./capsules-section";

type CapsuleSettingsProps = React.ComponentProps<typeof CapsuleSettingsSection>;

type SettingsShellProps = {
  initialCapsules: CapsuleSettingsProps["initialCapsules"];
};

type SettingsSectionKey = "capsules" | "appearance";

const NAVIGATION_ITEMS: Array<
  | {
      key: SettingsSectionKey;
      label: string;
      enabled: true;
    }
  | {
      key: string;
      label: string;
      enabled: false;
    }
> = [
  { key: "capsules", label: "Capsules", enabled: true },
  { key: "account", label: "Account", enabled: false },
  { key: "appearance", label: "Appearance", enabled: true },
  { key: "notifications", label: "Notifications", enabled: false },
  { key: "voice", label: "Voice", enabled: false },
  { key: "devices", label: "Devices", enabled: false },
  { key: "privacy", label: "Privacy", enabled: false },
  { key: "accessibility", label: "Accessibility", enabled: false },
  { key: "advanced", label: "Advanced", enabled: false },
];

export function SettingsShell({ initialCapsules }: SettingsShellProps): React.JSX.Element {
  const [activeSection, setActiveSection] = React.useState<SettingsSectionKey>("capsules");

  return (
    <div className={layout.main}>
      <section className={layout.shell}>
        <aside className={layout.side} aria-label="Settings sections">
          <div className={layout.sideInner}>
            <nav className={layout.sideNav} aria-label="Settings navigation">
              {NAVIGATION_ITEMS.map((item) => {
                const isActive = item.enabled && item.key === activeSection;
                const className = `${layout.sideItem}${isActive ? ` ${layout.sideItemActive}` : ""}`;

                if (!item.enabled) {
                  return (
                    <button key={item.key} className={className} disabled aria-disabled>
                      {item.label}
                    </button>
                  );
                }

                return (
                  <button
                    key={item.key}
                    type="button"
                    className={className}
                    aria-pressed={isActive}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      setActiveSection(item.key);
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className={layout.content}>
          {activeSection === "capsules" ? (
            <section aria-label="Capsule management" className={layout.section}>
              <CapsuleSettingsSection initialCapsules={initialCapsules} />
            </section>
          ) : null}

          {activeSection === "appearance" ? (
            <section aria-label="Appearance settings" className={layout.section}>
              <article className={`${cards.card} ${layout.card}`}>
                <header className={cards.cardHead}>Themes</header>
                <div className={cards.cardBody}>
                  <ThemeStyleCarousel />
                </div>
              </article>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
