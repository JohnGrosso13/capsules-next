"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import cards from "@/components/cards.module.css";
import layout from "./settings.module.css";
import styles from "./billing-section.module.css";

type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
};

type WalletResponse = {
  wallet: {
    id: string;
    ownerType: "user" | "capsule";
    ownerId: string;
    displayName: string | null;
  };
  balance: {
    computeGranted: number;
    computeUsed: number;
    storageGranted: number;
    storageUsed: number;
    featureTier: string | null;
    modelTier: string | null;
    periodStart: string | null;
    periodEnd: string | null;
  };
  bypass: boolean;
  subscription: {
    id: string;
    status: string;
    planId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeSubscriptionId: string | null;
  } | null;
};

type PlansResponse = {
  personal: BillingPlan[];
  capsule: BillingPlan[];
};

type BillingPlan = {
  code: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  billingInterval: "monthly" | "yearly";
  includedCompute: number;
  includedStorageBytes: number;
  stripePriceId: string | null;
};

type BillingSectionProps = {
  capsules: CapsuleSummary[];
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return "0 B";
  const gb = value / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = value / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${Math.max(0, Math.floor(value / 1024))} KB`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(value)));
}

async function startCheckout(params: {
  scope: "user" | "capsule";
  capsuleId?: string | null;
}): Promise<string> {
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: params.scope,
      capsuleId: params.capsuleId ?? null,
      successPath: "/settings?tab=billing",
      cancelPath: "/settings?tab=billing",
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { checkoutUrl?: string; error?: string; message?: string }
    | null;
  if (!response.ok || !payload?.checkoutUrl) {
    throw new Error(payload?.message || payload?.error || "Checkout failed");
  }
  return payload.checkoutUrl;
}

export function BillingSection({ capsules }: BillingSectionProps): React.JSX.Element {
  const [wallet, setWallet] = React.useState<WalletResponse | null>(null);
  const [plans, setPlans] = React.useState<PlansResponse | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const [donationCapsuleId, setDonationCapsuleId] = React.useState<string | null>(
    capsules[0]?.id ?? null,
  );
  const [donationMetric, setDonationMetric] = React.useState<"compute" | "storage">("compute");
  const [donationAmount, setDonationAmount] = React.useState<string>("1000");
  const [donationStatus, setDonationStatus] = React.useState<string | null>(null);
  const [isDonating, setIsDonating] = React.useState<boolean>(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [walletRes, plansRes] = await Promise.all([
        fetch("/api/billing/wallet", { credentials: "include" }),
        fetch("/api/billing/plans", { credentials: "include" }),
      ]);
      const walletPayload = (await walletRes.json().catch(() => null)) as WalletResponse | null;
      const plansPayload = (await plansRes.json().catch(() => null)) as PlansResponse | null;
      if (!walletRes.ok || !walletPayload) {
        throw new Error("Failed to load wallet");
      }
      if (!plansRes.ok || !plansPayload) {
        throw new Error("Failed to load plans");
      }
      setWallet(walletPayload);
      setPlans(plansPayload);
    } catch (err) {
      console.error("billing.load.failed", err);
      setError("Unable to load billing data right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePersonalCheckout = React.useCallback(async () => {
    setError(null);
    try {
      const url = await startCheckout({ scope: "user" });
      window.location.href = url;
    } catch (err) {
      console.error("billing.checkout.personal.failed", err);
      setError((err as Error)?.message ?? "Unable to start checkout.");
    }
  }, []);

  const handleCapsuleCheckout = React.useCallback(
    async (capsuleId: string) => {
      setError(null);
      try {
        const url = await startCheckout({ scope: "capsule", capsuleId });
        window.location.href = url;
      } catch (err) {
        console.error("billing.checkout.capsule.failed", err);
        setError((err as Error)?.message ?? "Unable to start capsule upgrade.");
      }
    },
    [],
  );

  const handleDonation = React.useCallback(async () => {
    if (!donationCapsuleId) {
      setDonationStatus("Select a capsule to donate to.");
      return;
    }
    const amount = Math.max(0, Math.floor(Number(donationAmount)));
    if (!amount) {
      setDonationStatus("Enter an amount greater than zero.");
      return;
    }
    setIsDonating(true);
    setDonationStatus(null);
    try {
      const response = await fetch("/api/billing/transfer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toCapsuleId: donationCapsuleId,
          metric: donationMetric,
          amount,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { message?: string })?.message ?? "Transfer failed");
      }
      setDonationStatus("Donation sent!");
      setDonationAmount("0");
      void loadData();
    } catch (err) {
      console.error("billing.donation.failed", err);
      setDonationStatus((err as Error)?.message ?? "Donation failed");
    } finally {
      setIsDonating(false);
    }
  }, [donationAmount, donationCapsuleId, donationMetric, loadData]);

  const personalPlan = plans?.personal?.[0] ?? null;
  const capsulePlan = plans?.capsule?.[0] ?? null;

  const computeRemaining = Math.max(
    0,
    (wallet?.balance.computeGranted ?? 0) - (wallet?.balance.computeUsed ?? 0),
  );
  const storageRemaining = Math.max(
    0,
    (wallet?.balance.storageGranted ?? 0) - (wallet?.balance.storageUsed ?? 0),
  );

  return (
    <article className={`${cards.card} ${layout.card}`}>
      <header className={cards.cardHead}>
        <h3 className={layout.sectionTitle}>Billing & Wallet</h3>
      </header>
      <div className={`${cards.cardBody} ${styles.sectionBody}`}>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.label}>Personal Wallet</p>
                <p className={styles.balanceRow}>
                  Compute: <strong>{formatNumber(wallet?.balance.computeGranted ?? 0)}</strong>{" "}
                  granted / <strong>{formatNumber(computeRemaining)}</strong> remaining
                </p>
                <p className={styles.balanceRow}>
                  Storage: <strong>{formatBytes(wallet?.balance.storageGranted ?? 0)}</strong> /
                  remaining <strong>{formatBytes(storageRemaining)}</strong>
                </p>
                <p className={styles.subtle}>
                  Feature tier: {wallet?.balance.featureTier ?? "default"} · Bypass:
                  {wallet?.bypass ? " enabled" : " off"}
                </p>
                {wallet?.subscription ? (
                  <p className={styles.subtle}>
                    Subscription: {wallet.subscription.status}
                    {wallet.subscription.cancelAtPeriodEnd ? " (cancels at period end)" : ""}
                  </p>
                ) : null}
              </div>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="gradient"
                  size="sm"
                  onClick={() => {
                    void handlePersonalCheckout();
                  }}
                  loading={loading}
                >
                  {personalPlan ? `Upgrade (${personalPlan.name})` : "Upgrade"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void loadData()}>
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.label}>Donate to a Capsule</p>
                <p className={styles.subtle}>
                  Send compute or storage to any capsule you own. Donations move wallet allowances.
                </p>
              </div>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="donation-capsule">
                Capsule
              </label>
              <select
                id="donation-capsule"
                className={styles.select}
                value={donationCapsuleId ?? ""}
                onChange={(event) => setDonationCapsuleId(event.target.value || null)}
              >
                {capsules.map((capsule) => (
                  <option key={capsule.id} value={capsule.id}>
                    {capsule.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Metric</label>
              <div className={styles.toggleRow}>
                <Button
                  type="button"
                  variant={donationMetric === "compute" ? "gradient" : "outline"}
                  size="sm"
                  onClick={() => setDonationMetric("compute")}
                >
                  Compute
                </Button>
                <Button
                  type="button"
                  variant={donationMetric === "storage" ? "gradient" : "outline"}
                  size="sm"
                  onClick={() => setDonationMetric("storage")}
                >
                  Storage
                </Button>
              </div>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="donation-amount">
                Amount
              </label>
              <input
                id="donation-amount"
                className={styles.input}
                type="number"
                min={0}
                step={donationMetric === "storage" ? 1024 * 1024 : 100}
                value={donationAmount}
                onChange={(event) => setDonationAmount(event.target.value)}
              />
              <p className={styles.helper}>
                {donationMetric === "storage"
                  ? "Bytes to donate (use MB/GB values for large transfers)."
                  : "Compute units to donate."}
              </p>
            </div>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void handleDonation();
                }}
                loading={isDonating}
              >
                Send Donation
              </Button>
              {donationStatus ? <p className={styles.status}>{donationStatus}</p> : null}
            </div>
          </div>
        </div>

        <div className={styles.capsuleList}>
          <div className={styles.listHeader}>
            <p className={styles.label}>Your Capsules</p>
            <p className={styles.subtle}>Upgrade a capsule’s tier or move allowances into it.</p>
          </div>
          <div className={styles.listGrid}>
            {capsules.map((capsule) => (
              <div key={capsule.id} className={styles.capsuleCard}>
                <p className={styles.capsuleName}>{capsule.name}</p>
                <p className={styles.capsuleSlug}>{capsule.slug ?? capsule.id}</p>
                <div className={styles.listActions}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handleCapsuleCheckout(capsule.id);
                    }}
                  >
                    {capsulePlan ? `Upgrade (${capsulePlan.name})` : "Upgrade Capsule"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDonationCapsuleId(capsule.id)}
                  >
                    Donate to this
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
