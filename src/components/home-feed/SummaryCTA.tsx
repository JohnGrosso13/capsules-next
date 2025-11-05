"use client";

import * as React from "react";
import { Sparkle } from "@phosphor-icons/react/dist/ssr";

import styles from "@/components/home-feed.module.css";

type SummaryCTAProps = {
  pending: boolean;
  hasPosts: boolean;
  onSummarize: () => void;
};

export function SummaryCTA({ pending, hasPosts, onSummarize }: SummaryCTAProps) {
  if (!hasPosts) return null;

  return (
    <section className={styles.summaryCta} aria-live="polite">
      <div className={styles.summaryCtaContent}>
        <Sparkle weight="duotone" className={styles.summaryCtaIcon} />
        <div>
          <h2>Too busy to scroll?</h2>
          <p>Let Capsules AI recap the latest activity from your friends.</p>
        </div>
      </div>
      <button
        type="button"
        className={styles.summaryCtaButton}
        onClick={onSummarize}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Summarizing…" : "Summarize this feed"}
      </button>
    </section>
  );
}
