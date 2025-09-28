"use client";

import * as React from "react";
import type { AuthClientUser } from "@/ports/auth-client";
import { useCurrentUser } from "@/services/auth/client";

import { applyThemeVars, clearThemeVars, getStoredThemeVars } from "@/lib/theme";

import panelStyles from "./saved-styles-panel.module.css";

type SavedStyle = {
  id: string;
  title: string;
  summary: string;
  prompt: string;
  createdAt: string;
  createdLabel: string;
  source: "heuristic" | "ai" | "unknown";
  vars: Record<string, string>;
  keyCount: number;
};

type MemoryEnvelope = Record<string, unknown>;

type MemoryListResponse = {
  items?: unknown[];
};

function normalizeVarMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const map: Record<string, string> = {};
  Object.entries(input as Record<string, unknown>).forEach(([rawKey, rawValue]) => {
    if (typeof rawKey !== "string") return;
    const key = rawKey.trim();
    if (!key.startsWith("--") || key.length > 80) return;
    if (typeof rawValue !== "string") return;
    const value = rawValue.trim();
    if (!value || value.length > 400) return;
    map[key] = value;
  });
  return map;
}

function formatTimestamp(value: string): string {
  try {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "";
  }
}

function truncate(text: string, limit: number): string {
  if (!text) return "";
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}...`;
}

function normalizeStyles(items: unknown[] | undefined): SavedStyle[] {
  if (!Array.isArray(items)) return [];
  const result: SavedStyle[] = [];
  items.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    const idRaw = record.id ?? record.uuid ?? record.item_id ?? record.memory_id;
    const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : null;
    if (!id) return;
    const meta = (record.meta as Record<string, unknown> | undefined) ?? {};
    const vars = normalizeVarMap(meta.vars);
    const summary =
      typeof meta.summary === "string" && meta.summary.trim()
        ? meta.summary.trim()
        : typeof record.description === "string" && record.description.trim()
          ? (record.description as string).trim()
          : "";
    const prompt = typeof meta.prompt === "string" ? meta.prompt.trim() : "";
    const rawTitle = typeof record.title === "string" ? record.title.trim() : "";
    const title = rawTitle || summary || (prompt ? truncate(prompt, 40) : "Saved style");
    const createdAt =
      typeof record.created_at === "string" ? record.created_at : new Date().toISOString();
    const createdLabel = formatTimestamp(createdAt);
    const sourceRaw = typeof meta.source === "string" ? meta.source.toLowerCase() : "";
    const source =
      sourceRaw === "heuristic" || sourceRaw === "ai"
        ? (sourceRaw as "heuristic" | "ai")
        : "unknown";
    result.push({
      id,
      title,
      summary,
      prompt,
      createdAt,
      createdLabel,
      source,
      vars,
      keyCount: Object.keys(vars).length,
    });
  });
  return result;
}

function buildUserEnvelope(user: AuthClientUser | null): MemoryEnvelope | null {
  if (!user) return null;
  const fullName = user.name ?? user.email ?? null;
  return {
    clerk_id: user.provider === "clerk" ? user.id : null,
    email: user.email ?? null,
    full_name: fullName,
    avatar_url: user.avatarUrl ?? null,
    provider: user.provider ?? "guest",
    key: user.key ?? (user.provider === "clerk" ? `clerk:${user.id}` : user.id),
  };
}

function sourceLabel(source: SavedStyle["source"]): string {
  if (source === "ai") return "Capsule AI";
  if (source === "heuristic") return "Quick heuristics";
  return "Imported";
}

export function SavedStylesPanel() {
  const { user, isLoaded } = useCurrentUser();
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const envelope = React.useMemo(() => (user ? buildUserEnvelope(user) : null), [user]);

  const [savedStyles, setSavedStyles] = React.useState<SavedStyle[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [currentVars, setCurrentVars] = React.useState<Record<string, string>>(() =>
    getStoredThemeVars(),
  );
  const [applyingId, setApplyingId] = React.useState<string | null>(null);

  const refreshCurrentVars = React.useCallback(() => {
    setCurrentVars(getStoredThemeVars());
  }, []);

  const fetchStyles = React.useCallback(async () => {
    if (!envelope) {
      if (mountedRef.current) {
        setSavedStyles([]);
        setLoading(false);
      }
      return;
    }
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
      setStatus(null);
    }
    try {
      const response = await fetch("/api/memory/list", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "theme", user: envelope }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Request failed (${response.status})`);
      }
      const payload = (await response.json().catch(() => ({}))) as MemoryListResponse;
      if (!mountedRef.current) return;
      const normalized = normalizeStyles(payload.items);
      setSavedStyles(normalized);
      if (!normalized.length) {
        setStatus("Ask Capsule AI to style something to save it here.");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Saved styles fetch error", err);
      setError(err instanceof Error ? err.message : "Couldn't load saved styles.");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [envelope]);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!envelope) {
      setSavedStyles([]);
      setLoading(false);
      return;
    }
    fetchStyles();
  }, [isLoaded, envelope, fetchStyles]);

  React.useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const hasStoredVars = React.useMemo(() => Object.keys(currentVars).length > 0, [currentVars]);

  const handleApply = React.useCallback(
    async (style: SavedStyle) => {
      if (!style.keyCount) {
        setStatus("That saved style doesn't include any changes yet.");
        return;
      }
      setError(null);
      setApplyingId(style.id);
      try {
        applyThemeVars(style.vars);
        refreshCurrentVars();
        setStatus(`Applied "${style.title}".`);
      } catch (err) {
        console.error("Apply saved style error", err);
        setStatus("Couldn't apply that style right now.");
      } finally {
        setApplyingId(null);
      }
    },
    [refreshCurrentVars],
  );

  const handleReset = React.useCallback(() => {
    setError(null);
    try {
      clearThemeVars();
      refreshCurrentVars();
      setStatus("Cleared saved theme overrides.");
    } catch (err) {
      console.error("Clear theme vars error", err);
      setStatus("Couldn't clear overrides.");
    }
  }, [refreshCurrentVars]);

  const handleDelete = React.useCallback(
    async (style: SavedStyle) => {
      if (!envelope) {
        setStatus("Please sign in to delete saved styles.");
        return;
      }
      setApplyingId(style.id);
      try {
        const res = await fetch("/api/memory/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids: [style.id], kind: "theme", user: envelope }),
        });
        if (!res.ok) throw new Error(await res.text());
        setSavedStyles((prev) => prev.filter((s) => s.id !== style.id));
        setStatus("Deleted style.");
      } catch (err) {
        console.error("Delete saved style error", err);
        setStatus("Couldn't delete that style.");
      } finally {
        setApplyingId(null);
      }
    },
    [envelope],
  );

  const buildPreviewStyle = React.useCallback((vars: Record<string, string>) => {
    const style: React.CSSProperties = {};
    Object.entries(vars).forEach(([k, v]) => {
      try {
        (style as unknown as Record<string, string>)[k] = v;
      } catch {}
    });
    return style;
  }, []);

  return (
    <div className={panelStyles.panel}>
      <div className={panelStyles.headerRow}>
        <p className={panelStyles.lead}>
          Every time you ask Capsule AI to restyle the app we save the result. Reapply a look or
          start from a fresh canvas.
        </p>
        <div className={panelStyles.actions}>
          <button
            type="button"
            className={panelStyles.actionBtn}
            onClick={fetchStyles}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className={`${panelStyles.actionBtn} ${panelStyles.primaryBtn}`.trim()}
            onClick={handleReset}
            disabled={!hasStoredVars}
          >
            Reset theme
          </button>
        </div>
      </div>
      {status ? <p className={panelStyles.status}>{status}</p> : null}
      {error ? <p className={panelStyles.error}>{error}</p> : null}
      {loading ? (
        <div className={panelStyles.empty}>Loading saved styles...</div>
      ) : savedStyles.length ? (
        <ul className={panelStyles.list}>
          {savedStyles.map((style) => {
            const isActive =
              style.keyCount > 0 &&
              Object.entries(style.vars).every(([key, value]) => currentVars[key] === value);
            const metaParts: string[] = [];
            if (style.createdLabel) metaParts.push(`Saved ${style.createdLabel}`);
            metaParts.push(`${style.keyCount} ${style.keyCount === 1 ? "variable" : "variables"}`);
            return (
              <li key={style.id} className={panelStyles.item} data-active={isActive || undefined}>
                <div
                  className={panelStyles.swatch}
                  style={buildPreviewStyle(style.vars)}
                  aria-hidden
                >
                  <div className={panelStyles.swatchBg} />
                  <div className={panelStyles.swatchCard} />
                </div>
                <div className={panelStyles.itemHead}>
                  <div className={panelStyles.titleWrap}>
                    <h3 className={panelStyles.itemTitle}>{style.title}</h3>
                    <div className={panelStyles.itemMeta}>{metaParts.join(" | ")}</div>
                  </div>
                  <div className={panelStyles.actionsInline}>
                    <button
                      type="button"
                      className={panelStyles.applyBtn}
                      onClick={() => handleApply(style)}
                      disabled={applyingId === style.id || isActive}
                    >
                      {applyingId === style.id ? "Applying..." : isActive ? "Active" : "Apply"}
                    </button>
                    <button
                      type="button"
                      className={`${panelStyles.ghostBtn} ${panelStyles.dangerBtn}`.trim()}
                      onClick={() => handleDelete(style)}
                      disabled={applyingId === style.id}
                      aria-label="Delete saved style"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {style.summary ? (
                  <p className={panelStyles.summary}>{truncate(style.summary, 140)}</p>
                ) : null}
                {style.prompt ? (
                  <p className={panelStyles.prompt}>
                    Prompt: &quot;{truncate(style.prompt, 120)}&quot;
                  </p>
                ) : null}
                <div className={panelStyles.tagRow}>
                  <span className={panelStyles.varBadge}>{style.keyCount} vars</span>
                  <span className={panelStyles.varBadge}>{sourceLabel(style.source)}</span>
                  {isActive ? (
                    <span className={`${panelStyles.varBadge} ${panelStyles.activeBadge}`.trim()}>
                      Active
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={panelStyles.empty}>
          No saved styles yet. Try &quot;Style my capsule like winter&quot; to get started.
        </div>
      )}
    </div>
  );
}
