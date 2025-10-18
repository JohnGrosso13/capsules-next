"use client";

import * as React from "react";

import cards from "@/components/home.module.css";
import { ThemeStyleCarousel } from "@/components/theme-style-carousel";

import layout from "./settings.module.css";
import { CapsuleSettingsSection } from "./capsules-section";
import { AccountSettingsSection } from "./account-section";
import { VoiceSettingsSection } from "./voice-section";

type CapsuleSettingsProps = React.ComponentProps<typeof CapsuleSettingsSection>;
type AccountProfileProps = React.ComponentProps<typeof AccountSettingsSection>["profile"];

type SettingsShellProps = {
  initialCapsules: CapsuleSettingsProps["initialCapsules"];
  accountProfile: AccountProfileProps;
};

type SettingsSectionKey = "capsules" | "account" | "appearance" | "voice";

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
  { key: "account", label: "Account", enabled: true },
  { key: "appearance", label: "Appearance", enabled: true },
  { key: "voice", label: "Voice", enabled: true },
  { key: "notifications", label: "Notifications", enabled: false },
  { key: "devices", label: "Devices", enabled: false },
  { key: "privacy", label: "Privacy", enabled: false },
  { key: "accessibility", label: "Accessibility", enabled: false },
  { key: "advanced", label: "Advanced", enabled: false },
];

export function SettingsShell({
  initialCapsules,
  accountProfile,
}: SettingsShellProps): React.JSX.Element {
  const [activeSection, setActiveSection] = React.useState<SettingsSectionKey>("capsules");
  const [accountProfileState, setAccountProfileState] =
    React.useState<AccountProfileProps>(accountProfile);
  const lastAccountProfileProp = React.useRef<AccountProfileProps>(accountProfile);

  React.useEffect(() => {
    if (lastAccountProfileProp.current !== accountProfile) {
      lastAccountProfileProp.current = accountProfile;
      setAccountProfileState(accountProfile);
    }
  }, [accountProfile]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleAvatarUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ avatarUrl?: unknown }>).detail;
      if (!detail || !("avatarUrl" in detail)) {
        return;
      }

      const rawAvatar = detail.avatarUrl;
      let normalized: string | null;
      if (typeof rawAvatar === "string") {
        const trimmed = rawAvatar.trim();
        normalized = trimmed.length ? trimmed : null;
      } else if (rawAvatar === null) {
        normalized = null;
      } else {
        return;
      }

      setAccountProfileState((prev) => {
        if ((prev.avatarUrl ?? null) === normalized) {
          return prev;
        }
        return { ...prev, avatarUrl: normalized };
      });
    };

    window.addEventListener("capsules:avatar-updated", handleAvatarUpdate as EventListener);
    return () => {
      window.removeEventListener("capsules:avatar-updated", handleAvatarUpdate as EventListener);
    };
  }, []);

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

          {activeSection === "account" ? (
            <section aria-label="Account settings" className={layout.section}>
              <AccountSettingsSection profile={accountProfileState} />
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

          {activeSection === "voice" ? (
            <section aria-label="Voice settings" className={layout.section}>
              <VoiceSettingsSection />
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
