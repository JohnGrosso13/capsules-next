"use client";

import * as React from "react";
import { ArrowRight, CaretLeft, CaretRight, ChartBar } from "@phosphor-icons/react/dist/ssr";

import { Button, ButtonLink } from "@/components/ui/button";

import { useMemoryUploads } from "./use-memory-uploads";
import type { MemoryUploadItem } from "./uploads-types";
import styles from "./party-recaps-carousel.module.css";

type PollOption = {
  label: string;
  votes: number;
};

export type PollCard = {
  id: string;
  question: string;
  summary: string | null;
  updatedAt: string | null;
  totalVotes: number;
  options: PollOption[];
  memoryId: string;
};

function toMetaObject(meta: unknown): Record<string, unknown> | null {
  if (!meta) return null;
  if (typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  if (typeof meta === "string") {
    try {
      const parsed = JSON.parse(meta);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function truncate(value: string, limit = 160): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}...`;
}

function firstSentence(value: string, limit = 140): string {
  const trimmed = value.trim();
  if (!trimmed.length) return "";

  const periodIndex = trimmed.indexOf(".");
  const questionIndex = trimmed.indexOf("?");
  const exclamationIndex = trimmed.indexOf("!");

  const candidates = [periodIndex, questionIndex, exclamationIndex].filter(
    (index) => index >= 0,
  );
  const sentenceEnd = candidates.length ? Math.min(...candidates) : -1;

  const base =
    sentenceEnd >= 0 && sentenceEnd + 1 <= limit
      ? trimmed.slice(0, sentenceEnd + 1)
      : trimmed;

  return truncate(base, limit);
}

export function buildPolls(items: MemoryUploadItem[]): PollCard[] {
  return items
    .map((item) => {
      const meta = toMetaObject(item.meta);
      const question =
        (typeof meta?.poll_question === "string" && meta.poll_question.trim()) ||
        (typeof item.title === "string" && item.title.trim()) ||
        "Poll";
      const summary =
        (typeof item.description === "string" && item.description.trim()) ||
        (typeof meta?.post_excerpt === "string" && meta.post_excerpt.trim()) ||
        null;

      const optionsRaw = Array.isArray(meta?.poll_options) ? meta?.poll_options : [];
      const countsRaw = Array.isArray(meta?.poll_counts) ? meta?.poll_counts : [];
      const options: PollOption[] = optionsRaw
        .map((opt, index) => {
          const label = typeof opt === "string" ? opt.trim() : "";
          const votesRaw = countsRaw[index];
          const votes = typeof votesRaw === "number" ? votesRaw : 0;
          return label.length ? { label, votes } : null;
        })
        .filter((opt): opt is PollOption => opt !== null);

      const totalVotes =
        typeof meta?.poll_total_votes === "number"
          ? meta.poll_total_votes
          : options.reduce((sum, opt) => sum + opt.votes, 0);

      const updatedAt =
        formatTimestamp(
          typeof meta?.poll_updated_at === "string" ? (meta.poll_updated_at as string) : null,
        ) ?? formatTimestamp(item.created_at ?? null);

      const memoryId =
        typeof item.id === "string"
          ? item.id
          : typeof item.id === "number"
            ? `${item.id}`
            : "unknown";

      return {
        id: memoryId,
        question,
        summary,
        updatedAt,
        totalVotes,
        options,
        memoryId,
      };
    })
    .filter((poll): poll is PollCard => Boolean(poll.question));
}

function getSlidesPerView(): number {
  if (typeof window === "undefined") return 1;
  const width = window.innerWidth;
  if (width >= 1200) return 3;
  if (width >= 768) return 2;
  return 1;
}

type PollsProps = { initialItems?: MemoryUploadItem[]; pageSize?: number };

export function PollsCarousel({ initialItems, pageSize }: PollsProps = {}) {
  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 24;
  const { user, items, loading, error } = useMemoryUploads("poll", {
    initialPage: initialItems ? { items: initialItems, hasMore: false } : undefined,
    pageSize: effectivePageSize,
  });
  const polls = React.useMemo(() => buildPolls(items), [items]);

  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());
  const [offset, setOffset] = React.useState(0);

  const totalItems = polls.length;
  const visibleCount = totalItems === 0 ? 0 : Math.max(1, Math.min(slidesPerView, totalItems));

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setSlidesPerView(getSlidesPerView());
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  React.useEffect(() => {
    if (totalItems === 0) {
      setOffset(0);
      return;
    }
    setOffset((current) => current % totalItems);
  }, [totalItems]);

  const visiblePolls = React.useMemo(() => {
    if (visibleCount === 0) return [];
    const result: PollCard[] = [];
    for (let index = 0; index < visibleCount; index += 1) {
      const item = polls[(offset + index) % totalItems];
      if (item) result.push(item);
    }
    return result;
  }, [offset, polls, totalItems, visibleCount]);

  const hasRotation = visibleCount > 0 && totalItems > visibleCount;
  const navDisabled = loading || !hasRotation || visiblePolls.length === 0;

  const handlePrev = React.useCallback(() => {
    if (!hasRotation) return;
    setOffset((current) => {
      const next = (current - visibleCount) % totalItems;
      return next < 0 ? next + totalItems : next;
    });
  }, [hasRotation, totalItems, visibleCount]);

  const handleNext = React.useCallback(() => {
    if (!hasRotation) return;
    setOffset((current) => (current + visibleCount) % totalItems);
  }, [hasRotation, totalItems, visibleCount]);

  const containerStyle = React.useMemo<React.CSSProperties>(
    () => ({ "--recap-visible-count": Math.max(1, visibleCount) }) as React.CSSProperties,
    [visibleCount],
  );

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.icon}>
            <ChartBar size={18} weight="fill" />
          </div>
          <div>
            <h3 className={styles.title}>Poll snapshots</h3>
            <p className={styles.subtitle}>Results from polls you saved to Memory.</p>
          </div>
        </div>
        <div className={styles.actions}>
          <ButtonLink
            variant="ghost"
            size="sm"
            href="/memory/uploads?tab=polls"
            rightIcon={<ArrowRight size={16} weight="bold" />}
          >
            View All
          </ButtonLink>
        </div>
      </div>

      <div className={styles.carouselShell}>
        <Button
          variant="secondary"
          size="icon"
          className={styles.navButton}
          data-side="prev"
          data-hidden={!visiblePolls.length}
          leftIcon={<CaretLeft size={18} weight="bold" />}
          onClick={handlePrev}
          aria-label="Previous poll"
          disabled={navDisabled}
        />

        {!user ? <div className={styles.empty}>Sign in to view poll snapshots.</div> : null}
        {user && error ? <div className={styles.empty}>{error}</div> : null}

        {user ? (
          loading && !polls.length ? (
            <div className={styles.empty}>Loading poll snapshots...</div>
          ) : !polls.length ? (
            <div className={styles.empty}>No polls saved yet. Save a poll to Memory to see it.</div>
          ) : (
            <div className={styles.viewport}>
              <div className={styles.container} style={containerStyle}>
                {visiblePolls.map((poll) => {
                  const summarySource = poll.question || poll.summary || "";
                  const summaryText =
                    summarySource.length > 0
                      ? firstSentence(summarySource, 120)
                      : "Poll snapshot";
                  const topOptions = [...poll.options]
                    .sort((a, b) => b.votes - a.votes)
                    .slice(0, 2);

                  return (
                    <article
                      key={poll.id}
                      className={`${styles.card} ${styles.pollCard}`}
                    >
                      <p className={styles.pollSummary}>{summaryText}</p>
                      {topOptions.length ? (
                        <>
                          <div className={styles.pollDivider} />
                          <div className={styles.pollOptions}>
                            {topOptions.map((option, index) => {
                              const pct =
                                poll.totalVotes > 0
                                  ? Math.round((option.votes / poll.totalVotes) * 100)
                                  : 0;
                              return (
                                <div
                                  key={`${poll.id}-option-${index}`}
                                  className={styles.pollOption}
                                >
                                  <span className={styles.pollOptionLabel}>{option.label}</span>
                                  <span className={styles.pollOptionValue}>{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          )
        ) : null}

        <Button
          variant="secondary"
          size="icon"
          className={styles.navButton}
          data-side="next"
          data-hidden={!visiblePolls.length}
          leftIcon={<CaretRight size={18} weight="bold" />}
          onClick={handleNext}
          aria-label="Next poll"
          disabled={navDisabled}
        />
      </div>
    </div>
  );
}
