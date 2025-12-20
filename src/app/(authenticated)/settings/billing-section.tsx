"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CaretDown, CaretUp, Check, Info, X } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import cards from "@/components/cards.module.css";
import { BILLING_SETTINGS_PATH } from "@/lib/billing/client-errors";
import {
  buildPlanDisplay,
  formatComputeUnits,
  formatStorageBytes,
  resolveFeatureTier,
  sortPlansForDisplay,
  type BillingPlanSummary,
  type PlanDisplay,
} from "@/lib/billing/plan-display";

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
  personal: BillingPlanSummary[];
  capsule: BillingPlanSummary[];
};

type BillingSectionProps = {
  capsules: CapsuleSummary[];
};

type UsageStat = {
  total: number;
  used: number;
  remaining: number;
  percentUsed: number;
  nearlyOut: boolean;
};

type PlanTierId = "starter" | "plus" | "pro" | "studio";

type PlanTierMeta = {
  id: PlanTierId;
  label: string;
  code: string;
};

type PlanDetailsRow = {
  id: string;
  label: string;
  description: string;
  tiers: PlanTierId[];
};

type PlanSummary = {
  id: PlanTierId;
  title: string;
  bullets: string[];
};

const PLAN_TIERS: PlanTierMeta[] = [
  { id: "starter", label: "Starter", code: "user_free" },
  { id: "plus", label: "Plus", code: "user_creator" },
  { id: "pro", label: "Pro", code: "user_pro" },
  { id: "studio", label: "Studio", code: "user_studio" },
];

const PLAN_SUMMARIES: PlanSummary[] = [
  {
    id: "starter",
    title: "Starter · Free",
    bullets: [
      "Join Capsules, explore feeds, and try your assistant.",
      "Run your first ladders, tournaments, and posts with AI help.",
      "Perfect for vibing, not yet for going live every week.",
    ],
  },
  {
    id: "plus",
    title: "Plus · Everyday creator",
    bullets: [
      "Show up consistently with better posts, images, and PDFs.",
      "Go Live with chat and keep 1–2 Capsules feeling on-brand.",
      "A good fit for solo creators and small crews.",
    ],
  },
  {
    id: "pro",
    title: "Pro · Captain",
    bullets: [
      "Stream weekly, auto-clip sessions, and publish recap posts.",
      "Run ladders, tournaments, and drops across up to 3 Capsules.",
      "Great for teams and communities that expect regular output.",
    ],
  },
  {
    id: "studio",
    title: "Studio · Legend",
    bullets: [
      "Treat Capsules like your production studio, not a side project.",
      "High-volume image gen, bulk decks, and deep automations.",
      "Best for orgs running multiple Capsules, events, and drops.",
    ],
  },
];

const PLAN_DETAILS_ROWS: PlanDetailsRow[] = [
  {
    id: "ai_compose",
    label: "AI Composer & Personal Coach",
    description: "Chat with AI to brainstorm ideas, captions, and content plans.",
    tiers: ["starter", "plus", "pro", "studio"],
  },
  {
    id: "image_gen",
    label: "Image generation",
    description: "Create visuals for posts, banners, and announcements.",
    tiers: ["starter", "plus", "pro", "studio"],
  },
  {
    id: "image_quality",
    label: "Higher image quality models",
    description: "Medium + high quality options for sharper outputs.",
    tiers: ["plus", "pro", "studio"],
  },
  {
    id: "pdf_ppt",
    label: "PDF & PPT exports",
    description: "Turn drafts into shareable decks, kits, and one-pagers.",
    tiers: ["plus", "pro", "studio"],
  },
  {
    id: "go_live",
    label: "Go Live with chat",
    description: "Host streams inside your Capsule with live chat.",
    tiers: ["plus", "pro", "studio"],
  },
  {
    id: "stream_automation",
    label: "Stream Studio automations",
    description: "Auto recaps, clip suggestions, titles, and thumbnails from streams.",
    tiers: ["pro", "studio"],
  },
  {
    id: "capsule_ownership",
    label: "Own Capsules",
    description: "Create and run your own Capsules home base.",
    tiers: ["starter", "plus", "pro", "studio"],
  },
  {
    id: "power_drop",
    label: "Monthly Capsule Power drop",
    description: "Extra Capsule Power to fund automations and community upgrades.",
    tiers: ["studio"],
  },
];

function resolveTierIdFromCode(code: string): PlanTierId | null {
  const match = PLAN_TIERS.find((entry) => entry.code === code);
  return match?.id ?? null;
}

function buildUsageStat(total: number, used: number): UsageStat {
  const safeTotal = Math.max(0, total);
  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, safeTotal - safeUsed);
  const percentUsed = safeTotal > 0 ? Math.min(100, Math.round((safeUsed / safeTotal) * 100)) : 0;
  return {
    total: safeTotal,
    used: safeUsed,
    remaining,
    percentUsed,
    nearlyOut: percentUsed >= 85 && safeTotal > 0,
  };
}

function formatDateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    date,
  );
}

function resolvePlanForWallet(
  plans: BillingPlanSummary[],
  wallet: WalletResponse | null,
): BillingPlanSummary | null {
  if (!plans.length) return null;
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  if (wallet?.subscription?.planId) {
    const match = planById.get(wallet.subscription.planId);
    if (match) return match;
  }
  const walletTier = wallet?.balance.featureTier?.toLowerCase();
  if (walletTier) {
    const tierMatch = plans.find(
      (plan) => resolveFeatureTier(plan)?.toLowerCase() === walletTier,
    );
    if (tierMatch) return tierMatch;
  }
  const freePlan = plans.find((plan) => plan.code === "user_free");
  if (freePlan) return freePlan;
  return plans[0] ?? null;
}

function findNextPlan(planDisplays: PlanDisplay[], currentPlanId: string | null): PlanDisplay | null {
  if (!planDisplays.length) return null;
  const currentIndex = currentPlanId
    ? planDisplays.findIndex((entry) => entry.plan.id === currentPlanId)
    : -1;
  if (currentIndex >= 0 && currentIndex < planDisplays.length - 1) {
    return planDisplays[currentIndex + 1] ?? null;
  }
  const recommended = planDisplays.find(
    (entry) => entry.recommended && entry.plan.id !== currentPlanId,
  );
  if (recommended) return recommended;
  return planDisplays.find((entry) => entry.plan.id !== currentPlanId) ?? null;
}

function resolveRenewalLabel(wallet: WalletResponse | null, currentPlan: PlanDisplay | null): string {
  const subscriptionRenewal =
    wallet?.subscription?.currentPeriodEnd && formatDateLabel(wallet.subscription.currentPeriodEnd);
  if (subscriptionRenewal) {
    const cancelSuffix = wallet?.subscription?.cancelAtPeriodEnd ? " (cancels at period end)" : "";
    return `Renews ${subscriptionRenewal}${cancelSuffix}`;
  }

  const periodStart = wallet?.balance.periodStart ? formatDateLabel(wallet.balance.periodStart) : null;
  const periodEnd = wallet?.balance.periodEnd ? formatDateLabel(wallet.balance.periodEnd) : null;
  if (periodStart && periodEnd) return `Current period ${periodStart}–${periodEnd}`;
  if (periodEnd) return `Renews ${periodEnd}`;

  if (currentPlan) {
    return currentPlan.plan.billingInterval === "yearly" ? "Yearly billing" : "Monthly billing";
  }
  return "Billing active";
}

function PlanDetailsOverlay({
  activePlanCode,
  onClose,
}: {
  activePlanCode: string;
  onClose: () => void;
}): React.ReactPortal | null {
  const [mounted, setMounted] = React.useState(false);
  const activeTierId = resolveTierIdFromCode(activePlanCode);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const { body } = document;
    const originalOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      body.style.overflow = originalOverflow;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className={styles.planDetailsOverlay} role="dialog" aria-modal="true">
      <div className={styles.planDetailsDrawer}>
        <header className={styles.planDetailsDrawerHeader}>
          <div className={styles.planDetailsDrawerTitleGroup}>
            <h4 className={styles.planDetailsDrawerTitle}>Plan details &amp; comparison</h4>
            <p className={styles.planDetailsDrawerSubtitle}>
              See what Starter, Plus, Pro, and Studio include before you commit. You can always change
              plans later.
            </p>
          </div>
          <button
            type="button"
            className={styles.planDetailsClose}
            onClick={onClose}
            aria-label="Close plan details"
          >
            <X size={16} weight="bold" />
          </button>
        </header>

        <div className={styles.planDetailsSummaryGrid}>
          {PLAN_SUMMARIES.map((summary) => {
            const isActive = summary.id === activeTierId;
            return (
              <section
                key={summary.id}
                className={`${styles.planDetailsSummaryCard}${
                  isActive ? ` ${styles.planDetailsSummaryCardActive}` : ""
                }`}
                aria-label={`${summary.title} summary`}
              >
                <h5 className={styles.planDetailsSummaryTitle}>
                  {summary.title}
                  {isActive ? <span className={styles.planDetailsSummaryBadge}>Your selection</span> : null}
                </h5>
                <ul className={styles.planDetailsSummaryList}>
                  {summary.bullets.map((bullet) => (
                    <li key={bullet} className={styles.planDetailsSummaryItem}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className={styles.planDetails}>
          <div className={styles.planDetailsHeader}>
            <div>
              <p className={styles.planDetailsTitle}>Detailed capabilities</p>
              <p className={styles.planDetailsHint}>
                A checkmark means that tier includes the capability for this billing period.
              </p>
            </div>
          </div>
          <div className={styles.planDetailsMatrixScroll}>
            <div className={styles.planDetailsMatrix} role="grid" aria-label="Plan feature comparison">
              <div className={styles.planDetailsMatrixHeaderRow}>
                <div className={styles.planDetailsFeatureCol} />
                {PLAN_TIERS.map((tier) => {
                  const isActive = tier.id === activeTierId;
                  return (
                    <div
                      key={tier.id}
                      className={`${styles.planDetailsTierHeader}${
                        isActive ? ` ${styles.planDetailsTierHeaderActive}` : ""
                      }`}
                      role="columnheader"
                      aria-label={tier.label}
                    >
                      <span className={styles.planDetailsTierLabel}>{tier.label}</span>
                      {isActive ? <span className={styles.planDetailsTierTag}>Selected</span> : null}
                    </div>
                  );
                })}
              </div>
              {PLAN_DETAILS_ROWS.map((row) => (
                <div key={row.id} className={styles.planDetailsRow} role="row">
                  <div className={styles.planDetailsFeatureCell}>
                    <div className={styles.planDetailsFeatureLabel}>{row.label}</div>
                    <div className={styles.planDetailsFeatureDescription}>{row.description}</div>
                  </div>
                  {PLAN_TIERS.map((tier) => {
                    const granted = row.tiers.includes(tier.id);
                    const isActiveTier = tier.id === activeTierId;
                    return (
                      <div
                        key={`${row.id}-${tier.id}`}
                        className={styles.planDetailsIconCell}
                        role="gridcell"
                        aria-label={
                          granted
                            ? `${tier.label} includes ${row.label}`
                            : `${tier.label} does not include ${row.label}`
                        }
                        aria-hidden={!granted}
                      >
                        {granted ? (
                          <span
                            className={styles.planDetailsIcon}
                            data-active={isActiveTier ? "true" : undefined}
                          >
                            <Check size={12} weight="bold" />
                          </span>
                        ) : (
                          <span className={styles.planDetailsIcon} aria-hidden="true" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CreditUsageMeter({ percentRemaining }: { percentRemaining: number }): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(percentRemaining)));
  const isWarning = clamped <= 15;

  return (
    <div className={styles.usageRow} data-warning={isWarning ? "true" : undefined}>
      <div className={styles.usageMeta}>
        <p className={styles.label}>Credits remaining</p>
        <p className={styles.balanceRow}>
          <span>{clamped}% left this period</span>
        </p>
      </div>
      <div
        className={styles.usageBar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <div className={styles.usageBarFill} style={{ width: `${clamped}%` }} />
      </div>
      <p className={styles.subtle}>Approximate share of your available credits for this billing period.</p>
    </div>
  );
}

async function startCheckout(params: {
  scope: "user" | "capsule";
  capsuleId?: string | null;
  planCode?: string | null;
}): Promise<string> {
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: params.scope,
      capsuleId: params.capsuleId ?? null,
      planCode: params.planCode ?? null,
      successPath: BILLING_SETTINGS_PATH,
      cancelPath: BILLING_SETTINGS_PATH,
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
  const [showCreditUsage, setShowCreditUsage] = React.useState<boolean>(false);

  const [donationCapsuleId, setDonationCapsuleId] = React.useState<string | null>(
    capsules[0]?.id ?? null,
  );
  const [donationMetric, setDonationMetric] = React.useState<"compute" | "storage">("compute");
  const [donationAmount, setDonationAmount] = React.useState<string>("1000");
  const [donationStatus, setDonationStatus] = React.useState<string | null>(null);
  const [isDonating, setIsDonating] = React.useState<boolean>(false);
  const [detailsPlanCode, setDetailsPlanCode] = React.useState<string | null>(null);

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

  const handlePersonalCheckout = React.useCallback(async (planCode?: string | null) => {
    setError(null);
    try {
      const url = await startCheckout({ scope: "user", planCode: planCode ?? null });
      window.location.href = url;
    } catch (err) {
      console.error("billing.checkout.personal.failed", err);
      setError((err as Error)?.message ?? "Unable to start checkout.");
    }
  }, []);

  const handleCapsuleCheckout = React.useCallback(
    async (capsuleId: string, planCode?: string | null) => {
      setError(null);
      try {
        const url = await startCheckout({ scope: "capsule", capsuleId, planCode: planCode ?? null });
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
      setDonationStatus("Transfer complete. Credits moved.");
      setDonationAmount("0");
      void loadData();
    } catch (err) {
      console.error("billing.donation.failed", err);
      setDonationStatus((err as Error)?.message ?? "Transfer failed");
    } finally {
      setIsDonating(false);
    }
  }, [donationAmount, donationCapsuleId, donationMetric, loadData]);

  const personalPlansRaw = React.useMemo(() => plans?.personal ?? [], [plans]);
  const personalPlans = React.useMemo(
    () => personalPlansRaw.filter((plan) => plan.code !== "personal_default"),
    [personalPlansRaw],
  );
  const capsulePlan = plans?.capsule?.[0] ?? null;
  const planDisplays = React.useMemo(() => sortPlansForDisplay(personalPlans), [personalPlans]);
  const currentPlanRaw = React.useMemo(
    () => resolvePlanForWallet(personalPlansRaw, wallet),
    [personalPlansRaw, wallet],
  );
  const currentPlanDisplay = React.useMemo(
    () =>
      currentPlanRaw
        ? planDisplays.find((entry) => entry.plan.id === currentPlanRaw.id) ??
          buildPlanDisplay(currentPlanRaw)
        : null,
    [currentPlanRaw, planDisplays],
  );
  const nextPlan = React.useMemo(
    () => findNextPlan(planDisplays, currentPlanRaw?.id ?? null),
    [planDisplays, currentPlanRaw],
  );

  const computeUsage = buildUsageStat(
    wallet?.balance.computeGranted ?? 0,
    wallet?.balance.computeUsed ?? 0,
  );
  const storageUsage = buildUsageStat(
    wallet?.balance.storageGranted ?? 0,
    wallet?.balance.storageUsed ?? 0,
  );
  const rawComputeRemainingPercent =
    computeUsage.total > 0 ? Math.round((computeUsage.remaining / computeUsage.total) * 100) : 0;
  const rawStorageRemainingPercent =
    storageUsage.total > 0 ? Math.round((storageUsage.remaining / storageUsage.total) * 100) : 0;
  const creditsRemainingPercent = Math.max(
    0,
    Math.min(100, Math.min(rawComputeRemainingPercent, rawStorageRemainingPercent)),
  );
  const renewalLabel = resolveRenewalLabel(wallet, currentPlanDisplay);

  const bypass = wallet?.bypass ?? false;
  const dataReady = Boolean(wallet && plans);

  return (
    <article className={`${cards.card} ${layout.card}`}>
      <header className={cards.cardHead}>
        <h3 className={layout.sectionTitle}>Billing &amp; usage</h3>
      </header>
      <div className={`${cards.cardBody} ${styles.sectionBody}`}>
        {error ? <p className={styles.error}>{error}</p> : null}
        {!dataReady ? (
          <p className={styles.helper}>Loading billing details...</p>
        ) : (
          <>
            <div className={styles.panel}>
              <div className={styles.planHeaderRow}>
                <div>
                  <p className={styles.label}>Current plan</p>
                  <div className={styles.planNameRow}>
                    <p className={styles.planName}>{currentPlanDisplay?.plan.name ?? "Free"}</p>
                    {currentPlanDisplay?.badge ? (
                      <span className={styles.planBadge}>{currentPlanDisplay.badge}</span>
                    ) : null}
                    {bypass ? <span className={styles.planBadge}>Dev credits</span> : null}
                    {currentPlanDisplay?.plan.code === "user_free" && !bypass ? (
                      <span className={styles.planBadge}>Free</span>
                    ) : null}
                  </div>
                  <p className={styles.subtle}>
                    {currentPlanDisplay?.priceLabel ?? "Free"} |{" "}
                    {currentPlanDisplay
                      ? currentPlanDisplay.plan.billingInterval === "yearly"
                        ? "Yearly"
                        : "Monthly"
                      : "Monthly"}
                  </p>
                  <p className={styles.subtle}>{renewalLabel}</p>
                  {currentPlanDisplay?.featureTier ? (
                    <p className={styles.subtle}>
                      Feature tier: {currentPlanDisplay.featureTier.toUpperCase()}
                    </p>
                  ) : null}
                  {bypass ? (
                    <p className={styles.devNote}>
                      Development credits are enabled. Usage is topped up for testing, and upgrades are
                      optional.
                    </p>
                  ) : null}
                  {computeUsage.nearlyOut || storageUsage.nearlyOut ? (
                    <p className={styles.warning}>
                      You are nearing your included limits. Consider upgrading to avoid interruptions.
                    </p>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="gradient"
                    size="sm"
                    onClick={() => {
                      void handlePersonalCheckout(nextPlan?.plan.code ?? currentPlanDisplay?.plan.code);
                    }}
                    loading={loading}
                  >
                    {currentPlanDisplay && nextPlan
                      ? `Upgrade to ${nextPlan.plan.name}`
                      : "Manage plan"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadData()}
                    loading={loading}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
              <div className={styles.creditUsageSection}>
                <button
                  type="button"
                  className={styles.creditToggleButton}
                  onClick={() => setShowCreditUsage((prev) => !prev)}
                  aria-expanded={showCreditUsage ? "true" : "false"}
                  aria-controls="billing-credit-usage"
                >
                  <span>Show credit usage</span>
                  <span className={styles.creditToggleIcon} aria-hidden="true">
                    {showCreditUsage ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
                  </span>
                </button>
                {showCreditUsage ? (
                  <div id="billing-credit-usage" className={styles.usageGrid}>
                    <CreditUsageMeter percentRemaining={bypass ? 100 : creditsRemainingPercent} />
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.tierIntro}>
              <p className={styles.tierEyebrow}>Personal plans</p>
              <p className={styles.tierTitle}>Pick how hard Capsules should work for you.</p>
              <p className={styles.tierSubtitle}>
                Starter lets you vibe for free; Plus, Pro, and Studio layer in higher-quality AI models,
                streaming, and automation without exposing raw credit counts.
              </p>
            </div>

            <div className={styles.tiersGrid} role="list" aria-label="Subscription plans">
              {planDisplays.length ? (
                planDisplays.map((display) => {
                  const isCurrent = currentPlanDisplay?.plan.id === display.plan.id;
                  return (
                    <section
                      key={display.plan.id}
                      className={`${styles.tierCard}${
                        display.recommended ? ` ${styles.tierCardFeatured}` : ""
                      }${isCurrent ? ` ${styles.tierCardCurrent}` : ""}`}
                      role="listitem"
                      aria-label={`${display.plan.name} plan`}
                    >
                      <div className={styles.tierHeader}>
                        <div className={styles.planNameRow}>
                          <p className={styles.tierName}>{display.plan.name}</p>
                          {display.badge ? <span className={styles.planBadge}>{display.badge}</span> : null}
                          {isCurrent ? <span className={styles.planBadge}>Current</span> : null}
                        </div>
                        <p className={styles.tierPrice}>{display.priceLabel}</p>
                        <p className={styles.tierTagline}>{display.tagline}</p>
                      </div>
                      <ul className={styles.tierFeatures}>
                        {display.allowances.map((feature) => (
                          <li key={`${display.plan.id}-${feature}`} className={styles.tierFeatureItem}>
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <div className={styles.tierFooter}>
                        <Button
                          type="button"
                          variant={display.recommended ? "gradient" : "outline"}
                          size="sm"
                          onClick={() => {
                            if (isCurrent) return;
                            void handlePersonalCheckout(display.plan.code);
                          }}
                          disabled={isCurrent}
                          loading={loading}
                        >
                          {isCurrent ? "Current plan" : `Choose ${display.plan.name}`}
                        </Button>
                        <button
                          type="button"
                          className={styles.tierDetailsButton}
                          onClick={() =>
                            setDetailsPlanCode((prev) =>
                              prev === display.plan.code ? null : display.plan.code,
                            )
                          }
                          aria-expanded={detailsPlanCode === display.plan.code ? "true" : "false"}
                        >
                          <Info size={14} weight="bold" />
                          <span>Details</span>
                        </button>
                      </div>
                    </section>
                  );
                })
              ) : (
                <p className={styles.helper}>No plans are configured yet.</p>
              )}
            </div>

            <div className={styles.grid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.label}>Send credits to a capsule</p>
                    <p className={styles.subtle}>
                      Move compute or storage allowances between your wallet and a capsule you own.
                      This transfers credits, not money.
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
                    Transfers use your existing credits (compute units or storage bytes). No payment is
                    charged.
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
                    Send credits
                  </Button>
                  {donationStatus ? <p className={styles.status}>{donationStatus}</p> : null}
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.label}>Capsule upgrades</p>
                    <p className={styles.subtle}>
                      Give a capsule its own subscription for dedicated compute and storage.
                      {capsulePlan
                        ? ` Includes ${formatComputeUnits(
                            capsulePlan.includedCompute,
                          )} and ${formatStorageBytes(capsulePlan.includedStorageBytes)}.`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className={styles.capsuleList}>
                  <div className={styles.listHeader}>
                    <p className={styles.subtle}>Your capsules</p>
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
                              void handleCapsuleCheckout(capsule.id, capsulePlan?.code ?? null);
                            }}
                            loading={loading}
                          >
                            {capsulePlan ? `Upgrade (${capsulePlan.name})` : "Upgrade capsule"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDonationCapsuleId(capsule.id)}
                          >
                            Send credits here
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {detailsPlanCode ? (
              <PlanDetailsOverlay
                activePlanCode={detailsPlanCode}
                onClose={() => setDetailsPlanCode(null)}
              />
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
