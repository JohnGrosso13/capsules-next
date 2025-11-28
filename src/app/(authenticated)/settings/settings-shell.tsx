"use client";

import * as React from "react";

import cards from "@/components/cards.module.css";
import { ThemeStyleCarousel } from "@/components/theme-style-carousel";
import type { NotificationSettings } from "@/shared/notifications";

import layout from "./settings.module.css";
import { CapsuleSettingsSection } from "./capsules-section";
import { AccountSettingsSection } from "./account-section";
import { VoiceSettingsSection } from "./voice-section";
import { ConnectionsSettingsSection } from "./connections-section";
import { ComposerSettingsSection } from "./composer-settings-section";
import { NotificationsSettingsSection } from "./notifications-section";
import { AccessibilitySettingsSection } from "./accessibility-section";

type CapsuleSettingsProps = React.ComponentProps<typeof CapsuleSettingsSection>;
type AccountProfileProps = React.ComponentProps<typeof AccountSettingsSection>["profile"];

type SettingsShellProps = {
  initialCapsules: CapsuleSettingsProps["initialCapsules"];
  accountProfile: AccountProfileProps;
  notificationSettings: NotificationSettings;
};

type SettingsSectionKey =
  | "capsules"
  | "account"
  | "connections"
  | "appearance"
  | "voice"
  | "composer"
  | "notifications"
  | "accessibility";

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
  { key: "connections", label: "Connections", enabled: true },
  { key: "appearance", label: "Appearance", enabled: true },
  { key: "composer", label: "Composer Settings", enabled: true },
  { key: "voice", label: "Voice", enabled: true },
  { key: "notifications", label: "Notifications", enabled: true },
  { key: "accessibility", label: "Accessibility", enabled: true },
  { key: "devices", label: "Devices", enabled: false },
  { key: "privacy", label: "Privacy", enabled: false },
  { key: "advanced", label: "Advanced", enabled: false },
];

export function SettingsShell({
  initialCapsules,
  accountProfile,
  notificationSettings,
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

  const normalizeSectionKey = React.useCallback(
    (value: string | null | undefined): SettingsSectionKey | null => {
      if (typeof value !== "string") return null;
      const key = value.trim().toLowerCase();
      switch (key) {
        case "capsules":
        case "account":
        case "connections":
        case "appearance":
        case "composer":
        case "voice":
        case "notifications":
        case "accessibility":
          return key as SettingsSectionKey;
        default:
          return null;
      }
    },
    [],
  );

  const setSectionWithHistory = React.useCallback(
    (section: SettingsSectionKey) => {
      setActiveSection(section);
      if (typeof window === "undefined") return;
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("tab") !== section) {
          url.searchParams.set("tab", section);
        }
        window.history.replaceState(window.history.state, "", url.toString());
      } catch (error) {
        console.error("settings nav update failed", error);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      let next = normalizeSectionKey(url.searchParams.get("tab"));
      let mutated = false;
      if (!next) {
        const hash = url.hash.replace(/^#/, "");
        if (hash === "linked") {
          next = "connections";
          url.searchParams.set("tab", "connections");
          url.hash = "";
          mutated = true;
        }
      }
      if (next) {
        setActiveSection(next);
        if (mutated) {
          window.history.replaceState(window.history.state, "", url.toString());
        }
      }
    } catch (error) {
      console.error("settings nav bootstrap failed", error);
    }
  }, [normalizeSectionKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const current = normalizeSectionKey(url.searchParams.get("tab"));
      if (current === activeSection) return;
      url.searchParams.set("tab", activeSection);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (error) {
      console.error("settings nav sync failed", error);
    }
  }, [activeSection, normalizeSectionKey]);

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
                      setSectionWithHistory(item.key);
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

          {activeSection === "connections" ? (
            <section aria-label="Connections settings" className={layout.section}>
              <ConnectionsSettingsSection />
            </section>
          ) : null}

          {activeSection === "composer" ? (
            <section aria-label="Composer settings" className={layout.section}>
              <ComposerSettingsSection />
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

          {activeSection === "notifications" ? (
            <section aria-label="Notification preferences" className={layout.section}>
              <NotificationsSettingsSection initialSettings={notificationSettings} />
            </section>
          ) : null}

          {activeSection === "voice" ? (
            <section aria-label="Voice settings" className={layout.section}>
              <VoiceSettingsSection />
            </section>
          ) : null}

          {activeSection === "accessibility" ? (
            <section aria-label="Accessibility settings" className={layout.section}>
              <AccessibilitySettingsSection />
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
