"use client";

import * as React from "react";
import { ArrowSquareOut, Clock, Sparkle, X } from "@phosphor-icons/react/dist/ssr";

import styles from "./home-highlights.module.css";

import type { SummaryConversationEntry } from "@/lib/composer/summary-context";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";

type HomeHighlightsOverlayProps = {
  open: boolean;
  loading?: boolean;
  entries: SummaryConversationEntry[];
  highlights?: string[];
  title?: string | null;
  posts: HomeFeedPost[];
  onClose(): void;
  onOpenPost(postId: string | null | undefined): void;
  onViewInFeed?(postId: string | null | undefined): void;
};

type HighlightCardData = {
  entry: SummaryConversationEntry;
  post: HomeFeedPost | null;
  author: string;
  relativeTime: string | null;
  summary: string;
  highlightTags: string[];
  rank: number;
  thumb: string | null;
};

function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function resolveAuthor(entry: SummaryConversationEntry, post: HomeFeedPost | null): string {
  if (entry.author) return entry.author;
  if (!post) return "Someone";
  const fromPost =
    (post.user_name as string | null | undefined) ??
    (post as { userName?: string | null }).userName ??
    null;
  if (typeof fromPost === "string" && fromPost.trim().length) {
    return fromPost.trim();
  }
  return "Someone";
}

function resolveThumb(post: HomeFeedPost | null): string | null {
  if (!post) return null;
  const attachments = Array.isArray(post.attachments) ? post.attachments : [];
  const firstAttachment = attachments.find(
    (attachment) =>
      typeof attachment.thumbnailUrl === "string" ||
      (typeof attachment.url === "string" && attachment.url.trim().length > 0),
  );
  if (firstAttachment) {
    if (typeof firstAttachment.thumbnailUrl === "string" && firstAttachment.thumbnailUrl.length) {
      return firstAttachment.thumbnailUrl;
    }
    if (typeof firstAttachment.url === "string" && firstAttachment.url.trim().length) {
      return firstAttachment.url;
    }
  }
  if (typeof post.mediaUrl === "string" && post.mediaUrl.trim().length) {
    return post.mediaUrl;
  }
  return null;
}

export function HomeHighlightsOverlay({
  open,
  loading = false,
  entries,
  highlights,
  title = "Highlights",
  posts,
  onClose,
  onOpenPost,
  onViewInFeed,
}: HomeHighlightsOverlayProps) {
  const shouldRender = open || loading;
  const postLookup = React.useMemo(() => {
    const map = new Map<string, HomeFeedPost>();
    posts.forEach((post) => map.set(post.id, post));
    return map;
  }, [posts]);

  const cards = React.useMemo<HighlightCardData[]>(() => {
    return entries.slice(0, 8).map((entry, index) => {
      const post = entry.postId ? postLookup.get(entry.postId) ?? null : null;
      const author = resolveAuthor(entry, post);
      const summarySource =
        entry.highlights && entry.highlights.length
          ? entry.highlights[0]!
          : entry.title ?? entry.summary ?? "New update";
      const summary = truncate(summarySource, 200);
      const thumb = resolveThumb(post);
      const highlightTags = (entry.highlights ?? []).slice(0, 3);
      return {
        entry,
        post,
        author,
        relativeTime: entry.relativeTime ?? null,
        summary,
        highlightTags,
        rank: index + 1,
        thumb,
      };
    });
  }, [entries, postLookup]);

  React.useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!shouldRender) return null;

  const headerHighlights = (highlights ?? []).filter(Boolean).slice(0, 3);
  const showEmptyState = !loading && cards.length === 0;

  return (
    <div className={styles.backdrop} data-open={open ? "true" : undefined} aria-hidden={!open}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label="Highlights">
        <header className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.eyebrow}>
              <Sparkle weight="fill" className={styles.sparkle} />
              Quick highlights
            </p>
            <h3 className={styles.title}>{title ?? "Highlights"}</h3>
            <p className={styles.subtitle}>
              Tap a card to open the post in a lightbox and jump into comments or member profiles.
            </p>
            {headerHighlights.length ? (
              <div className={styles.highlightTags}>
                {headerHighlights.map((highlight, index) => (
                  <span key={`${highlight}-${index}`} className={styles.highlightTag}>
                    {highlight}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
              <X weight="bold" />
            </button>
          </div>
        </header>

        <div className={styles.cardGrid} aria-live="polite">
          {loading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div key={`highlight-skeleton-${index}`} className={`${styles.card} ${styles.cardSkeleton}`}>
                  <div className={styles.cardMeta}>
                    <span className={`${styles.badge} ${styles.skeletonPulse}`} />
                    <span className={`${styles.muted} ${styles.skeletonPulse}`} />
                  </div>
                  <div className={`${styles.cardTitle} ${styles.skeletonPulse}`} />
                  <div className={`${styles.cardSummary} ${styles.skeletonPulse}`} />
                  <div className={`${styles.cardSummary} ${styles.skeletonPulse}`} />
                  <div className={styles.cardFooter}>
                    <span className={`${styles.avatar} ${styles.skeletonPulse}`} />
                    <span className={`${styles.pill} ${styles.skeletonPulse}`} />
                  </div>
                </div>
              ))
            : null}

          {!loading && showEmptyState ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>No highlights yet</p>
              <p className={styles.emptySubtitle}>We did not detect posts with enough detail to highlight.</p>
            </div>
          ) : null}

          {!loading
            ? cards.map((card) => {
                const handleOpen = () => onOpenPost(card.entry.postId);
                const handleKeyDown = (event: React.KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleOpen();
                  }
                };
                const handleViewInFeed = (event: React.MouseEvent) => {
                  event.stopPropagation();
                  if (onViewInFeed) {
                    onViewInFeed(card.entry.postId);
                  }
                };
                return (
                  <article
                    key={card.entry.id}
                    className={styles.card}
                    role="button"
                    tabIndex={0}
                    onClick={handleOpen}
                    onKeyDown={handleKeyDown}
                    data-disabled={!card.entry.postId ? "true" : undefined}
                    aria-disabled={!card.entry.postId}
                  >
                    <div className={styles.cardMeta}>
                      <span className={styles.badge}>#{card.rank}</span>
                      <span className={styles.muted}>
                        <Clock weight="duotone" />
                        {card.relativeTime ?? "Just now"}
                      </span>
                    </div>
                    <div className={styles.cardTitle}>{card.entry.title ?? card.summary}</div>
                    <p className={styles.cardSummary}>{card.summary}</p>
                    {card.highlightTags.length ? (
                      <div className={styles.chips}>
                        {card.highlightTags.map((tag, index) => (
                          <span key={`${card.entry.id}-tag-${index}`} className={styles.chip}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.cardFooter}>
                      <div className={styles.avatar} data-thumb={card.thumb ? "true" : undefined} style={card.thumb ? { backgroundImage: `url(${card.thumb})` } : undefined}>
                        {!card.thumb ? card.author.slice(0, 1).toUpperCase() : null}
                      </div>
                      <div className={styles.footerText}>
                        <p className={styles.author}>{card.author}</p>
                        <p className={styles.secondary}>Open post &middot; Lightbox enabled</p>
                      </div>
                      <div className={styles.footerActions}>
                        <button type="button" className={styles.secondaryAction} onClick={handleViewInFeed}>
                          View in feed
                        </button>
                        <button type="button" className={styles.primaryAction} onClick={handleOpen}>
                          <ArrowSquareOut weight="bold" />
                          Open
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            : null}
        </div>
      </section>
    </div>
  );
}
