"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";
import { formatRelativeTime } from "@/lib/composer/sidebar-types";
import styles from "./CapsuleEventsSection.module.css";

type CapsuleEventsSectionProps = {
  capsuleId: string | null;
  ladders: CapsuleLadderSummary[];
  tournaments: CapsuleLadderSummary[];
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
  tournaments,
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

  if (!ladders.length && !tournaments.length) {
    const baseHref = "/create/ladders";
    const ladderHref = capsuleId ? `${baseHref}?capsuleId=${capsuleId}` : baseHref;
    const tournamentHref = capsuleId
      ? `${baseHref}?capsuleId=${capsuleId}&variant=tournament`
      : `${baseHref}?variant=tournament`;
    return (
      <div className={styles.stateCard}>
        <div className={styles.stateHeading}>No ladders or tournaments yet</div>
        <p className={styles.stateBody}>
          {
            "Spin up a ladder or bracketed tournament with Capsule AI. We'll surface active events here so members can join and follow along."
          }
        </p>
        <div className={styles.emptyActions}>
          <Button asChild>
            <Link href={ladderHref}>Create a ladder</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={tournamentHref}>Launch a tournament</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.listWrap}>
      {ladders.length ? (
        <section className={styles.sectionGroup}>
          <div className={styles.sectionHeading}>
            Ladders <span>{ladders.length}</span>
          </div>
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
        </section>
      ) : null}

      {tournaments.length ? (
        <section className={styles.sectionGroup}>
          <div className={styles.sectionHeading}>
            Tournaments <span>{tournaments.length}</span>
          </div>
          {tournaments.map((tournament) => {
            const updatedLabel = tournament.updatedAt
              ? formatRelativeTime(tournament.updatedAt)
              : formatRelativeTime(tournament.createdAt);
            const manageHref = `/create/ladders?capsuleId=${tournament.capsuleId ?? capsuleId ?? ""}&variant=tournament&focus=${tournament.id}`;
            const tournamentMeta =
              tournament.meta && typeof tournament.meta === "object"
                ? (tournament.meta as Record<string, unknown>)
                : {};
            const formatRaw =
              typeof tournamentMeta.formatLabel === "string"
                ? tournamentMeta.formatLabel
                : typeof tournamentMeta.format === "string"
                  ? tournamentMeta.format
                  : null;
            const formatLabel = formatRaw ? formatRaw.replace(/_/g, " ") : "Bracket";
            const scheduleInfo =
              tournamentMeta.schedule && typeof tournamentMeta.schedule === "object"
                ? (tournamentMeta.schedule as Record<string, unknown>)
                : null;
            const startsAt =
              typeof tournamentMeta.startsAt === "string"
                ? tournamentMeta.startsAt
                : scheduleInfo && typeof scheduleInfo["start"] === "string"
                  ? (scheduleInfo["start"] as string)
                  : null;
            return (
              <article key={tournament.id} className={styles.ladderCard}>
                <header className={styles.cardHeader}>
                  <div className={styles.cardTitleRow}>
                    <h3 className={styles.cardTitle}>{tournament.name}</h3>
                    <span className={`${styles.statusBadge} ${styles[`tone${statusTone(tournament.status)}`]}`}>
                      {formatStatus(tournament.status)}
                    </span>
                    <span className={styles.tagBadge}>{formatLabel}</span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span>
                      Visibility: {tournament.visibility === "capsule" ? "Capsule" : tournament.visibility}
                    </span>
                    <span>
                      {startsAt ? `Starts ${startsAt}` : `Updated ${updatedLabel}`}
                    </span>
                  </div>
                </header>
                {tournament.summary ? <p className={styles.cardSummary}>{tournament.summary}</p> : null}
                <footer className={styles.cardFooter}>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={manageHref}>Manage tournament</Link>
                  </Button>
                </footer>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
