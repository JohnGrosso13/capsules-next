"use client";
import * as React from "react";
import { ArrowRight, CaretLeft, CaretRight, ChartBar } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import { computeDisplayUploads } from "./process-uploads";
import { MemoryUploadDetailDialog } from "./upload-detail-dialog";
import { useMemoryUploads } from "./use-memory-uploads";
import type { DisplayMemoryUpload, MemoryUploadItem } from "./uploads-types";
import layoutStyles from "./memory-carousel-shell.module.css";
import cardStyles from "./uploads-carousel.module.css";
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
  upload: DisplayMemoryUpload | null;
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
  const candidates = [periodIndex, questionIndex, exclamationIndex].filter((index) => index >= 0);
  const sentenceEnd = candidates.length ? Math.min(...candidates) : -1;
  const base =
    sentenceEnd >= 0 && sentenceEnd + 1 <= limit ? trimmed.slice(0, sentenceEnd + 1) : trimmed;
  return truncate(base, limit);
}

function readThemeVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name)?.trim();
    return value?.length ? value : fallback;
  } catch {
    return fallback;
  }
}

function buildPollPlaceholderImage(): string {
  const stopA = readThemeVar("--color-brand", "#2563eb");
  const stopB = readThemeVar("--color-brand-strong", "#1d4ed8");
  const stopC = readThemeVar("--card-bg-2", "#0a1024");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="960" viewBox="0 0 640 960">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${stopA}"/>
          <stop offset="52%" stop-color="${stopB}"/>
          <stop offset="100%" stop-color="${stopC}"/>
        </linearGradient>
      </defs>
      <rect width="640" height="960" rx="48" fill="url(#g)" />
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function buildPollPlaceholderUpload(poll: PollCard): DisplayMemoryUpload {
  const title = poll.question || "Poll";
  const description = poll.summary || null;
  const image = buildPollPlaceholderImage();
  return {
    id: `poll-${poll.id}-placeholder`,
    media_type: "image/svg+xml",
    title,
    description,
    displayUrl: image,
    fullUrl: image,
  };
}
export function buildPolls(
  items: MemoryUploadItem[],
  uploadsById?: Map<string, DisplayMemoryUpload>,
): PollCard[] {
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
      const upload = uploadsById?.get(memoryId) ?? null;
      return {
        id: memoryId,
        question,
        summary,
        updatedAt,
        totalVotes,
        options,
        memoryId,
        upload,
      };
    })
    .filter((poll): poll is PollCard => Boolean(poll.question));
}
function getSlidesPerView(): number {
  if (typeof window === "undefined") return 2;
  const width = window.innerWidth;
  if (width >= 960) return 4;
  if (width >= 640) return 3;
  return 2;
}
type PollsProps = { initialItems?: MemoryUploadItem[]; pageSize?: number };
export function PollsCarousel({ initialItems, pageSize }: PollsProps = {}) {
  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 24;
  const { user, items, loading, error } = useMemoryUploads("poll", {
    initialPage: initialItems ? { items: initialItems, hasMore: false } : undefined,
    pageSize: effectivePageSize,
  });
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );
  const displayUploads = React.useMemo(
    () => computeDisplayUploads(items, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, items],
  );
  const uploadsById = React.useMemo(() => {
    const map = new Map<string, DisplayMemoryUpload>();
    displayUploads.forEach((upload) => {
      if (!upload.id) return;
      const key = typeof upload.id === "string" ? upload.id : `${upload.id}`;
      map.set(key, upload);
    });
    return map;
  }, [displayUploads]);
  const polls = React.useMemo(() => buildPolls(items, uploadsById), [items, uploadsById]);
  const pollsWithMedia = React.useMemo(
    () =>
      polls.map((poll) => ({
        ...poll,
        upload: poll.upload ?? buildPollPlaceholderUpload(poll),
      })),
    [polls],
  );
  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());
  const [offset, setOffset] = React.useState(0);
  const [activeUpload, setActiveUpload] = React.useState<DisplayMemoryUpload | null>(null);
  const [activePoll, setActivePoll] = React.useState<PollCard | null>(null);
  const totalItems = pollsWithMedia.length;
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
      const item = pollsWithMedia[(offset + index) % totalItems];
      if (item) result.push(item);
    }
    return result;
  }, [offset, pollsWithMedia, totalItems, visibleCount]);
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
    () => ({ "--memory-visible-count": Math.max(1, visibleCount) }) as React.CSSProperties,
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
      <div className={layoutStyles.carouselShell}>
        <Button
          variant="secondary"
          size="icon"
          className={layoutStyles.navButton}
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
            <div className={layoutStyles.viewport}>
              <div className={layoutStyles.container} style={containerStyle}>
                {visiblePolls.map((poll) => {
                  const headerText = firstSentence(poll.question, 90);
                  const topOptions = [...poll.options]
                    .sort((a, b) => b.votes - a.votes)
                    .slice(0, 2);
                  const mediaUrl = poll.upload?.displayUrl || poll.upload?.fullUrl || null;
                  const hasMedia = Boolean(mediaUrl);
                  return (
                    <div key={poll.id} className={layoutStyles.slide}>
                      <button
                        type="button"
                        className={cardStyles.cardButton}
                        aria-label={`View poll "${poll.question}"`}
                        onClick={() => {
                          if (poll.upload) {
                            setActiveUpload(poll.upload);
                            setActivePoll(poll);
                          }
                        }}
                      >
                        <article className={cardStyles.card}>
                          <div className={cardStyles.media}>
                            {hasMedia ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={mediaUrl ?? undefined}
                                  alt={poll.question}
                                  className={styles.pollMediaImage}
                                  loading="lazy"
                                />
                                <div className={styles.pollSummaryOverlay}>
                                  <p className={styles.pollSummary}>{headerText}</p>
                                </div>
                              </>
                            ) : (
                              <div
                                className={`${styles.pollSummary} ${styles.pollSummaryStandalone}`}
                              >
                                {headerText}
                              </div>
                            )}
                          </div>
                          <div className={cardStyles.meta}>
                            <div className={cardStyles.metaHeader}>
                              {poll.updatedAt ? (
                                <span className={cardStyles.metaTimestamp}>{poll.updatedAt}</span>
                              ) : null}
                            </div>
                            <h4 className={cardStyles.metaTitle}>{poll.question}</h4>
                            {topOptions.length ? (
                              <div className={styles.pollMeta}>
                                {topOptions.map((option) => {
                                  const pct =
                                    poll.totalVotes > 0
                                      ? Math.round((option.votes / poll.totalVotes) * 100)
                                      : 0;
                                  return (
                                    <div key={option.label} className={styles.pollMetaRow}>
                                      <span className={styles.pollMetaLabel}>{option.label}</span>
                                      <span className={styles.pollMetaPct}>{pct}%</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : null}
        <Button
          variant="secondary"
          size="icon"
          className={layoutStyles.navButton}
          data-side="next"
          data-hidden={!visiblePolls.length}
          leftIcon={<CaretRight size={18} weight="bold" />}
          onClick={handleNext}
          aria-label="Next poll"
          disabled={navDisabled}
        />
      </div>
      <MemoryUploadDetailDialog
        item={activeUpload}
        onClose={() => {
          setActiveUpload(null);
          setActivePoll(null);
        }}
        poll={
          activePoll
            ? {
                question: activePoll.question,
                options: activePoll.options,
                totalVotes: activePoll.totalVotes,
              }
            : null
        }
      />
    </div>
  );
}
