"use client";

import * as React from "react";
import { ArrowRight, CaretLeft, CaretRight, Confetti } from "@phosphor-icons/react/dist/ssr";

import { Button, ButtonLink } from "@/components/ui/button";

import { useMemoryUploads } from "./use-memory-uploads";
import type { MemoryUploadItem } from "./uploads-types";
import styles from "./party-recaps-carousel.module.css";

type RecapCard = {
  id: string;
  title: string;
  summary: string;
  createdAt: string | null;
  topic: string | null;
  highlights: string[];
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

function truncate(value: string, limit = 260): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}...`;
}

function buildRecaps(items: MemoryUploadItem[]): RecapCard[] {
  return items
    .map((item) => {
      const meta = toMetaObject(item.meta);
      const rawSummary =
        (typeof item.description === "string" ? item.description.trim() : "") ||
        (typeof (meta as { summary_text?: unknown })?.summary_text === "string"
          ? ((meta as { summary_text: string }).summary_text ?? "").trim()
          : "");
      if (!rawSummary.length) return null;

      const topicCandidate =
        (typeof (meta as { party_topic?: unknown })?.party_topic === "string"
          ? ((meta as { party_topic: string }).party_topic ?? "").trim()
          : "") || null;

      const titleCandidate = typeof item.title === "string" ? item.title.trim() : "";
      const title = titleCandidate || (topicCandidate ? `Party recap - ${topicCandidate}` : "Party recap");

      const highlightsRaw = (meta as { summary_highlights?: unknown })?.summary_highlights;
      const highlights = Array.isArray(highlightsRaw)
        ? highlightsRaw
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length)
        : [];

      const createdAt =
        formatTimestamp(
          (meta as { summary_generated_at?: unknown })?.summary_generated_at as string | undefined,
        ) ?? formatTimestamp(item.created_at ?? null);

      const memoryId =
        typeof item.id === "string"
          ? item.id
          : typeof item.id === "number"
            ? `${item.id}`
            : "unknown";

      return {
        id: item.id as string,
        title,
        summary: truncate(rawSummary, 320),
        createdAt,
        topic: topicCandidate,
        highlights,
        memoryId,
      };
    })
    .filter((recap): recap is RecapCard => recap !== null);
}

function getSlidesPerView(): number {
  if (typeof window === "undefined") return 1;
  const width = window.innerWidth;
  if (width >= 1200) return 3;
  if (width >= 768) return 2;
  return 1;
}

type PartyRecapsProps = { initialItems?: MemoryUploadItem[]; pageSize?: number };

export function PartyRecapsCarousel({ initialItems, pageSize }: PartyRecapsProps = {}) {
  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 24;
  const { user, items, loading, error } = useMemoryUploads("party_summary", {
    initialPage: initialItems ? { items: initialItems, hasMore: false } : undefined,
    pageSize: effectivePageSize,
  });
  const recaps = React.useMemo(() => buildRecaps(items), [items]);

  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());
  const [offset, setOffset] = React.useState(0);

  const totalItems = recaps.length;
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

  const visibleRecaps = React.useMemo(() => {
    if (visibleCount === 0) return [];
    const result: RecapCard[] = [];
    for (let index = 0; index < visibleCount; index += 1) {
      const item = recaps[(offset + index) % totalItems];
      if (item) result.push(item);
    }
    return result;
  }, [offset, recaps, totalItems, visibleCount]);

  const hasRotation = visibleCount > 0 && totalItems > visibleCount;
  const navDisabled = loading || !hasRotation || visibleRecaps.length === 0;

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
            <Confetti size={18} weight="fill" />
          </div>
          <div>
            <h3 className={styles.title}>Party recaps</h3>
          </div>
        </div>
        <div className={styles.actions}>
          <ButtonLink
            variant="ghost"
            size="sm"
            href="/memory/uploads?tab=party-recaps"
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
          data-hidden={!visibleRecaps.length}
          leftIcon={<CaretLeft size={18} weight="bold" />}
          onClick={handlePrev}
          aria-label="Previous party recap"
          disabled={navDisabled}
        />

        {!user ? <div className={styles.empty}>Sign in to view party recaps.</div> : null}
        {user && error ? <div className={styles.empty}>{error}</div> : null}

        {user ? (
          loading && !recaps.length ? (
            <div className={styles.empty}>Loading party recaps...</div>
          ) : !recaps.length ? (
            <div className={styles.empty}>
              No party recaps yet. Enable summaries in a live party and generate a recap to see it here.
            </div>
          ) : (
            <div className={styles.viewport}>
              <div className={styles.container} style={containerStyle}>
                {visibleRecaps.map((recap) => (
                  <article key={recap.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <span className={styles.badge}>Party recap</span>
                      {recap.createdAt ? (
                        <span className={styles.timestamp}>{recap.createdAt}</span>
                      ) : null}
                    </div>
                    <h4 className={styles.cardTitle}>{recap.title}</h4>
                    {recap.topic ? <p className={styles.topic}>Topic: {recap.topic}</p> : null}
                    <p className={styles.summary}>{recap.summary}</p>
                    {recap.highlights.length ? (
                      <div className={styles.highlights}>
                        {recap.highlights.slice(0, 3).map((highlight, index) => (
                          <span key={`${recap.id}-highlight-${index}`} className={styles.highlight}>
                            {highlight}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.footer}>
                      <span className={styles.memoryId}>Memory #{recap.memoryId.slice(0, 8)}</span>
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
          data-hidden={!visibleRecaps.length}
          leftIcon={<CaretRight size={18} weight="bold" />}
          onClick={handleNext}
          aria-label="Next party recap"
          disabled={navDisabled}
        />
      </div>
    </div>
  );
}
