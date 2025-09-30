"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./global-search.module.css";

type MemorySearchItem = {
  id: string;
  kind?: string | null;
  title?: string | null;
  description?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
};

type MemorySearchResponse = {
  items?: MemorySearchItem[];
};

const SEARCH_EVENT_NAME = "capsules:search:open";
const DEBOUNCE_DELAY_MS = 220;
const MIN_QUERY_LENGTH = 2;

export function GlobalSearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MemorySearchItem[]>([]);
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
    setResults([]);
    setError(null);
  }, []);

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
    if (!open) return; // avoid running when closed
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
      setResults([]);
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
        const response = await fetch("/api/memory/search", {
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
          setResults([]);
        } else {
          const data = (await response.json()) as MemorySearchResponse;
          setResults(Array.isArray(data.items) ? data.items : []);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setError("Search request was interrupted. Try again.");
          setResults([]);
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

  const renderHighlight = (item: MemorySearchItem) => {
    const meta = item.meta ?? {};
    const highlight = typeof meta?.search_highlight === "string" ? meta.search_highlight : null;
    if (!highlight) return null;
    return (
      <p
        className={styles.resultHighlight}
        dangerouslySetInnerHTML={{ __html: highlight }}
      />
    );
  };

  return (
    <div className={styles.overlay} role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) {
        close();
      }
    }}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="global-search-heading">
        <header className={styles.header}>
          <div className={styles.headingGroup}>
            <h2 id="global-search-heading">Search your memories</h2>
            <p className={styles.subheading}>Algolia + vector search across posts, comments, friends, and more.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={close} aria-label="Close search">X
          </button>
        </header>
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, description, people, or tags..."
            className={styles.searchInput}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={styles.statusRow}>
          {loading ? <span className={styles.statusText}>Searching...</span> : null}
          {!loading && error ? <span className={styles.errorText}>{error}</span> : null}
          {!loading && !error && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH ? (
            <span className={styles.statusText}>No matches yet. Try another phrase.</span>
          ) : null}
          {!loading && !error && query.trim().length < MIN_QUERY_LENGTH ? (
            <span className={styles.statusText}>Enter at least {MIN_QUERY_LENGTH} characters to search.</span>
          ) : null}
        </div>
        <div className={styles.results}>
          {results.map((item) => {
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
            const highlightNode = renderHighlight(item);

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
          })}
        </div>
      </div>
    </div>
  );
}




