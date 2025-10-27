"use client";

import * as React from "react";
import Link from "next/link";

import { Button, ButtonLink } from "@/components/ui/button";

import cards from "@/components/cards.module.css";

import layout from "./settings.module.css";
import styles from "./capsules-section.module.css";

type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  storeBannerUrl: string | null;
  promoTileUrl: string | null;
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
  const [confirming, setConfirming] = React.useState<CapsuleSummary | null>(null);

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

  const deleteCapsule = React.useCallback(async (capsule: CapsuleSummary) => {
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
  }, []);

  const handleDeleteClick = React.useCallback((capsule: CapsuleSummary) => {
    setConfirming(capsule);
  }, []);

  const handleConfirmDelete = React.useCallback(
    (capsule: CapsuleSummary) => {
      void (async () => {
        try {
          await deleteCapsule(capsule);
        } finally {
          setConfirming(null);
        }
      })();
    },
    [deleteCapsule],
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
        <p className={styles.intro}>
          Capsules you created are listed below. Select one to open it in the capsule workspace or
          delete it if you no longer need it.
        </p>

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
            {showRefreshState ? <p className={styles.helper}>Refreshing your capsules...</p> : null}
            <div className={styles.list}>
              {capsules.map((capsule) => {
                const deleting = deletingId === capsule.id;
                const capsuleLink = `/capsule?capsuleId=${encodeURIComponent(capsule.id)}`;
                return (
                  <div key={capsule.id} className={styles.item}>
                    <Link href={capsuleLink} className={styles.itemLink}>
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
                    </Link>
                    <div className={styles.actions}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.deleteButton}
                        onClick={() => handleDeleteClick(capsule)}
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

      <ConfirmDeleteDialog
        capsule={confirming}
        busy={Boolean(confirming && deletingId === confirming.id)}
        onCancel={() => {
          if (!confirming || deletingId === confirming.id) return;
          setConfirming(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </article>
  );
}

type ConfirmDeleteDialogProps = {
  capsule: CapsuleSummary | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (capsule: CapsuleSummary) => void;
};

function ConfirmDeleteDialog({ capsule, busy, onCancel, onConfirm }: ConfirmDeleteDialogProps) {
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null);
  const headingId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!capsule) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) {
          onCancel();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const { body } = document;
    const originalOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const focusId = window.setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 0);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusId);
      body.style.overflow = originalOverflow;
    };
  }, [busy, capsule, onCancel]);

  if (!capsule) return null;

  const handleOverlayClick = () => {
    if (!busy) {
      onCancel();
    }
  };

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={handleOverlayClick}>
      <div
        className={styles.modalPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={headingId} className={styles.modalTitle}>
          Delete {capsule.name}?
        </h3>
        <p id={descriptionId} className={styles.modalDescription}>
          Deleting this capsule will permanently remove it and all shared content. This action{" "}
          <span className={styles.modalDanger}>cannot be undone.</span>
        </p>
        <div className={styles.modalActions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="primary"
            size="sm"
            className={styles.modalDeleteButton}
            onClick={() => onConfirm(capsule)}
            loading={busy}
            disabled={busy}
          >
            Delete Capsule
          </Button>
        </div>
      </div>
    </div>
  );
}
