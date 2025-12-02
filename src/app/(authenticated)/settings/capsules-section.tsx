"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { DotsThree } from "@phosphor-icons/react/dist/ssr";

import { Button, ButtonLink } from "@/components/ui/button";
import contextMenuStyles from "@/components/ui/context-menu.module.css";
import cards from "@/components/cards.module.css";

import layout from "./settings.module.css";
import styles from "./capsules-section.module.css";
import { CapsuleAiSettingsPanel } from "./capsule-ai-settings";

type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  storeBannerUrl: string | null;
  promoTileUrl: string | null;
  logoUrl: string | null;
  role: string | null;
  ownership: "owner" | "member" | "follower";
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
  const [selectedCapsule, setSelectedCapsule] = React.useState<CapsuleSummary | null>(null);
  const [upgradeId, setUpgradeId] = React.useState<string | null>(null);
  const [menuState, setMenuState] = React.useState<{
    capsule: CapsuleSummary;
    top: number;
    left: number;
  } | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const firstMenuItemRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    setCapsules(initialCapsules);
    setSelectedCapsule((current) => {
      if (!current) return null;
      return initialCapsules.find((capsule) => capsule.id === current.id) ?? null;
    });
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
      setSelectedCapsule((current) => {
        if (!current) return null;
        return ownedCapsules.find((capsule) => capsule.id === current.id) ?? null;
      });
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
      setSelectedCapsule((current) => (current?.id === capsule.id ? null : current));
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

  const startCapsuleUpgrade = React.useCallback(async (capsule: CapsuleSummary) => {
    setUpgradeId(capsule.id);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "capsule",
          capsuleId: capsule.id,
          successPath: "/settings?tab=billing",
          cancelPath: "/settings?tab=billing",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const checkoutUrl = (payload as { checkoutUrl?: string }).checkoutUrl;
      if (!response.ok || !checkoutUrl) {
        throw new Error((payload as { message?: string })?.message ?? "Upgrade failed");
      }
      window.location.href = checkoutUrl;
    } catch (err) {
      console.error("capsule.upgrade.failed", err);
      setError((err as Error)?.message ?? "Unable to start upgrade");
    } finally {
      setUpgradeId(null);
    }
  }, []);

  const closeMenu = React.useCallback(() => {
    setMenuState(null);
  }, []);

  React.useEffect(() => {
    if (!menuState) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };

    const handleViewportChange = () => {
      closeMenu();
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      closeMenu();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [closeMenu, menuState]);

  React.useEffect(() => {
    if (!menuState) return;
    const timer = window.setTimeout(() => {
      firstMenuItemRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [menuState]);

  const computeMenuPosition = React.useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const menuWidth = 240;
    const viewportWidth = window.innerWidth;
    const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
    const top = scrollY + rect.bottom + 8;
    const centeredLeft = scrollX + rect.left + rect.width / 2 - menuWidth / 2;
    const left = Math.max(
      scrollX + 12,
      Math.min(centeredLeft, scrollX + viewportWidth - menuWidth - 12),
    );
    return { top, left };
  }, []);

  const openMenuForCapsule = React.useCallback(
    (capsule: CapsuleSummary, anchor: HTMLElement) => {
      const position = computeMenuPosition(anchor);
      setMenuState({ capsule, ...position });
    },
    [computeMenuPosition],
  );

  React.useEffect(() => {
    if (!menuState) return;
    const stillExists = capsules.some((capsule) => capsule.id === menuState.capsule.id);
    if (!stillExists) {
      setMenuState(null);
    }
  }, [capsules, menuState]);

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
              className={layout.settingsCtaSecondary}
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
                const managing = selectedCapsule?.id === capsule.id;
                const capsuleLink = `/capsule?capsuleId=${encodeURIComponent(capsule.id)}`;
                const menuOpen = menuState?.capsule.id === capsule.id;
                return (
                  <div
                    key={capsule.id}
                    className={managing ? `${styles.item} ${styles.itemActive}` : styles.item}
                    data-active={managing ? "true" : undefined}
                  >
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
                        size="icon"
                        aria-label={`Actions for ${capsule.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        className={`${styles.actionMenuButton} ${
                          menuOpen ? styles.actionMenuButtonActive : ""
                        }`.trim()}
                        onClick={(event) => {
                          if (menuOpen) {
                            closeMenu();
                            return;
                          }
                          openMenuForCapsule(capsule, event.currentTarget);
                        }}
                        leftIcon={<DotsThree size={18} weight="bold" />}
                      />
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

        {selectedCapsule ? (
          <CapsuleAiSettingsPanel
            capsuleId={selectedCapsule.id}
            capsuleName={selectedCapsule.name}
            onClose={() => setSelectedCapsule(null)}
          />
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

      {menuState && typeof document !== "undefined"
        ? createPortal(
            <div className={contextMenuStyles.backdrop} role="presentation" onClick={closeMenu}>
              <div
                ref={menuRef}
                className={`${contextMenuStyles.menu} ${styles.actionMenuList}`.trim()}
                style={{ top: menuState.top, left: menuState.left }}
                role="menu"
                aria-label={`Actions for ${menuState.capsule.name}`}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  ref={firstMenuItemRef}
                  type="button"
                  className={contextMenuStyles.item}
                  role="menuitem"
                  onClick={() => {
                    setSelectedCapsule(menuState.capsule);
                    closeMenu();
                  }}
                >
                  {selectedCapsule?.id === menuState.capsule.id ? "Viewing AI Settings" : "Manage AI"}
                </button>
                <button
                  type="button"
                  className={contextMenuStyles.item}
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    void startCapsuleUpgrade(menuState.capsule);
                  }}
                  disabled={upgradeId === menuState.capsule.id}
                  aria-disabled={upgradeId === menuState.capsule.id}
                >
                  {upgradeId === menuState.capsule.id ? "Starting upgrade..." : "Upgrade Capsule"}
                </button>
                <div className={contextMenuStyles.separator} role="separator" />
                <button
                  type="button"
                  className={`${contextMenuStyles.item} ${contextMenuStyles.danger}`.trim()}
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    handleDeleteClick(menuState.capsule);
                  }}
                  disabled={deletingId === menuState.capsule.id}
                  aria-disabled={deletingId === menuState.capsule.id}
                >
                  {deletingId === menuState.capsule.id ? "Deleting..." : "Delete Capsule"}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
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
