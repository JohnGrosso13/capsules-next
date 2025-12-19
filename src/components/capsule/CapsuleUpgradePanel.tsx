"use client";

import * as React from "react";
import {
  Coins,
  Gift,
  Lightning,
  TrendUp,
  X,
} from "@phosphor-icons/react/dist/ssr";
import styles from "./CapsuleUpgradePanel.module.css";

export type CapsuleUpgradePanelProps = {
  open: boolean;
  capsuleName?: string | null;
  onClose: () => void;
  onAddPower?: (amount: number) => Promise<void> | void;
  onSendPass?: (amount: number) => Promise<void> | void;
  submitting?: boolean;
  statusText?: string | null;
  serverError?: string | null;
};

const QUICK_PASS_AMOUNTS = [5, 10, 25];
const QUICK_POWER_AMOUNTS = [5, 20, 50];

export function CapsuleUpgradePanel({
  open,
  capsuleName,
  onClose,
  onAddPower,
  onSendPass,
  submitting = false,
  statusText,
  serverError,
}: CapsuleUpgradePanelProps) {
  const [customAmount, setCustomAmount] = React.useState("10");
  const [powerAmount, setPowerAmount] = React.useState("10");
  const [error, setError] = React.useState<string | null>(null);
  const [lastAction, setLastAction] = React.useState<"power" | "pass" | null>(null);

  const handleAddPower = React.useCallback(() => {
    if (submitting) return;
    const parsed = Number(powerAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid power amount above $0.");
      return;
    }
    setError(null);
    setLastAction("power");
    onAddPower?.(parsed);
  }, [onAddPower, powerAmount, submitting]);

  const handleSendPass = React.useCallback(
    (amount: number) => {
      if (submitting) return;
      setLastAction("pass");
      onSendPass?.(amount);
    },
    [onSendPass, submitting],
  );

  const handleQuickPass = React.useCallback(
    (amount: number) => {
      if (submitting) return;
      setCustomAmount(String(amount));
      setError(null);
      // Quick amounts now just preset the value;
      // sending the pass is done via the main button for symmetry.
    },
    [submitting],
  );

  const handleCustomSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      const parsed = Number(customAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Enter a valid amount above $0.");
        return;
      }
      setError(null);
      handleSendPass(parsed);
    },
    [customAmount, handleSendPass, submitting],
  );

  if (!open) return null;

  const nameLabel = capsuleName ?? "this capsule";

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Upgrade capsule">
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h3 className={styles.title}>Upgrade {nameLabel}</h3>
            <p className={styles.subtitle}>
              Support this capsule&apos;s shared infrastructure with Capsule Power, or get a
              Capsule Pass that rewards the founder and unlocks exclusive perks for passholders.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close upgrade panel">
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className={styles.grid}>
          <section className={styles.card} aria-label="Capsule Power">
            <div className={styles.cardHeader}>
              <h4 className={styles.cardTitle}>
                <Lightning size={18} weight="bold" />
                Capsule Power
              </h4>
            </div>
            <ul className={styles.list}>
              <li className={styles.listItem}>
                <TrendUp size={16} weight="bold" />
                Scale live and VOD streaming, storage, and delivery.
              </li>
              <li className={styles.listItem}>
                <Lightning size={16} weight="bold" />
                Boost shared AI quality, context, and automations.
              </li>
              <li className={styles.listItem}>
                <Coins size={16} weight="bold" />
                Funds stay in the capsule wallet for future shared costs.
              </li>
            </ul>
            <div className={styles.quickGrid} aria-label="Capsule Power amounts">
              {QUICK_POWER_AMOUNTS.map((amount) => (
                <button
                  key={`power-${amount}`}
                  type="button"
                  className={`${styles.quickButton} ${
                    Number(powerAmount) === amount ? styles.quickButtonActive : ""
                  }`}
                  onClick={() => setPowerAmount(String(amount))}
                  disabled={submitting}
                >
                  ${amount}
                </button>
              ))}
            </div>
            <div className={styles.customRow}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="capsule-power-custom">
                  Custom amount
                </label>
                <div className={styles.currencyInput}>
                  <span>$</span>
                  <input
                    id="capsule-power-custom"
                    inputMode="decimal"
                    pattern="\\d*(\\.\\d{0,2})?"
                    value={powerAmount}
                    onChange={(event) => setPowerAmount(event.target.value)}
                    aria-label="Custom Capsule Power amount in dollars"
                    disabled={submitting}
                  />
                </div>
                {lastAction === "power" && statusText ? (
                  <p className={styles.helper} aria-live="polite">
                    {statusText}
                  </p>
                ) : null}
                {lastAction === "power" && serverError ? (
                  <p className={styles.error} aria-live="polite">
                    {serverError}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleAddPower}
                disabled={submitting}
              >
                Add to Capsule Power
              </button>
            </div>
          </section>

          <section className={styles.card} aria-label="Capsule Pass">
            <div className={styles.cardHeader}>
              <h4 className={styles.cardTitle}>
                <Gift size={18} weight="bold" />
                Capsule Pass
              </h4>
            </div>
            <ul className={styles.list}>
              <li className={styles.listItem}>
                <Gift size={16} weight="bold" />
                Send a supporter pass directly to the founder.
              </li>
              <li className={styles.listItem}>
                <TrendUp size={16} weight="bold" />
                Choose a quick amount or set a custom one.
              </li>
              <li className={styles.listItem}>
                <Coins size={16} weight="bold" />
                Passes are separate from the shared Capsule Power wallet.
              </li>
            </ul>
            <div className={styles.quickGrid} aria-label="Quick pass amounts">
              {QUICK_PASS_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={`${styles.quickButton} ${
                    Number(customAmount) === amount ? styles.quickButtonActive : ""
                  }`}
                  onClick={() => handleQuickPass(amount)}
                  disabled={submitting}
                >
                  ${amount}
                </button>
              ))}
            </div>
            <form className={styles.customRow} onSubmit={handleCustomSubmit}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel} htmlFor="capsule-pass-custom">
                  Custom amount
                </label>
                <div className={styles.currencyInput}>
                  <span>$</span>
                  <input
                    id="capsule-pass-custom"
                    inputMode="decimal"
                    pattern="\\d*(\\.\\d{0,2})?"
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value)}
                    aria-label="Custom Capsule Pass amount in dollars"
                    disabled={submitting}
                  />
                </div>
                {error ? <p className={styles.error}>{error}</p> : null}
                {lastAction === "pass" && !error && serverError ? (
                  <p className={styles.error} aria-live="polite">
                    {serverError}
                  </p>
                ) : null}
                {lastAction === "pass" && statusText ? (
                  <p className={styles.helper} aria-live="polite">
                    {statusText}
                  </p>
                ) : null}
              </div>
              <button type="submit" className={styles.secondaryButton} disabled={submitting}>
                Send Capsule Pass
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
