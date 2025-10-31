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
} from "@/types/search";

import styles from "./global-search.module.css";

const SEARCH_EVENT_NAME = "capsules:search:open";
const DEBOUNCE_DELAY_MS = 220;
const MIN_QUERY_LENGTH = 2;

const SECTION_LABEL: Record<GlobalSearchSection["type"], string> = {
  users: "People",
  capsules: "Capsules",
  memories: "Memories",
};

export function GlobalSearchOverlay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<GlobalSearchSection[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    const handleOpen: EventListener = () => setOpen(true);
    window.addEventListener(SEARCH_EVENT_NAME, handleOpen);
    return () => {
      window.removeEventListener(SEARCH_EVENT_NAME, handleOpen);
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

    if (query.trim().length < MIN_QUERY_LENGTH) {
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
        const response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: query, limit: 24 }),
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
            setSections(data.sections);
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
  }, [open, query]);

  if (!open) return null;

  const hasResults = sections.some((section) => section.items.length > 0);

  const renderMemoryHighlight = (item: MemorySearchItem) => {
    const meta = item.meta ?? {};
    const highlight = typeof meta?.search_highlight === "string" ? meta.search_highlight : null;
    if (!highlight) return null;
    return <p className={styles.resultHighlight} dangerouslySetInnerHTML={{ __html: highlight }} />;
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

    return (
      <article key={item.id} className={styles.resultItem}>
        <header className={styles.resultHeader}>
          <span className={styles.resultKind}>{kind}</span>
          {createdAt ? <time className={styles.resultTime}>{createdAt}</time> : null}
        </header>
        <h3 className={styles.resultTitle}>{title}</h3>
        {highlightNode}
        {!highlightNode && description ? (
          <p className={styles.resultDescription}>{description}</p>
        ) : null}
      </article>
    );
  };

  const renderAvatar = (item: UserSearchResult | CapsuleSearchResult) => {
    const avatarUrl =
      item.type === "user" ? item.avatarUrl : item.logoUrl ?? item.bannerUrl ?? null;
    const fallbackText =
      item.name.trim().length && item.name[0]
        ? item.name.trim()[0]?.toUpperCase()
        : "•";
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
        onClick={() => handleNavigate(item.url)}
      >
        {renderAvatar(item)}
        <span className={styles.entityBody}>
          {renderEntityTitle(item.name, item.highlight)}
          {item.subtitle ? <span className={styles.entitySubtitle}>{item.subtitle}</span> : null}
        </span>
      </button>
    );
  };

  const renderCapsuleItem = (item: CapsuleSearchResult) => {
    return (
      <button
        key={`capsule-${item.id}`}
        type="button"
        className={styles.entityResult}
        onClick={() => handleNavigate(item.url)}
      >
        {renderAvatar(item)}
        <span className={styles.entityBody}>
          {renderEntityTitle(item.name, item.highlight)}
          {item.subtitle ? <span className={styles.entitySubtitle}>{item.subtitle}</span> : null}
        </span>
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

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
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
          query.trim().length >= MIN_QUERY_LENGTH ? (
            <span className={styles.statusText}>No matches yet. Try another phrase.</span>
          ) : null}
          {!loading && !error && query.trim().length < MIN_QUERY_LENGTH ? (
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
