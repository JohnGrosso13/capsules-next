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
const DEBOUNCE_DELAY_MS = 60;
const MIN_QUERY_LENGTH = 1;
const MIN_MEMORY_QUERY = 5;
const FAST_SCOPES: Array<"users" | "capsules"> = ["users", "capsules"];
const FULL_SCOPES: Array<"users" | "capsules" | "memories" | "capsule_records"> = [
  "users",
  "capsules",
  "memories",
  "capsule_records",
];
const MEMORY_HINT_KEYWORDS = new Set([
  "photo",
  "photos",
  "pic",
  "pics",
  "picture",
  "pictures",
  "video",
  "videos",
  "clip",
  "clips",
  "file",
  "files",
  "doc",
  "docs",
  "document",
  "documents",
  "post",
  "posts",
  "story",
  "stories",
  "birthday",
  "anniversary",
  "holiday",
  "party",
  "vacation",
  "trip",
  "yesterday",
  "today",
  "last",
  "week",
  "month",
  "year",
  "record",
  "recording",
  "audio",
  "image",
  "images",
  "memory",
  "memories",
  "poll",
  "polls",
  "vote",
  "votes",
  "voting",
  "survey",
  "ballot",
]);
const METRICS_ENABLED = process.env.NODE_ENV === "development";
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

type SearchIntent = {
  allowFull: boolean;
  fullScopes: typeof FULL_SCOPES | typeof FAST_SCOPES;
  fullDelayMs: number;
  memoryLikely: boolean;
};

function resolveIntent(query: string): SearchIntent {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const hasMemoryKeyword =
    tokens.some((t) => MEMORY_HINT_KEYWORDS.has(t)) || query.includes("?");
  const memoryLikely = hasMemoryKeyword || tokens.length >= 2;

  const allowFull = query.length >= MIN_MEMORY_QUERY;
  const fullScopes = allowFull ? FULL_SCOPES : FAST_SCOPES;
  const fullDelayMs = memoryLikely ? 120 : 180;

  return { allowFull, fullScopes, fullDelayMs, memoryLikely };
}

function logMetric(event: string, detail: Record<string, unknown>) {
  if (!METRICS_ENABLED) return;
  const payload = { event, ...detail };
  console.info("search-metric", payload);
}

function normalizeToken(value: string): string | null {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9#@]/g, "");
  if (!cleaned.length) return null;
  if (cleaned.length >= 3 || /\d/.test(cleaned)) return cleaned;
  return null;
}

function singularizeToken(token: string): string | null {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return null;
}

function tokenizeQuery(query: string): string[] {
  const tokens = new Set<string>();
  query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const normalized = normalizeToken(token);
      if (!normalized) return;
      tokens.add(normalized);
      const singular = singularizeToken(normalized);
      if (singular) tokens.add(singular);
    });
  return Array.from(tokens);
}

function scoreMatch(haystack: string | null | undefined, needle: string): number {
  if (!haystack) return 0;
  const lower = haystack.toLowerCase();
  if (lower === needle) return 10;
  if (lower.startsWith(needle)) return 6;
  if (lower.includes(needle)) return 3;
  return 0;
}

function rerankSections(sections: GlobalSearchSection[], query: string): GlobalSearchSection[] {
  const needle = query.toLowerCase();
  const tokens = tokenizeQuery(query);
  if (!needle) return sections;

  const rerankUsers = (items: UserSearchResult[]) => {
    return items
      .map((user) => {
        const score = Math.max(scoreMatch(user.name, needle), scoreMatch(user.userKey, needle));
        return { item: user, score };
      })
      .sort((a, b) => b.score - a.score);
  };

  const rerankCapsules = (items: CapsuleSearchResult[]) => {
    return items
      .map((capsule) => {
        const score = Math.max(scoreMatch(capsule.name, needle), scoreMatch(capsule.slug, needle));
        return { item: capsule, score };
      })
      .sort((a, b) => b.score - a.score);
  };

  const rerankMemories = (items: MemorySearchResult[]) => {
    const scoreTokenMatches = (haystack: string | null | undefined): number => {
      if (!haystack || !tokens.length) return 0;
      const lower = haystack.toLowerCase();
      let score = 0;
      tokens.forEach((token) => {
        if (!token) return;
        if (lower === token) {
          score += 8;
        } else if (lower.startsWith(token)) {
          score += 5;
        } else if (lower.includes(token)) {
          score += 3;
        }
      });
      return score;
    };

    const scoreMetaHints = (memory: MemorySearchResult): number => {
      const meta = (memory.meta ?? {}) as Record<string, unknown>;
      let score = 0;

      const tags = Array.isArray(meta.summary_tags) ? (meta.summary_tags as unknown[]) : [];
      tags.forEach((tag) => {
        if (typeof tag === "string") {
          score += scoreTokenMatches(tag);
        }
      });

      const entities =
        meta.summary_entities && typeof meta.summary_entities === "object"
          ? (meta.summary_entities as Record<string, unknown>)
          : null;
      if (entities) {
        Object.values(entities).forEach((value) => {
          if (Array.isArray(value)) {
            value.forEach((entry) => {
              if (typeof entry === "string") {
                score += scoreTokenMatches(entry);
              }
            });
          }
        });
      }

      return score;
    };

    return items
      .map((memory) => {
        const baseScore = Math.max(
          scoreMatch(memory.title ?? null, needle),
          scoreMatch(memory.description ?? null, needle),
        );
        const tokenScore =
          scoreTokenMatches(memory.title ?? null) + scoreTokenMatches(memory.description ?? null);
        const metaScore = scoreMetaHints(memory);
        const serverScore = typeof memory.relevanceScore === "number" ? memory.relevanceScore : 0;
        const score = baseScore + tokenScore + metaScore + serverScore * 10;
        return { item: memory, score };
      })
      .sort((a, b) => b.score - a.score);
  };

  return sections.map((section) => {
    if (section.type === "users") {
      const ranked = rerankUsers(section.items);
      return { type: "users", items: ranked.map((r) => r.item) };
    }
    if (section.type === "capsules") {
      const ranked = rerankCapsules(section.items);
      return { type: "capsules", items: ranked.map((r) => r.item) };
    }
    if (section.type === "memories") {
      const ranked = rerankMemories(section.items);
      return { type: "memories", items: ranked.map((r) => r.item) };
    }
    return { type: "capsule_records", items: section.items };
  });
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
  const quickAbortRef = useRef<AbortController | null>(null);
  const fullAbortRef = useRef<AbortController | null>(null);
  const fullTimerRef = useRef<number | null>(null);
  const cacheRef = useRef<Map<string, GlobalSearchSection[]>>(new Map());
  const zeroPrefetchRef = useRef(false);
  const overlayPointerDownRef = useRef(false);
  const selectionHandlerRef = useRef<SearchOpenDetail["onSelect"] | null>(null);
  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const intent = useMemo(() => resolveIntent(trimmedQuery), [trimmedQuery]);

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
    if (zeroPrefetchRef.current) return;
    zeroPrefetchRef.current = true;
    (async () => {
      try {
        const response = await fetch("/api/search/quick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: "", limit: 12 }),
        });
        if (!response.ok) return;
        const data = (await response.json()) as GlobalSearchResponse;
        cacheRef.current.set(FAST_SCOPES.join(",") + "::", normalizeSections(data.sections));
      } catch {
        // ignore prefetch errors
      }
    })().catch(() => undefined);
  }, [open]);

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
      quickAbortRef.current?.abort();
      fullAbortRef.current?.abort();
      if (fullTimerRef.current) window.clearTimeout(fullTimerRef.current);
      fullTimerRef.current = null;
      setSections([]);
      setLoading(false);
      setError(null);
      return;
    }

    const cacheKey = (scopes: string[]) => `${scopes.join(",")}::${trimmedQuery.toLowerCase()}`;

    const getCached = (scopes: string[]) => {
      const key = cacheKey(scopes);
      const cached = cacheRef.current.get(key);
      if (cached) {
        setSections(cached);
        return true;
      }
      return false;
    };

    const setCache = (scopes: string[], nextSections: GlobalSearchSection[]) => {
      cacheRef.current.set(cacheKey(scopes), nextSections);
    };

    const runQuick = async () => {
      const controller = new AbortController();
      quickAbortRef.current?.abort();
      quickAbortRef.current = controller;
      const fastPathScopes = FAST_SCOPES;
      const cacheHit = getCached(fastPathScopes);
      setLoading(true);
      setError(null);
      const started = typeof performance !== "undefined" ? performance.now() : 0;
      try {
        const response = await fetch("/api/search/quick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: trimmedQuery, limit: 12 }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401) {
            setError("You need to be signed in to search.");
          } else {
            setError("Search failed. Please try again.");
          }
          if (!cacheHit) setSections([]);
          return;
        }
        const data = (await response.json()) as GlobalSearchResponse;
        const nextSections = rerankSections(normalizeSections(data.sections), trimmedQuery);
        setCache(fastPathScopes, nextSections);
        setSections(nextSections);
        if (started) {
          logMetric("quick", {
            durationMs: Math.round((performance.now() - started) * 100) / 100,
            cacheHit,
            qlen: trimmedQuery.length,
          });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError("Search request was interrupted. Try again.");
        if (!cacheHit) setSections([]);
      } finally {
        if (!intent.allowFull) {
          setLoading(false);
        }
      }
    };

    const runFull = async () => {
      if (!intent.allowFull) {
        // no full search for very short terms
        setLoading(false);
        return;
      }
      const controller = new AbortController();
      fullAbortRef.current?.abort();
      fullAbortRef.current = controller;
      const fullScopes = FULL_SCOPES;
      const cacheHit = getCached(fullScopes);
      const started = typeof performance !== "undefined" ? performance.now() : 0;
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
          body: JSON.stringify({
            q: trimmedQuery,
            limit: 24,
            capsuleId: activeCapsuleId,
            scopes: fullScopes,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            setError("You need to be signed in to search.");
          } else {
            setError("Search failed. Please try again.");
          }
          if (!cacheHit) setSections([]);
        } else {
          const data = (await response.json()) as GlobalSearchResponse;
          const nextSections = rerankSections(normalizeSections(data.sections), trimmedQuery);
          setCache(fullScopes, nextSections);
          setSections(nextSections);
          if (started) {
            logMetric("full", {
              durationMs: Math.round((performance.now() - started) * 100) / 100,
              cacheHit,
              qlen: trimmedQuery.length,
              memory: intent.memoryLikely,
            });
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError("Search request was interrupted. Try again.");
        if (!cacheHit) setSections([]);
      } finally {
        setLoading(false);
      }
    };

    const timer = window.setTimeout(() => {
      runQuick().catch(() => undefined);
      if (fullTimerRef.current) {
        window.clearTimeout(fullTimerRef.current);
      }
      fullTimerRef.current = window.setTimeout(() => {
        runFull().catch(() => undefined);
      }, intent.fullDelayMs);
    }, DEBOUNCE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      if (fullTimerRef.current) {
        window.clearTimeout(fullTimerRef.current);
      }
      quickAbortRef.current?.abort();
      fullAbortRef.current?.abort();
    };
  }, [close, intent.allowFull, intent.fullDelayMs, intent.memoryLikely, open, trimmedQuery]);

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
    if (!postId) return null;

    const meta = (item.meta ?? {}) as Record<string, unknown>;
    const capsuleIdCandidates = [meta.owner_capsule_id, meta.capsule_id, meta.capsuleId];
    const capsuleId = capsuleIdCandidates.find(
      (candidate) => typeof candidate === "string" && candidate.trim().length,
    ) as string | undefined;

    if (capsuleId) {
      return `/capsule?capsuleId=${encodeURIComponent(capsuleId)}&postId=${encodeURIComponent(postId)}`;
    }
    return `/home?postId=${encodeURIComponent(postId)}`;
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
    const fallbackUrl =
      navigateUrl ??
      (postIdForLightbox ? `/home?postId=${encodeURIComponent(postIdForLightbox)}` : null);
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
            const pathname =
              typeof window === "undefined" ? null : window.location?.pathname ?? null;
            const lightboxReadyContext =
              pathname?.startsWith("/home") || pathname?.startsWith("/capsule");
            if (!lightboxReadyContext && fallbackUrl) {
              handleNavigate(fallbackUrl);
            }
          } else {
            handleNavigate(fallbackUrl);
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
              Enter at least {MIN_QUERY_LENGTH} character to search.
            </span>
          ) : null}
        </div>
        <div className={styles.results}>{sections.map((section) => renderSection(section))}</div>
      </div>
    </div>
  );
}
