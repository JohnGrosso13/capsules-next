"use client";

import * as React from "react";
import { ArrowRight, BookmarkSimple, CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

import { Button, ButtonLink } from "@/components/ui/button";

import { useMemoryUploads } from "./use-memory-uploads";
import type { MemoryUploadItem } from "./uploads-types";
import styles from "./party-recaps-carousel.module.css";

export type SavedPostCard = {
  id: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  createdAt: string | null;
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

export function buildSavedPosts(items: MemoryUploadItem[]): SavedPostCard[] {
  return items
    .map((item) => {
      const meta = toMetaObject(item.meta);
      const author =
        (typeof meta?.post_author_name === "string" && meta.post_author_name.trim()) || null;
      const title =
        (typeof item.title === "string" && item.title.trim()) ||
        (author ? `Saved ${author}'s post` : "Saved post");
      const excerpt =
        (typeof meta?.post_excerpt === "string" && meta.post_excerpt.trim()) ||
        (typeof item.description === "string" && item.description.trim()) ||
        null;
      const createdAt = formatTimestamp(item.created_at ?? null);
      const memoryId =
        typeof item.id === "string"
          ? item.id
          : typeof item.id === "number"
            ? `${item.id}`
            : "unknown";

      return {
        id: memoryId,
        title,
        excerpt,
        author,
        createdAt,
        memoryId,
      };
    })
    .filter((card): card is SavedPostCard => Boolean(card.title));
}

function getSlidesPerView(): number {
  if (typeof window === "undefined") return 1;
  const width = window.innerWidth;
  if (width >= 1200) return 3;
  if (width >= 768) return 2;
  return 1;
}

export function PostMemoriesCarousel(
  { initialItems }: { initialItems?: MemoryUploadItem[] } = {},
) {
  const { user, items, loading, error } = useMemoryUploads("post_memory", {
    initialPage: initialItems ? { items: initialItems, hasMore: false } : undefined,
  });
  const posts = React.useMemo(() => buildSavedPosts(items), [items]);

  const [slidesPerView, setSlidesPerView] = React.useState<number>(() => getSlidesPerView());
  const [offset, setOffset] = React.useState(0);

  const totalItems = posts.length;
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

  const visiblePosts = React.useMemo(() => {
    if (pageSize === 0) return [];
    const result: SavedPostCard[] = [];
    for (let index = 0; index < pageSize; index += 1) {
      const item = posts[(offset + index) % totalItems];
      if (item) result.push(item);
    }
    return result;
  }, [offset, pageSize, posts, totalItems]);

  const hasRotation = pageSize > 0 && totalItems > pageSize;
  const navDisabled = loading || !hasRotation || visiblePosts.length === 0;

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
            <BookmarkSimple size={18} weight="fill" />
          </div>
          <div>
            <h3 className={styles.title}>Saved posts</h3>
            <p className={styles.subtitle}>Posts you remembered with the Memory icon.</p>
          </div>
        </div>
        <div className={styles.actions}>
          <ButtonLink
            variant="ghost"
            size="sm"
            href="/memory/uploads?tab=saved-posts"
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
          data-hidden={!visiblePosts.length}
          leftIcon={<CaretLeft size={18} weight="bold" />}
          onClick={handlePrev}
          aria-label="Previous saved post"
          disabled={navDisabled}
        />

        {!user ? <div className={styles.empty}>Sign in to view your saved posts.</div> : null}
        {user && error ? <div className={styles.empty}>{error}</div> : null}

        {user ? (
          loading && !posts.length ? (
            <div className={styles.empty}>Loading saved posts...</div>
          ) : !posts.length ? (
            <div className={styles.empty}>
              No saved posts yet. Tap the Memory icon on a post to save it.
            </div>
          ) : (
            <div className={styles.viewport}>
              <div className={styles.container} style={containerStyle}>
                {visiblePosts.map((post) => (
                  <article key={post.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <span className={styles.badge}>Saved</span>
                      {post.createdAt ? <span className={styles.timestamp}>{post.createdAt}</span> : null}
                    </div>
                    <h4 className={styles.cardTitle}>{post.title}</h4>
                    {post.author ? <p className={styles.topic}>By {post.author}</p> : null}
                    {post.excerpt ? <p className={styles.summary}>{post.excerpt}</p> : null}
                    <div className={styles.footer}>
                      <span className={styles.memoryId}>Memory #{post.memoryId.slice(0, 8)}</span>
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
          data-hidden={!visiblePosts.length}
          leftIcon={<CaretRight size={18} weight="bold" />}
          onClick={handleNext}
          aria-label="Next saved post"
          disabled={navDisabled}
        />
      </div>
    </div>
  );
}
