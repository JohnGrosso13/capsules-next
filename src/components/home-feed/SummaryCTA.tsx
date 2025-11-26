"use client";

import * as React from "react";
import { Notebook } from "@phosphor-icons/react/dist/ssr";

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
        <Notebook weight="duotone" className={styles.summaryCtaIcon} />
        <p className={styles.summaryCtaCopy}>Let Assistant surface quick highlights from your friends.</p>
      </div>
      <button
        type="button"
        className={styles.summaryCtaButton}
        onClick={onSummarize}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Summarizing..." : "Highlights"}
      </button>
    </section>
  );
}
