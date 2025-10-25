import * as React from "react";

import styles from "./chat.module.css";

type GifSearchResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
  size: number | null;
};

export type GifPickerSelection = GifSearchResult & { provider: "giphy" | "tenor" };

export type GifPickerProps = {
  onSelect: (gif: GifPickerSelection) => void;
  onClose: () => void;
};

type ApiResponse = {
  provider: "giphy" | "tenor";
  results: GifSearchResult[];
  next: string | null;
};

const DEFAULT_LIMIT = 24;

function useOutsideDismiss(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (ref.current && ref.current.contains(target)) return;
      handler();
    };
    window.addEventListener("mousedown", onPointerDown, { capture: true } as AddEventListenerOptions);
    return () => window.removeEventListener("mousedown", onPointerDown, { capture: true } as AddEventListenerOptions);
  }, [handler, ref]);
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  useOutsideDismiss(containerRef, onClose);

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GifPickerSelection[]>([]);
  const [nextPos, setNextPos] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = React.useState(false);

  const controllerRef = React.useRef<AbortController | null>(null);

  const fetchGifs = React.useCallback(
    async (searchTerm: string, options: { append?: boolean; pos?: string | null } = {}) => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const trimmed = searchTerm.trim();
        if (trimmed) params.set("q", trimmed);
        params.set("limit", String(DEFAULT_LIMIT));
        if (options.pos) params.set("pos", options.pos);
        const response = await fetch(`/api/gifs/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const message = await response.text().catch(() => response.statusText);
          throw new Error(message || "Failed to load GIFs");
        }
        const payload = (await response.json()) as ApiResponse;
        const normalized = (payload.results ?? []).map((gif) => ({
          ...gif,
          provider: payload.provider,
        }));
        setResults((current) =>
          options.append ? [...current, ...normalized] : normalized,
        );
        setNextPos(payload.next ?? null);
        setInitialLoaded(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("gif search failed", err);
        setError((err as Error).message || "Failed to load GIFs");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      if (!initialLoaded) {
        fetchGifs("");
      }
      return;
    }
    const handler = window.setTimeout(() => {
      fetchGifs(trimmed);
    }, 250);
    return () => window.clearTimeout(handler);
  }, [fetchGifs, initialLoaded, query]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [onClose]);

  const handleSelect = React.useCallback(
    (gif: GifPickerSelection) => {
      onSelect(gif);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleLoadMore = React.useCallback(() => {
    if (!nextPos || loading) return;
    fetchGifs(query.trim(), { append: true, pos: nextPos });
  }, [fetchGifs, loading, nextPos, query]);

  return (
    <div ref={containerRef} className={styles.gifPicker} role="dialog" aria-label="Choose a GIF">
      <input
        className={styles.gifSearchInput}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search GIFs"
        aria-label="Search GIFs"
      />
      {error ? <div className={styles.gifError}>{error}</div> : null}
      <div className={styles.gifResults}>
        {results.length ? (
          results.map((gif) => (
            <button
              key={gif.id}
              type="button"
              className={styles.gifResultButton}
              onClick={() => handleSelect(gif)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gif.previewUrl || gif.url}
                alt={gif.title}
                className={styles.gifResultImage}
                loading={initialLoaded ? "lazy" : "eager"}
              />
            </button>
          ))
        ) : loading ? (
          <div className={styles.gifEmpty}>Loading GIFs...</div>
        ) : (
          <div className={styles.gifEmpty}>No GIFs found</div>
        )}
      </div>
      <div className={styles.gifFooter}>
        <button type="button" className={styles.gifCloseButton} onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className={styles.gifLoadMore}
          onClick={handleLoadMore}
          disabled={!nextPos || loading}
        >
          {loading ? "Loading..." : nextPos ? "Load more" : "End of results"}
        </button>
      </div>
    </div>
  );
}

