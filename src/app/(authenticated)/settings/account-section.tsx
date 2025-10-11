"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  ProfileAvatarCustomizer,
  type CapsuleCustomizerSaveResult,
} from "@/components/capsule/CapsuleCustomizer";
import cards from "@/components/home.module.css";

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

type AccountSettingsSectionProps = {
  profile: AccountProfile;
};

export function AccountSettingsSection({
  profile,
}: AccountSettingsSectionProps): React.JSX.Element {
  const [customAvatarUrl, setCustomAvatarUrl] = React.useState<string | null>(
    profile.avatarUrl ?? null,
  );
  const [customizerOpen, setCustomizerOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasCustomAvatar = Boolean(customAvatarUrl);
  const activeAvatarUrl = customAvatarUrl ?? profile.clerkAvatarUrl ?? null;
  const displayName = profile.name ?? profile.email ?? "Your profile";
  const initials = buildInitials(profile.name, profile.email);

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
              <span className={styles.profileName}>{displayName}</span>
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
        </div>
      </article>

      <ProfileAvatarCustomizer
        open={customizerOpen}
        capsuleId={null}
        capsuleName={displayName}
        onClose={() => setCustomizerOpen(false)}
        onSaved={handleCustomizerSaved}
      />
    </>
  );
}
