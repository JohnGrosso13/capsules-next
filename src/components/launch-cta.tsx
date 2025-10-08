"use client";

import * as React from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

import styles from "./launch-cta.module.css";

type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  role: string | null;
  ownership: "owner" | "member";
};

type Props = {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  hrefWhenSignedIn?: string;
  label?: string;
  signedOutMode?: "signup" | "signin";
  onLaunch?: () => boolean | void;
};

function getInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "C";
  return trimmed.charAt(0).toUpperCase();
}

function describeRole(capsule: CapsuleSummary): string {
  if (capsule.ownership === "owner") return "Owner";
  if (capsule.role) return capsule.role;
  return "Member";
}

export function LaunchCta({
  className,
  variant = "primary",
  size = "lg",
  hrefWhenSignedIn = "/capsule",
  label = "Launch Capsule",
  signedOutMode = "signup",
  onLaunch,
}: Props) {
  const router = useRouter();
  const launchStyles: CSSProperties = {
    background: "var(--cta-button-gradient, var(--cta-chip-gradient, var(--cta-gradient)))",
  };

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [capsules, setCapsules] = React.useState<CapsuleSummary[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const closeMenu = React.useCallback(() => setMenuOpen(false), []);

  const loadCapsules = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/capsules", { credentials: "include" });
      const data = (await response.json().catch(() => null)) as { capsules?: CapsuleSummary[] } | null;
      if (!response.ok || !Array.isArray(data?.capsules)) {
        throw new Error("capsule list failed");
      }
      setCapsules(data.capsules);
      setLoaded(true);
    } catch (err) {
      console.error("launch-cta list error", err);
      setError("Unable to load your capsules.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!menuOpen || loaded || loading) return;
    void loadCapsules();
  }, [menuOpen, loaded, loading, loadCapsules]);

  React.useEffect(() => {
    if (!menuOpen) return;

    const maybeCloseFromTarget = (target: EventTarget | null) => {
      if (!containerRef.current) return;
      if (target && containerRef.current.contains(target as Node)) return;
      closeMenu();
    };

    const handleMouseDown = (event: MouseEvent) => {
      maybeCloseFromTarget(event.target);
    };

    const handleTouchStart = (event: TouchEvent) => {
      maybeCloseFromTarget(event.target);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen, closeMenu]);

  const handleToggleMenu = React.useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const handlePrimaryClick = React.useCallback(() => {
    if (onLaunch) {
      const handled = onLaunch();
      if (handled !== false) {
        closeMenu();
        return;
      }
    }
    handleToggleMenu();
  }, [onLaunch, closeMenu, handleToggleMenu]);

  const handleLaunch = React.useCallback(
    (capsule: CapsuleSummary) => {
      closeMenu();
      const base = hrefWhenSignedIn || "/capsule";
      const separator = base.includes("?") ? "&" : "?";
      const destination = `${base}${separator}capsuleId=${encodeURIComponent(capsule.id)}`;
      router.push(destination);
    },
    [closeMenu, hrefWhenSignedIn, router],
  );

  const handleDelete = React.useCallback(
    async (capsule: CapsuleSummary) => {
      if (capsule.ownership !== "owner") return;
      const confirmed =
        typeof window !== "undefined"
          ? window.confirm(`Delete "${capsule.name}"? This cannot be undone.`)
          : false;
      if (!confirmed) return;

      setDeletingId(capsule.id);
      setError(null);

      try {
        const response = await fetch(`/api/capsules/${capsule.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`delete failed (${response.status})`);
        }
        setCapsules((prev) => prev.filter((entry) => entry.id !== capsule.id));
      } catch (err) {
        console.error("launch-cta delete error", err);
        setError("Failed to delete that capsule. Please try again.");
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  const handleCreate = React.useCallback(() => {
    closeMenu();
    router.push("/capsule/onboarding");
  }, [closeMenu, router]);

  const renderCapsuleList = () => {
    if (loading && !capsules.length) {
      return <span className={styles.loading}>Loading capsules…</span>;
    }

    if (error && !capsules.length) {
      return (
        <div className={styles.emptyState}>
          <p>{error}</p>
          <Button type="button" size="sm" variant="primary" onClick={() => void loadCapsules()}>
            Retry
          </Button>
        </div>
      );
    }

    if (!capsules.length) {
      return (
        <div className={styles.emptyState}>
          You don&apos;t have any capsules yet. Create one to get started.
        </div>
      );
    }

    return capsules.map((capsule) => {
      const deleting = deletingId === capsule.id;
      const canDelete = capsule.ownership === "owner";
      return (
        <div key={capsule.id} className={styles.capsuleRow}>
          <div className={styles.capsuleInfo}>
            <span className={styles.capsuleLogo} aria-hidden>
              {capsule.logoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={capsule.logoUrl} alt="" width={40} height={40} />
                </>
              ) : (
                getInitial(capsule.name)
              )}
            </span>
            <div className={styles.capsuleMeta}>
              <span className={styles.capsuleName}>{capsule.name}</span>
              <span className={styles.capsuleRole}>{describeRole(capsule)}</span>
            </div>
          </div>
          <div className={styles.capsuleActions}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleLaunch(capsule)}
            >
              Launch
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(capsule)}
              disabled={!canDelete || deleting}
              loading={deleting}
              title={!canDelete ? "Only owners can delete a capsule." : undefined}
            >
              Delete
            </Button>
          </div>
        </div>
      );
    });
  };

  return (
    <>
      <SignedOut>
        {signedOutMode === "signup" ? (
          <SignUpButton mode="modal">
            <Button
              type="button"
              variant={variant}
              size={size}
              className={className}
              style={launchStyles}
            >
              {label}
            </Button>
          </SignUpButton>
        ) : (
          <SignInButton mode="modal">
            <Button
              type="button"
              variant={variant}
              size={size}
              className={className}
              style={launchStyles}
            >
              {label}
            </Button>
          </SignInButton>
        )}
      </SignedOut>
      <SignedIn>
        <>
          {menuOpen ? <div className={styles.backdrop} onClick={closeMenu} aria-hidden /> : null}
          <div className={styles.container} ref={containerRef}>
            <Button
              type="button"
              variant={variant}
              size={size}
              className={className}
              style={launchStyles}
              onClick={handlePrimaryClick}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              {label}
            </Button>
            {menuOpen ? (
              <div className={styles.menu} role="dialog" aria-modal="true" aria-label="Launch capsule menu">
                <div className={styles.menuHeader}>
                  <span className={styles.menuTitle}>Launch a Capsule</span>
                  <p className={styles.menuSubtitle}>
                    Choose where you want to go next or start something new.
                  </p>
                </div>
                <div className={styles.capsuleList}>{renderCapsuleList()}</div>
                <div className={styles.menuFooter}>
                  {error && capsules.length ? (
                    <span className={styles.menuError}>{error}</span>
                  ) : (
                    <span className={styles.menuSubtitle}>
                      Need another space? Spin up a fresh capsule.
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="gradient"
                    size="sm"
                    onClick={handleCreate}
                  >
                    Create Capsule
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      </SignedIn>
    </>
  );
}
