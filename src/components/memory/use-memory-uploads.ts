"use client";

import * as React from "react";

import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { useCurrentUser } from "@/services/auth/client";
import type { AuthClientUser } from "@/ports/auth-client";

import type { MemoryUploadItem } from "./uploads-types";

type UseMemoryUploadsOptions = {
  pageSize?: number;
  enablePaging?: boolean;
  initialPage?: {
    items: MemoryUploadItem[];
    cursor?: string | null | undefined;
    hasMore?: boolean | undefined;
  } | undefined;
};

type UseMemoryUploadsResult = {
  user: AuthClientUser | null;
  envelope: ReturnType<typeof buildMemoryEnvelope>;
  items: MemoryUploadItem[];
  setItems: React.Dispatch<React.SetStateAction<MemoryUploadItem[]>>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
};

type SharedPage = {
  items: MemoryUploadItem[];
  cursor: string | null;
  hasMore: boolean;
};

const sharedCache = new Map<string, SharedPage>();
const sharedInFlight = new Map<string, Promise<SharedPage>>();
const FETCH_TIMEOUT_MS = 8000;

function buildCacheKey(
  user: AuthClientUser | null,
  kind: string | null,
  pageSize: number,
  enablePaging: boolean,
): string | null {
  if (!user) return null;
  const userKey =
    (typeof user.key === "string" && user.key.trim()) ||
    (typeof user.id === "string" && user.id.trim()) ||
    null;
  if (!userKey) return null;
  return `${userKey}|${kind ?? "all"}|${pageSize}|${enablePaging ? "page" : "single"}`;
}

export function useMemoryUploads(
  kind?: string | null,
  options: UseMemoryUploadsOptions = {},
): UseMemoryUploadsResult {
  const { user } = useCurrentUser();
  const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);
  const [items, setItems] = React.useState<MemoryUploadItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const itemsRef = React.useRef<MemoryUploadItem[]>([]);
  const cursorRef = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const mountedRef = React.useRef(true);

  const resolvedKind = kind === undefined ? "upload" : kind;
  const enablePaging = options.enablePaging ?? false;
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 60;
  const initialLimit = pageSize;
  const cacheKey = React.useMemo(
    () => buildCacheKey(user, resolvedKind, pageSize, enablePaging),
    [enablePaging, pageSize, resolvedKind, user],
  );
  const normalizedInitialPage = React.useMemo(() => {
    if (!options.initialPage) return null;
    const items = Array.isArray(options.initialPage.items) ? options.initialPage.items : [];
    const cursorFromItems =
      options.initialPage.cursor ??
      (items.length
        ? typeof items[items.length - 1]?.created_at === "string"
          ? (items[items.length - 1]?.created_at as string)
          : null
        : null);
    const hasMore = Boolean(options.initialPage.hasMore);
    return { items, cursor: cursorFromItems, hasMore };
  }, [options.initialPage]);

  React.useEffect(
    () => () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    },
    [],
  );

  React.useEffect(() => {
    if (!cacheKey || !normalizedInitialPage) return;
    if (!sharedCache.has(cacheKey)) {
      sharedCache.set(cacheKey, normalizedInitialPage);
    }
  }, [cacheKey, normalizedInitialPage]);

  React.useEffect(() => {
    if (cacheKey || !normalizedInitialPage) return;
    itemsRef.current = normalizedInitialPage.items;
    setItems(normalizedInitialPage.items);
    cursorRef.current = normalizedInitialPage.cursor;
    setHasMore(normalizedInitialPage.hasMore);
    setError(null);
  }, [cacheKey, normalizedInitialPage]);

  React.useEffect(() => {
    const cached = cacheKey ? sharedCache.get(cacheKey) : null;
    const nextItems = cached?.items ?? [];
    itemsRef.current = nextItems;
    setItems(nextItems);
    const nextCursor = cached?.cursor ?? null;
    cursorRef.current = nextCursor;
    setCursor(nextCursor);
    setHasMore(cached?.hasMore ?? false);
    setError(null);
  }, [cacheKey]);

  const fetchPage = React.useCallback(
    async ({ append }: { append: boolean }) => {
      if (!envelope || !user) return;
      const nextCursor = append ? cursorRef.current : null;
      if (append) setLoadingMore(true);
      if (!append) {
        setLoading(true);
        setError(null);
      }

      const executeRequest = async (): Promise<SharedPage> => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const timeout = setTimeout(() => {
          controller.abort();
        }, FETCH_TIMEOUT_MS);

        try {
          const res = await fetch("/api/memory/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user: envelope,
              kind: resolvedKind,
              limit: enablePaging ? pageSize : initialLimit,
              cursor: enablePaging ? nextCursor : undefined,
            }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("Failed to fetch uploads");
          const json = (await res.json()) as { items?: MemoryUploadItem[] };
          const fetched = Array.isArray(json.items) ? json.items : [];
          const merged = append ? [...itemsRef.current, ...fetched] : fetched;
          const pageReturned = fetched.length;
          const nextHasMore = enablePaging && pageReturned >= pageSize;
          const lastCreated = fetched[fetched.length - 1]?.created_at;
          const nextPageCursor = typeof lastCreated === "string" ? lastCreated : null;
          return { items: merged, cursor: nextPageCursor, hasMore: nextHasMore };
        } finally {
          clearTimeout(timeout);
        }
      };

      const run = async (): Promise<SharedPage> => {
        if (!cacheKey || append) {
          return executeRequest();
        }
        const existing = sharedInFlight.get(cacheKey);
        if (existing) return existing;
        const promise = executeRequest().finally(() => {
          sharedInFlight.delete(cacheKey);
        });
        sharedInFlight.set(cacheKey, promise);
        return promise;
      };

      try {
        const result = await run();
        if (!mountedRef.current) return;
        itemsRef.current = result.items;
        setItems(result.items);
        cursorRef.current = result.cursor;
        setCursor(result.cursor);
        setHasMore(result.hasMore);
        if (cacheKey) {
          sharedCache.set(cacheKey, result);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "Request timed out. Please try again."
            : (err as Error)?.message || "Failed to load uploads";
        if (err instanceof DOMException && err.name === "AbortError") {
          // Ignore aborted fetches (e.g., on unmount or refresh).
        }
        setError(message);
        setHasMore(false);
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [cacheKey, enablePaging, envelope, initialLimit, pageSize, resolvedKind, user],
  );

  const refresh = React.useCallback(async () => {
    setCursor(null);
    cursorRef.current = null;
    await fetchPage({ append: false });
  }, [fetchPage]);

  const loadMore = React.useCallback(async () => {
    if (!enablePaging || loading || loadingMore || !hasMore) return;
    await fetchPage({ append: true });
  }, [enablePaging, fetchPage, hasMore, loading, loadingMore]);

  React.useEffect(() => {
    const hasSeed = cacheKey ? sharedCache.has(cacheKey) : Boolean(normalizedInitialPage);
    if (hasSeed) return;
    void refresh();
  }, [cacheKey, normalizedInitialPage, refresh]);

  return {
    user,
    envelope,
    items,
    setItems,
    loading,
    loadingMore,
    hasMore,
    error,
    setError,
    refresh,
    loadMore,
  };
}
