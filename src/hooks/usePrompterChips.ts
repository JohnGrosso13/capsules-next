import * as React from "react";

import type { PrompterChipOption } from "@/components/prompter/hooks/usePrompterStageController";

const MAX_CLIENT_CHIPS = 4;

type UsePrompterChipsResult = {
  chips: PrompterChipOption[] | undefined;
  loading: boolean;
  error: string | null;
};

export function usePrompterChips(
  surface: string | null | undefined,
  fallback?: PrompterChipOption[],
): UsePrompterChipsResult {
  const seedRef = React.useRef<number>(Math.floor(Date.now() / 1000));
  const cacheKey = surface ? `prompter_chips:${surface}` : null;

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
      const parsed = JSON.parse(raw) as PrompterChipOption[] | null;
      return pickInitialChips(parsed ?? undefined);
    } catch {
      return undefined;
    }
  }, [cacheKey, pickInitialChips]);

  const seedChips = React.useMemo(
    () => readCachedChips() ?? pickInitialChips(fallback),
    [fallback, pickInitialChips, readCachedChips],
  );

  const [chips, setChips] = React.useState<PrompterChipOption[] | undefined>(seedChips);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Keep state aligned when surface changes before the fetch resolves.
  React.useEffect(() => {
    setChips(readCachedChips() ?? pickInitialChips(fallback));
  }, [cacheKey, fallback, pickInitialChips, readCachedChips]);

  React.useEffect(() => {
    if (!surface) return;
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
              window.sessionStorage.setItem(cacheKey, JSON.stringify(payload.chips));
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
  }, [cacheKey, surface]);

  return { chips, loading, error };
}
