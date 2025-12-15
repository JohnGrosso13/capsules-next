"use client";

import * as React from "react";

import styles from "./mystore.page.module.css";

type StoreSetupProps = {
  capsuleId: string | null;
  ordersHref: string;
};

export function StoreSetup({ capsuleId, ordersHref }: StoreSetupProps) {
  const [connectError, setConnectError] = React.useState<string | null>(null);

  const handleConnect = React.useCallback(() => {
    if (!capsuleId) return;
    setConnectError(null);
    void fetch("/api/store/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capsuleId }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            (payload && typeof (payload as { message?: string }).message === "string" && (payload as { message?: string }).message) ||
            "Unable to start Stripe onboarding.";
          throw new Error(message);
        }
        const url = (payload as { onboardingUrl?: string }).onboardingUrl;
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unable to start Stripe onboarding.";
        setConnectError(message);
      });
  }, [capsuleId]);

  return (
    <section className={styles.card} aria-label="Store setup">
      <header className={styles.cardHeaderRow}>
        <div>
          <h2 className={styles.cardTitle}>Store setup</h2>
          <p className={styles.cardSubtitle}>Connect payouts before you launch.</p>
        </div>
        <div className={styles.inlineActions}>
          <a
            className={styles.cardLink}
            href={ordersHref}
            aria-disabled={!capsuleId}
            data-disabled={!capsuleId ? "true" : undefined}
          >
            View seller orders
          </a>
        </div>
      </header>
      {connectError ? <p className={styles.connectError}>{connectError}</p> : null}
      <div className={styles.setupActions}>
        <button
          type="button"
          className={styles.ctaPrimary}
          onClick={handleConnect}
          aria-disabled={!capsuleId}
          data-disabled={!capsuleId ? "true" : undefined}
        >
          Connect payouts with Stripe
        </button>
      </div>
    </section>
  );
}

export default StoreSetup;
