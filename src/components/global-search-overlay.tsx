"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CapsuleSearchResult,
  GlobalSearchResponse,
  GlobalSearchSection,
  MemorySearchItem,
  MemorySearchResult,
  UserSearchResult,
  CapsuleRecordSearchResult,
  SearchOpenDetail,
  SearchSelectionPayload,
} from "@/types/search";

import styles from "./global-search.module.css";

const SEARCH_EVENT_NAME = "capsules:search:open";
const LIGHTBOX_EVENT_NAME = "capsules:lightbox:open";
const DEBOUNCE_DELAY_MS = 140;
const MIN_QUERY_LENGTH = 2;
const RECORD_KIND_LABEL: Record<CapsuleRecordSearchResult["kind"], string> = {
  membership: "Membership",
  posts: "Posts",
  files: "Files",
  ladder: "Ladder",
};

const SECTION_LABEL: Record<GlobalSearchSection["type"], string> = {
  users: "People",
  capsules: "Capsules",
  memories: "Memories",
  capsule_records: "Capsule records",
};

type SelectionMode = "default" | "composer";

const formatPromptText = (...segments: Array<string | null | undefined>) =>
  segments
    .map((segment) => (segment ?? "").trim())
    .filter(Boolean)
    .join(" ");

function normalizeSections(
  sections: GlobalSearchSection[] | null | undefined,
): GlobalSearchSection[] {
  if (!Array.isArray(sections)) return [];
  return sections.slice();
}

export function GlobalSearchOverlay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<GlobalSearchSection[]>([]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("default");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const overlayPointerDownRef = useRef(false);
  const selectionHandlerRef = useRef<SearchOpenDetail["onSelect"] | null>(null);
  const trimmedQuery = useMemo(() => query.trim(), [query]);

  const formatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return null;
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSections([]);
    setError(null);
    setSelectionMode("default");
    selectionHandlerRef.current = null;
  }, []);

  const handleNavigate = useCallback(
    (url: string | null | undefined) => {
      if (!url) return;
      close();
      router.push(url);
    },
    [close, router],
  );

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<SearchOpenDetail | undefined>).detail;
      if (detail?.mode === "composer" && typeof detail.onSelect === "function") {
        selectionHandlerRef.current = detail.onSelect;
        setSelectionMode("composer");
      } else {
        selectionHandlerRef.current = null;
        setSelectionMode("default");
      }
      setOpen(true);
    };

    window.addEventListener(SEARCH_EVENT_NAME, handleOpen as EventListener);
    return () => {
      window.removeEventListener(SEARCH_EVENT_NAME, handleOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      abortRef.current = null;
      setSections([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = window.setTimeout(async () => {
      try {
        const activeCapsuleId =
          typeof document === "undefined"
            ? null
            : document.documentElement.dataset.activeCapsuleId ?? null;
        const response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: trimmedQuery, limit: 24, capsuleId: activeCapsuleId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            setError("You need to be signed in to search.");
          } else {
            setError("Search failed. Please try again.");
          }
          setSections([]);
        } else {
          const data = (await response.json()) as GlobalSearchResponse;
          if (Array.isArray(data.sections)) {
            setSections(normalizeSections(data.sections));
          } else {
            setSections([]);
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setError("Search request was interrupted. Try again.");
          setSections([]);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmedQuery]);

  const hasResults = sections.some((section) => section.items.length > 0);

  const renderMemoryHighlight = (item: MemorySearchItem) => {
    const meta = item.meta ?? {};
    const highlight = typeof meta?.search_highlight === "string" ? meta.search_highlight : null;
    if (!highlight) return null;
    return <p className={styles.resultHighlight} dangerouslySetInnerHTML={{ __html: highlight }} />;
  };

  const resolveMemoryPostId = (item: MemorySearchResult): string | null => {
    const meta = (item.meta ?? {}) as Record<string, unknown>;
    const metaPostId = (() => {
      const candidates = [meta.post_id, meta.postId];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim().length) return candidate.trim();
      }
      return null;
    })();
    const candidates = [item.post_id, item.postId, metaPostId];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length) {
        return candidate.trim();
      }
    }
    return null;
  };

  const resolveMemoryNavigateUrl = (item: MemorySearchResult): string | null => {
    const postId = resolveMemoryPostId(item);
    if (postId) {
      return `/home?postId=${encodeURIComponent(postId)}`;
    }
    return null;
  };

  const resolveMemoryThumbnail = (item: MemorySearchResult): string | null => {
    const meta = (item.meta ?? {}) as Record<string, unknown>;
    const candidates: Array<unknown> = [
      item.media_url ?? item.mediaUrl ?? null,
      meta?.thumbnail_url,
      meta?.thumbnailUrl,
      meta?.thumb,
      meta?.preview_url,
      meta?.previewUrl,
      meta?.image_thumb,
      meta?.imageThumb,
    ];
    if (Array.isArray(meta?.derived_assets)) {
      const assetUrl = (meta.derived_assets as Array<Record<string, unknown>>)
        .map((asset) => asset?.url)
        .find((value) => typeof value === "string" && value.trim().length);
      if (assetUrl) candidates.push(assetUrl);
    }
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length) {
        return candidate.trim();
      }
    }
    return null;
  };

  const resolveMemoryMediaUrl = (item: MemorySearchResult): string | null => {
    const meta = (item.meta ?? {}) as Record<string, unknown>;
    const candidates: Array<unknown> = [
      item.media_url ?? item.mediaUrl ?? null,
      meta?.download_url,
      meta?.downloadUrl,
      meta?.url,
      meta?.source_url,
      meta?.sourceUrl,
    ];
    if (Array.isArray(meta?.derived_assets)) {
      const derived = meta.derived_assets as Array<Record<string, unknown>>;
      for (const asset of derived) {
        if (typeof asset?.url === "string" && asset.url.trim().length) {
          candidates.push(asset.url);
        }
      }
    }
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length) {
        return candidate.trim();
      }
    }
    return null;
  };

  const dispatchLightboxOpen = (postId: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(LIGHTBOX_EVENT_NAME, {
        detail: { postId },
      }),
    );
  };

  const sendSelectionToComposer = useCallback(
    (payload: SearchSelectionPayload): boolean => {
      if (selectionMode !== "composer" || !selectionHandlerRef.current) return false;
      selectionHandlerRef.current(payload);
      close();
      return true;
    },
    [close, selectionMode],
  );

  const buildMemorySelection = (item: MemorySearchResult): SearchSelectionPayload => {
    const title = item.title?.trim() || item.description?.trim() || "Memory";
    const description = item.description?.trim() || null;
    const navigateUrl = resolveMemoryNavigateUrl(item);
    const mediaUrl = resolveMemoryMediaUrl(item);
    const thumbnailUrl = resolveMemoryThumbnail(item);
    const promptText = formatPromptText(
      `Use this memory: ${title}.`,
      description,
      navigateUrl ? `Post link: ${navigateUrl}` : null,
      !navigateUrl && mediaUrl ? `Asset: ${mediaUrl}` : null,
    );
    return {
      kind: "memory",
      promptText,
      title,
      url: navigateUrl ?? mediaUrl ?? null,
      attachment: mediaUrl
        ? {
            url: mediaUrl,
            thumbUrl: thumbnailUrl,
            mimeType: item.media_type ?? item.mediaType ?? null,
            title,
            description,
          }
        : null,
    };
  };

  const renderMemoryItem = (item: MemorySearchResult) => {
    const title = item.title?.trim() || item.description?.trim() || "Untitled memory";
    const description = item.description?.trim() || null;
    const kind = item.kind?.toUpperCase() ?? "MEMORY";
    const createdAt = item.created_at
      ? (() => {
          try {
            const date = new Date(item.created_at as string);
            return formatter ? formatter.format(date) : date.toLocaleString();
          } catch {
            return null;
          }
        })()
      : null;
    const highlightNode = renderMemoryHighlight(item);

    const navigateUrl = resolveMemoryNavigateUrl(item);
    const postIdForLightbox = resolveMemoryPostId(item);
    const thumbnailUrl = resolveMemoryThumbnail(item);

    return (
      <button
        key={item.id}
        type="button"
        className={styles.resultItem}
        onClick={() => {
          if (sendSelectionToComposer(buildMemorySelection(item))) return;
          if (postIdForLightbox) {
            dispatchLightboxOpen(postIdForLightbox);
            close();
          } else {
            handleNavigate(navigateUrl);
          }
        }}
      >
        <div className={styles.resultBody}>
          <header className={styles.resultHeader}>
            <span className={styles.resultKind}>{kind}</span>
            {createdAt ? <time className={styles.resultTime}>{createdAt}</time> : null}
          </header>
          <h3 className={styles.resultTitle}>{title}</h3>
          {highlightNode}
          {!highlightNode && description ? (
            <p className={styles.resultDescription}>{description}</p>
          ) : null}
        </div>
        {thumbnailUrl ? (
          <span className={styles.resultMediaThumb} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- search thumbnails can be plain imgs */}
            <img src={thumbnailUrl} alt="" className={styles.resultMediaImg} loading="lazy" />
          </span>
        ) : null}
      </button>
    );
  };

  const renderAvatar = (item: UserSearchResult | CapsuleSearchResult) => {
    const avatarUrl =
      item.type === "user" ? item.avatarUrl : item.logoUrl ?? item.bannerUrl ?? null;
    const fallbackText =
      item.name.trim().length && item.name[0]
        ? item.name.trim()[0]?.toUpperCase()
        : "?";
    return (
      <span className={styles.entityAvatar} aria-hidden>
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={44}
            height={44}
            className={styles.entityAvatarImg}
            sizes="44px"
            priority={false}
          />
        ) : (
          <span className={styles.entityAvatarFallback}>{fallbackText}</span>
        )}
      </span>
    );
  };

  const buildUserSelection = (item: UserSearchResult): SearchSelectionPayload => ({
    kind: "user",
    promptText: formatPromptText(
      `Tell me about ${item.name}.`,
      item.subtitle,
      item.url ? `Profile: ${item.url}` : null,
    ),
    title: item.name,
    url: item.url,
    attachment: null,
  });

  const renderEntityTitle = (name: string, highlight: string | null) => {
    if (highlight) {
      return (
        <span
          className={styles.entityTitle}
          dangerouslySetInnerHTML={{ __html: highlight }}
        />
      );
    }
    return <span className={styles.entityTitle}>{name}</span>;
  };

  const renderUserItem = (item: UserSearchResult) => {
    return (
      <button
        key={`user-${item.id}`}
        type="button"
        className={styles.entityResult}
        onClick={() => {
          if (sendSelectionToComposer(buildUserSelection(item))) return;
          handleNavigate(item.url);
        }}
      >
        {renderAvatar(item)}
        <span className={styles.entityBody}>
          {renderEntityTitle(item.name, item.highlight)}
          {item.subtitle ? <span className={styles.entitySubtitle}>{item.subtitle}</span> : null}
        </span>
      </button>
    );
  };

  const buildCapsuleSelection = (item: CapsuleSearchResult): SearchSelectionPayload => ({
    kind: "capsule",
    promptText: formatPromptText(
      `Explore capsule ${item.name}.`,
      item.subtitle,
      item.url ? `Link: ${item.url}` : null,
    ),
    title: item.name,
    url: item.url,
    attachment: null,
  });

  const renderCapsuleItem = (item: CapsuleSearchResult) => {
    return (
      <button
        key={`capsule-${item.id}`}
        type="button"
        className={styles.entityResult}
        onClick={() => {
          if (sendSelectionToComposer(buildCapsuleSelection(item))) return;
          handleNavigate(item.url);
        }}
      >
        {renderAvatar(item)}
        <span className={styles.entityBody}>
          {renderEntityTitle(item.name, item.highlight)}
          {item.subtitle ? <span className={styles.entitySubtitle}>{item.subtitle}</span> : null}
        </span>
      </button>
    );
  };

  const formatRecordKind = (kind: CapsuleRecordSearchResult["kind"]): string => {
    return RECORD_KIND_LABEL[kind] ?? kind;
  };

  const buildCapsuleRecordSelection = (
    item: CapsuleRecordSearchResult,
  ): SearchSelectionPayload => {
    const label = formatRecordKind(item.kind);
    return {
      kind: "capsule_record",
      promptText: formatPromptText(
        `${label}: ${item.title}.`,
        item.detail,
        item.url ? `Link: ${item.url}` : null,
      ),
      title: item.title,
      url: item.url ?? null,
      attachment: null,
    };
  };

  const renderCapsuleRecordItem = (item: CapsuleRecordSearchResult) => {
    const isClickable = Boolean(item.url);
    return (
      <button
        key={`record-${item.id}`}
        type="button"
        className={styles.recordResult}
        onClick={() => {
          if (sendSelectionToComposer(buildCapsuleRecordSelection(item))) return;
          if (item.url) handleNavigate(item.url);
        }}
        disabled={!isClickable}
      >
        <div className={styles.recordHeader}>
          <span className={styles.recordKind}>{formatRecordKind(item.kind)}</span>
          {item.subtitle ? <span className={styles.recordSubtitle}>{item.subtitle}</span> : null}
        </div>
        <p className={styles.recordTitle}>{item.title}</p>
        <p className={styles.recordDetail}>{item.detail}</p>
      </button>
    );
  };

  const renderSection = (section: GlobalSearchSection) => {
    if (!section.items.length) return null;
    if (section.type === "users") {
      return (
        <section key="users" className={styles.section}>
          <header className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>{SECTION_LABEL.users}</span>
          </header>
          <div className={styles.sectionItems}>{section.items.map((item) => renderUserItem(item))}</div>
        </section>
      );
    }
    if (section.type === "capsules") {
      return (
        <section key="capsules" className={styles.section}>
          <header className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>{SECTION_LABEL.capsules}</span>
          </header>
          <div className={styles.sectionItems}>
            {section.items.map((item) => renderCapsuleItem(item))}
          </div>
        </section>
      );
    }
    if (section.type === "capsule_records") {
      return (
        <section key="capsule-records" className={styles.section}>
          <header className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>{SECTION_LABEL.capsule_records}</span>
          </header>
          <div className={styles.recordList}>
            {section.items.map((item) => renderCapsuleRecordItem(item))}
          </div>
        </section>
      );
    }
    return (
      <section key="memories" className={styles.section}>
        <header className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>{SECTION_LABEL.memories}</span>
        </header>
        <div className={styles.sectionItems}>
          {section.items.map((item) => renderMemoryItem(item))}
        </div>
      </section>
    );
  };

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onPointerDown={(event) => {
        overlayPointerDownRef.current = event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        overlayPointerDownRef.current =
          overlayPointerDownRef.current && event.target === event.currentTarget;
      }}
      onPointerLeave={() => {
        overlayPointerDownRef.current = false;
      }}
      onPointerCancel={() => {
        overlayPointerDownRef.current = false;
      }}
      onClick={(event) => {
        if (overlayPointerDownRef.current && event.target === event.currentTarget) {
          close();
        }
        overlayPointerDownRef.current = false;
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-heading"
      >
        <header className={styles.header}>
          <div className={styles.headingGroup}>
            <h2 id="global-search-heading">Search Capsules</h2>
            <p className={styles.subheading}>
              Find memories, capsules, and friends with one search.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={close}
            aria-label="Close search"
          >
            X
          </button>
        </header>
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memories, capsules, or friends..."
            className={styles.searchInput}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={styles.statusRow}>
          {loading ? <span className={styles.statusText}>Searching...</span> : null}
          {!loading && error ? <span className={styles.errorText}>{error}</span> : null}
          {!loading &&
          !error &&
          !hasResults &&
          trimmedQuery.length >= MIN_QUERY_LENGTH ? (
            <span className={styles.statusText}>No matches yet. Try another phrase.</span>
          ) : null}
          {!loading && !error && trimmedQuery.length < MIN_QUERY_LENGTH ? (
            <span className={styles.statusText}>
              Enter at least {MIN_QUERY_LENGTH} characters to search.
            </span>
          ) : null}
        </div>
        <div className={styles.results}>{sections.map((section) => renderSection(section))}</div>
      </div>
    </div>
  );
}
