import * as React from "react";

import type { PrompterChipOption } from "@/components/prompter/hooks/usePrompterStageController";

const MAX_CLIENT_CHIPS = 4;
const CACHE_TTL_MS = 15 * 60 * 1000;

type CachedChipsEntry = {
  ts: number;
  user: string;
  chips: PrompterChipOption[];
};

function stableHash(input: string): number {
  return Array.from(input).reduce((acc, char) => Math.imul(acc ^ char.charCodeAt(0), 16777619), 0);
}

type UsePrompterChipsResult = {
  chips: PrompterChipOption[] | undefined;
  loading: boolean;
  error: string | null;
};

export function usePrompterChips(
  surface: string | null | undefined,
  fallback?: PrompterChipOption[],
  userId?: string | null,
): UsePrompterChipsResult {
  const userCacheKey = (userId ?? "anon").trim() || "anon";
  const seedRef = React.useRef<number>(stableHash(surface ?? "chips"));
  const [hydrated, setHydrated] = React.useState(false);
  const cacheKey = surface ? `prompter_chips:${surface}:${userCacheKey}` : null;

  const pickInitialChips = React.useCallback(
    (options?: PrompterChipOption[] | null): PrompterChipOption[] | undefined => {
      if (!options || !options.length) return undefined;
      const seen = new Set<string>();
      const deduped = options.filter((chip) => {
        const key = chip.id ?? chip.value ?? chip.label;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!deduped.length) return undefined;
      if (deduped.length <= MAX_CLIENT_CHIPS) return deduped;
      // Deterministic rotation by seed so refreshes feel fresh but stable per mount.
      const seed = seedRef.current;
      return [...deduped]
        .map((chip) => {
          const key = chip.id ?? chip.value ?? chip.label;
          const hash = Array.from(key ?? "").reduce((acc, char) => acc + char.charCodeAt(0), seed);
          return { chip, hash };
        })
        .sort((a, b) => b.hash - a.hash)
        .slice(0, MAX_CLIENT_CHIPS)
        .map((entry) => entry.chip);
    },
    [],
  );

  const readCachedChips = React.useCallback(() => {
    if (!cacheKey || typeof window === "undefined") return undefined;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as CachedChipsEntry | PrompterChipOption[] | null;
      const entry =
        parsed && !Array.isArray(parsed) && typeof parsed === "object" && "chips" in parsed
          ? (parsed as CachedChipsEntry)
          : null;
      const payload = entry?.chips ?? (Array.isArray(parsed) ? parsed : null);
      const ts = entry?.ts ?? null;
      const cacheUser = entry?.user ?? userCacheKey;
      if (!payload || cacheUser !== userCacheKey) return undefined;
      if (typeof ts === "number" && ts + CACHE_TTL_MS < Date.now()) {
        window.sessionStorage.removeItem(cacheKey);
        return undefined;
      }
      return pickInitialChips(payload ?? undefined);
    } catch {
      return undefined;
    }
  }, [cacheKey, pickInitialChips, userCacheKey]);

  const seedChips = React.useMemo(() => pickInitialChips(fallback), [fallback, pickInitialChips]);

  const [chips, setChips] = React.useState<PrompterChipOption[] | undefined>(() => seedChips);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Track client hydration to avoid reading sessionStorage during SSR render.
  React.useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
    }
  }, [hydrated]);

  React.useEffect(() => {
    seedRef.current = stableHash(surface ?? "chips");
  }, [surface]);

  // Keep state aligned when surface changes before the fetch resolves.
  React.useEffect(() => {
    setChips((prev) => {
      if (!hydrated) return pickInitialChips(fallback);
      const cached = readCachedChips();
      if (cached) return cached;
      // Preserve previous chips when already set and no cache is available to reduce flicker.
      return prev ?? pickInitialChips(fallback);
    });
  }, [cacheKey, fallback, hydrated, pickInitialChips, readCachedChips]);

  React.useEffect(() => {
    if (!surface || !hydrated) return;
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/prompter/chips?surface=${encodeURIComponent(surface)}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`chips request failed (${response.status})`);
        }
        const payload = (await response.json()) as { chips?: PrompterChipOption[] } | null;
        if (!cancelled && payload?.chips) {
          setChips(payload.chips);
          if (cacheKey && typeof window !== "undefined") {
            try {
              const cached: CachedChipsEntry = {
                ts: Date.now(),
                user: userCacheKey,
                chips: payload.chips,
              };
              window.sessionStorage.setItem(cacheKey, JSON.stringify(cached));
            } catch {
              /* ignore cache write failures */
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted || cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load chips");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cacheKey, surface, hydrated, userCacheKey]);

  return { chips, loading, error };
}
