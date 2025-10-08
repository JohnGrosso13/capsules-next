"use client";

import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";

import cards from "@/components/home.module.css";

import layout from "./settings.module.css";
import styles from "./capsules-section.module.css";

type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  role: string | null;
  ownership: "owner" | "member";
};

type CapsulesResponse = {
  capsules?: CapsuleSummary[];
};

type CapsuleSettingsSectionProps = {
  initialCapsules: CapsuleSummary[];
};

function getInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "C";
  return trimmed.charAt(0).toUpperCase();
}

function resolveDetail(capsule: CapsuleSummary): string {
  if (capsule.slug && capsule.slug.trim().length) return capsule.slug;
  return capsule.id;
}

export function CapsuleSettingsSection({
  initialCapsules,
}: CapsuleSettingsSectionProps): React.JSX.Element {
  const [capsules, setCapsules] = React.useState<CapsuleSummary[]>(() => [...initialCapsules]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCapsules(initialCapsules);
  }, [initialCapsules]);

  const loadCapsules = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/capsules", { credentials: "include" });
      const payload = (await response.json().catch(() => null)) as CapsulesResponse | null;
      if (!response.ok || !payload || !Array.isArray(payload.capsules)) {
        throw new Error("capsule list failed");
      }
      const ownedCapsules = payload.capsules.filter((capsule) => capsule.ownership === "owner");
      setCapsules(ownedCapsules);
    } catch (err) {
      console.error("settings capsules load error", err);
      setError("Unable to load your capsules. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = React.useCallback(
    async (capsule: CapsuleSummary) => {
      const confirmed = window.confirm(
        `Deleting "${capsule.name}" will permanently remove it and all associated data. This cannot be undone. Do you want to continue?`,
      );
      if (!confirmed) return;

      setDeletingId(capsule.id);
      setError(null);
      try {
        const response = await fetch(`/api/capsules/${capsule.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`capsule delete failed with status ${response.status}`);
        }
        setCapsules((prev) => prev.filter((item) => item.id !== capsule.id));
      } catch (err) {
        console.error("settings capsules delete error", err);
        setError("Failed to delete the capsule. Please try again.");
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  const ownedCount = capsules.length;
  const hasCapsules = ownedCount > 0;
  const showLoadingState = loading && !hasCapsules;
  const showRefreshState = loading && hasCapsules;

  return (
    <article className={`${cards.card} ${layout.card}`}>
      <header className={cards.cardHead}>
        <h3 className={layout.sectionTitle}>Your Capsules</h3>
      </header>
      <div className={`${cards.cardBody} ${styles.sectionBody}`}>
        <Alert tone="danger" className={styles.warning}>
          <AlertTitle>This action is destructive.</AlertTitle>
          <AlertDescription>
            Only capsules you created appear here. Deleting a capsule permanently removes it and all
            of its shared content. This cannot be undone.
          </AlertDescription>
        </Alert>

        {error ? (
          <div className={styles.errorRow}>
            <p className={styles.error}>{error}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void loadCapsules();
              }}
              loading={loading}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {showLoadingState ? (
          <p className={styles.helper}>Loading your capsules...</p>
        ) : hasCapsules ? (
          <>
            {showRefreshState ? (
              <p className={styles.helper}>Refreshing your capsules...</p>
            ) : null}
            <div className={styles.list}>
              {capsules.map((capsule) => {
                const deleting = deletingId === capsule.id;
                return (
                  <div key={capsule.id} className={styles.item}>
                    <div className={styles.info}>
                      <span className={styles.avatar} aria-hidden>
                        {capsule.logoUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={capsule.logoUrl} alt="" width={44} height={44} />
                          </>
                        ) : (
                          getInitial(capsule.name)
                        )}
                      </span>
                      <div className={styles.meta}>
                        <p className={styles.name}>{capsule.name}</p>
                        <span className={styles.detail}>{resolveDetail(capsule)}</span>
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.deleteButton}
                        onClick={() => void handleDelete(capsule)}
                        loading={deleting}
                      >
                        Delete Capsule
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Create a New Capsule!</p>
            <div className={styles.emptyActions}>
              <ButtonLink href="/capsule/onboarding" variant="gradient" size="md">
                Create a Capsule
              </ButtonLink>
            </div>
          </div>
        )}

        {!loading && hasCapsules ? (
          <p className={styles.statusText}>
            {ownedCount === 1
              ? "You have 1 capsule that you can delete from here."
              : `You have ${ownedCount} capsules that you can delete from here.`}
          </p>
        ) : null}
      </div>
    </article>
  );
}
