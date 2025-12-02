"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ProfileAvatarCustomizer,
  type CapsuleCustomizerSaveResult,
} from "@/components/capsule/CapsuleCustomizer";
import cards from "@/components/cards.module.css";

import layout from "./settings.module.css";
import styles from "./account-section.module.css";

type AccountProfile = {
  id: string;
  name: string | null;
  email: string | null;
  clerkAvatarUrl: string | null;
  avatarUrl: string | null;
};

function buildInitials(name: string | null, email: string | null): string {
  const source = (name ?? email ?? "").trim();
  if (!source) return "U";
  const words = source.split(/\s+/).filter(Boolean);
  if (!words.length) return source.charAt(0).toUpperCase();
  if (words.length === 1) {
    const letter = words[0]?.charAt(0) ?? source.charAt(0);
    return letter ? letter.toUpperCase() : "U";
  }
  const first = words[0]?.charAt(0) ?? "";
  const last = words[words.length - 1]?.charAt(0) ?? "";
  const combined = `${first}${last}`.trim();
  if (combined.length) return combined.toUpperCase();
  const fallback = source.charAt(0);
  return fallback ? fallback.toUpperCase() : "U";
}

function normalizeDisplayNameInput(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

type AccountSettingsSectionProps = {
  profile: AccountProfile;
};

export function AccountSettingsSection({
  profile,
}: AccountSettingsSectionProps): React.JSX.Element {
  const [profileDisplayName, setProfileDisplayName] = React.useState<string | null>(
    profile.name ?? null,
  );
  const [displayNameDraft, setDisplayNameDraft] = React.useState(profile.name ?? "");
  const [displayNamePending, setDisplayNamePending] = React.useState(false);
  const [displayNameFeedback, setDisplayNameFeedback] = React.useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  const [customAvatarUrl, setCustomAvatarUrl] = React.useState<string | null>(
    profile.avatarUrl ?? null,
  );
  const [customizerOpen, setCustomizerOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasCustomAvatar = Boolean(customAvatarUrl);
  const activeAvatarUrl = customAvatarUrl ?? profile.clerkAvatarUrl ?? null;
  const savedDisplayNameNormalized = profileDisplayName
    ? normalizeDisplayNameInput(profileDisplayName)
    : "";
  const draftDisplayNameNormalized = normalizeDisplayNameInput(displayNameDraft);
  const hasDisplayNameChanges = draftDisplayNameNormalized !== savedDisplayNameNormalized;
  const resolvedDisplayName =
    (profileDisplayName && profileDisplayName.length ? profileDisplayName : null) ??
    profile.email ??
    "Your profile";
  const initials = buildInitials(profileDisplayName, profile.email);

  const handleCustomizerSaved = React.useCallback((result: CapsuleCustomizerSaveResult) => {
    if (result.type === "avatar") {
      setCustomAvatarUrl(result.avatarUrl ?? null);
    }
    setCustomizerOpen(false);
  }, []);

  const handleReset = React.useCallback(async () => {
    if (!profile.clerkAvatarUrl) {
      setError("No Clerk profile image is available to restore.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/avatar", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `Avatar reset failed with status ${response.status}`);
      }
      setCustomAvatarUrl(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("capsules:avatar-updated", { detail: { avatarUrl: null } }),
        );
      }
    } catch (err) {
      console.error("settings account reset error", err);
      setError("Unable to reset your avatar. Please try again.");
    } finally {
      setPending(false);
    }
  }, [profile.clerkAvatarUrl]);

  React.useEffect(() => {
    if (!displayNameFeedback) return;
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      setDisplayNameFeedback(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [displayNameFeedback]);

  const submitDisplayName = React.useCallback(
    async (rawValue: string | null) => {
      const normalizedInput =
        typeof rawValue === "string" ? normalizeDisplayNameInput(rawValue) : null;
      const nextValue = normalizedInput && normalizedInput.length ? normalizedInput : null;

      const nextNormalized = nextValue ?? "";
      if (nextNormalized === savedDisplayNameNormalized) {
        setDisplayNameDraft(nextValue ?? "");
        setDisplayNameFeedback(null);
        return;
      }

      setDisplayNamePending(true);
      setDisplayNameFeedback(null);
      try {
        const response = await fetch("/api/account/profile", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextValue }),
        });
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || `Display name update failed with status ${response.status}`);
        }
        const payload = (await response.json().catch(() => null)) as
          | { name?: unknown }
          | null;
        const updatedName =
          payload && typeof payload === "object" && typeof payload.name === "string"
            ? payload.name
            : null;

        setProfileDisplayName(updatedName);
        setDisplayNameDraft(updatedName ?? "");
        setDisplayNameFeedback({
          tone: "success",
          message: updatedName
            ? "Display name updated."
            : "Display name cleared. We'll use your account name instead.",
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("capsules:profile-updated", {
              detail: { name: updatedName ?? null },
            }),
          );
        }
      } catch (err) {
        console.error("settings account display name update error", err);
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Unable to update your display name. Please try again.";
        setDisplayNameFeedback({ tone: "error", message });
      } finally {
        setDisplayNamePending(false);
      }
    },
    [savedDisplayNameNormalized],
  );

  const handleDisplayNameSave = React.useCallback(() => {
    void submitDisplayName(displayNameDraft);
  }, [displayNameDraft, submitDisplayName]);

  const handleDisplayNameClear = React.useCallback(() => {
    setDisplayNameDraft("");
    void submitDisplayName(null);
  }, [submitDisplayName, setDisplayNameDraft]);

  return (
    <>
      <article className={`${cards.card} ${layout.card}`}>
        <header className={cards.cardHead}>
          <h3 className={layout.sectionTitle}>Account</h3>
        </header>
        <div className={`${cards.cardBody} ${styles.sectionBody}`}>
          <div className={styles.profileRow}>
            <span className={styles.avatar} aria-hidden>
              {activeAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeAvatarUrl} alt="" />
              ) : (
                <span className={styles.avatarInitials}>{initials}</span>
              )}
            </span>
            <div className={styles.profileMeta}>
              <span className={styles.profileName}>{resolvedDisplayName}</span>
              {profile.email ? <span className={styles.profileEmail}>{profile.email}</span> : null}
              <span className={styles.profileStatus}>
                {hasCustomAvatar
                  ? "Using a custom avatar stored in Capsules."
                  : "Using your Clerk profile image."}
              </span>
            </div>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="primary"
              className={layout.settingsCtaPrimary}
              onClick={() => {
                setCustomizerOpen(true);
                setError(null);
              }}
            >
              Customize avatar
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={layout.settingsCtaSecondary}
              onClick={() => {
                void handleReset();
              }}
              disabled={pending || !hasCustomAvatar || !profile.clerkAvatarUrl}
              loading={pending && hasCustomAvatar}
            >
              Reset to Clerk photo
            </Button>
          </div>
          <p className={styles.helper}>
            Your avatar appears anywhere your profile is shown - like chats, posts, or member lists.
            Use the customizer to upload art, reuse memories, or ask Capsule AI to generate a
            circular portrait.
          </p>

          <div className={styles.displayNameSection}>
            <div className={styles.displayNameIntro}>
              <h4 className={styles.displayNameTitle}>Your display name</h4>
              <p>
                This optional name appears in parties, invites, and other member lists. Leave it
                blank to fall back to your account name.
              </p>
            </div>
            <label className={styles.displayNameLabel} htmlFor="settings-display-name">
              Display name
            </label>
            <div className={styles.displayNameForm}>
              <Input
                id="settings-display-name"
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                placeholder={profile.email ?? "Your profile"}
                maxLength={80}
                disabled={displayNamePending}
                className={styles.displayNameInput}
              />
              <div className={styles.displayNameActions}>
                <Button
                  type="button"
                  variant="primary"
                  className={layout.settingsCtaPrimary}
                  onClick={handleDisplayNameSave}
                  disabled={!hasDisplayNameChanges || displayNamePending}
                  loading={displayNamePending && hasDisplayNameChanges}
                >
                  Save display name
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDisplayNameClear}
                  disabled={
                    displayNamePending ||
                    (!profileDisplayName && draftDisplayNameNormalized.length === 0)
                  }
                >
                  Clear display name
                </Button>
              </div>
            </div>
            <p className={styles.displayNameHint}>
              Default name: {profile.email ?? "no account name on file"}
            </p>
            {displayNameFeedback ? (
              <p
                className={`${styles.displayNameMessage} ${
                  displayNameFeedback.tone === "error"
                    ? styles.displayNameMessageError
                    : styles.displayNameMessageSuccess
                }`}
              >
                {displayNameFeedback.message}
              </p>
            ) : null}
          </div>

          <div className={styles.upgradeGrid}>
            <div className={styles.upgradeCard}>
              <p className={styles.upgradeEyebrow}>Personal plan</p>
              <h4 className={styles.upgradeTitle}>Unlock higher-quality models</h4>
              <p className={styles.upgradeCopy}>
                Keep generation snappy, unlock premium image/video models, and reserve extra
                compute for your own prompts.
              </p>
              <div className={styles.upgradeActions}>
                <Button type="button" variant="primary" className={layout.settingsCtaPrimary}>
                  View personal plans
                </Button>
                <Button type="button" variant="ghost" className={layout.settingsCtaSecondary}>
                  Compare tiers
                </Button>
              </div>
            </div>
            <div className={styles.upgradeCard}>
              <p className={styles.upgradeEyebrow}>Personal memory</p>
              <h4 className={styles.upgradeTitle}>Give your uploads more breathing room</h4>
              <p className={styles.upgradeCopy}>
                Add storage for documents, images, and clips so Capsule AI can recall more of your
                personal context.
              </p>
              <div className={styles.upgradeActions}>
                <Button type="button" variant="secondary" className={layout.settingsCtaSecondary}>
                  Increase memory
                </Button>
                <Button type="button" variant="ghost">
                  How it works
                </Button>
              </div>
            </div>
          </div>

          <div className={styles.profileLinkCard}>
            <div>
              <h4>Profile page</h4>
              <p>Preview and share how your Capsules profile appears to others.</p>
            </div>
            <Button asChild variant="secondary" className={layout.settingsCtaSecondary}>
              <Link href="/profile/me">Open profile</Link>
            </Button>
          </div>
        </div>
      </article>

      <ProfileAvatarCustomizer
        open={customizerOpen}
        capsuleId={null}
        capsuleName={resolvedDisplayName}
        onClose={() => setCustomizerOpen(false)}
        onSaved={handleCustomizerSaved}
      />
    </>
  );
}
