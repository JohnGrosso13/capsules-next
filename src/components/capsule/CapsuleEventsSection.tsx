"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";
import { formatRelativeTime } from "@/lib/composer/sidebar-types";
import styles from "./CapsuleEventsSection.module.css";

type CapsuleEventsSectionProps = {
  capsuleId: string | null;
  ladders: CapsuleLadderSummary[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

function formatStatus(status: CapsuleLadderSummary["status"]): string {
  if (status === "active") return "Active";
  if (status === "archived") return "Archived";
  return "Draft";
}

type StatusTone = "success" | "neutral" | "warn";

function statusTone(status: CapsuleLadderSummary["status"]): StatusTone {
  if (status === "active") return "success";
  if (status === "archived") return "warn";
  return "neutral";
}

export function CapsuleEventsSection({
  capsuleId,
  ladders,
  loading,
  error,
  onRetry,
}: CapsuleEventsSectionProps) {
  if (loading) {
    return (
      <div className={styles.stateCard}>
        <div className={styles.stateHeading}>Loading ladders...</div>
        <div className={styles.skeletonRow} />
        <div className={styles.skeletonRow} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.stateCard}>
        <div className={styles.stateHeading}>{"We couldn't load ladders."}</div>
        <p className={styles.stateBody}>{error}</p>
        <Button type="button" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!ladders.length) {
    const href = capsuleId ? `/create/ladders?capsuleId=${capsuleId}` : "/create/ladders";
    return (
      <div className={styles.stateCard}>
        <div className={styles.stateHeading}>No ladders yet</div>
        <p className={styles.stateBody}>
          {"Launch an AI-powered ladder to activate your community. We'll surface it here once it's published."}
        </p>
        <Button asChild>
          <Link href={href}>Create a ladder</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.listWrap}>
      {ladders.map((ladder) => {
        const updatedLabel = ladder.updatedAt
          ? formatRelativeTime(ladder.updatedAt)
          : formatRelativeTime(ladder.createdAt);
        const manageHref = `/create/ladders?capsuleId=${ladder.capsuleId ?? capsuleId ?? ""}`;
        return (
          <article key={ladder.id} className={styles.ladderCard}>
            <header className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.cardTitle}>{ladder.name}</h3>
                <span className={`${styles.statusBadge} ${styles[`tone${statusTone(ladder.status)}`]}`}>
                  {formatStatus(ladder.status)}
                </span>
              </div>
              <div className={styles.cardMeta}>
                <span>Visibility: {ladder.visibility === "capsule" ? "Capsule" : ladder.visibility}</span>
                <span>Updated {updatedLabel}</span>
              </div>
            </header>
            {ladder.summary ? <p className={styles.cardSummary}>{ladder.summary}</p> : null}
            <footer className={styles.cardFooter}>
              <Button asChild variant="secondary" size="sm">
                <Link href={manageHref}>Manage ladder</Link>
              </Button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

