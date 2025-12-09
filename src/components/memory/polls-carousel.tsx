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

export function PollsCarousel({ initialItems }: { initialItems?: MemoryUploadItem[] } = {}) {
  const { user, items, loading, error } = useMemoryUploads("poll", {
    initialPage: initialItems ? { items: initialItems, hasMore: false } : undefined,
  });
  const polls = React.useMemo(() => buildPolls(items), [items]);

  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());
  const [offset, setOffset] = React.useState(0);

  const totalItems = polls.length;
  const pageSize = totalItems === 0 ? 0 : Math.max(1, Math.min(slidesPerView, totalItems));

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
    if (pageSize === 0) return [];
    const result: PollCard[] = [];
    for (let index = 0; index < pageSize; index += 1) {
      const item = polls[(offset + index) % totalItems];
      if (item) result.push(item);
    }
    return result;
  }, [offset, pageSize, polls, totalItems]);

  const hasRotation = pageSize > 0 && totalItems > pageSize;
  const navDisabled = loading || !hasRotation || visiblePolls.length === 0;

  const handlePrev = React.useCallback(() => {
    if (!hasRotation) return;
    setOffset((current) => {
      const next = (current - pageSize) % totalItems;
      return next < 0 ? next + totalItems : next;
    });
  }, [hasRotation, pageSize, totalItems]);

  const handleNext = React.useCallback(() => {
    if (!hasRotation) return;
    setOffset((current) => (current + pageSize) % totalItems);
  }, [hasRotation, pageSize, totalItems]);

  const containerStyle = React.useMemo<React.CSSProperties>(
    () => ({ "--recap-visible-count": Math.max(1, pageSize) }) as React.CSSProperties,
    [pageSize],
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
                {visiblePolls.map((poll) => (
                  <article key={poll.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <span className={styles.badge}>Poll</span>
                      {poll.updatedAt ? <span className={styles.timestamp}>{poll.updatedAt}</span> : null}
                    </div>
                    <h4 className={styles.cardTitle}>{poll.question}</h4>
                    {poll.summary ? <p className={styles.summary}>{poll.summary}</p> : null}
                    {poll.options.length ? (
                      <div className={styles.highlights}>
                        {poll.options.slice(0, 3).map((option, index) => {
                          const pct =
                            poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
                          return (
                            <span key={`${poll.id}-option-${index}`} className={styles.highlight}>
                              {option.label} — {option.votes} vote{option.votes === 1 ? "" : "s"} ({pct}%)
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className={styles.footer}>
                      <span className={styles.memoryId}>Memory #{poll.memoryId.slice(0, 8)}</span>
                      <span>Total votes: {poll.totalVotes}</span>
                    </div>
                  </article>
                ))}
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
