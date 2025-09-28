"use client";

import * as React from "react";
import styles from "./theme-style-carousel.module.css";

import {
  applyThemeVars,
  startPreviewThemeVars,
  endPreviewThemeVars,
  getStoredThemeVars,
  setTheme,
} from "@/lib/theme";
import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { useCurrentUser } from "@/services/auth/client";

type Preset = { id: string; title: string; desc?: string; vars: Record<string, string>; theme?: "light" | "dark" };
type SavedStyle = {
  id: string;
  title: string;
  summary?: string;
  vars: Record<string, string>;
  createdLabel?: string;
};

function builtInPresets(): Preset[] {
  return [
    {
      id: "light",
      title: "Light Mode",
      desc: "System light theme",
      vars: {},
      theme: "light",
    },
    {
      id: "dark",
      title: "Dark Mode",
      desc: "System dark theme",
      vars: {},
      theme: "dark",
    },
    {
      id: "aurora",
      title: "Aurora Glow",
      desc: "Vibrant purple-teal gradient",
      vars: {
        "--color-brand": "#8b5cf6",
        "--color-accent": "#22d3ee",
        "--gradient-brand": "linear-gradient(120deg,#8b5cf6 0%,#6366f1 55%,#22d3ee 100%)",
        "--cta-gradient": "linear-gradient(120deg,#7c3aed 0%,#6366f1 55%,#22d3ee 100%)",
        "--app-bg":
          "radial-gradient(1200px 720px at 0% 0%, rgba(139,92,246,0.18), transparent 60%), radial-gradient(1020px 680px at 100% 0%, rgba(34,211,238,0.14), transparent 62%), linear-gradient(90deg, rgba(139,92,246,0.12), rgba(99,102,241,0.06), rgba(5,10,27,0), rgba(34,211,238,0.06), rgba(34,211,238,0.12)), #050a1b",
      },
    },
    {
      id: "noir",
      title: "Midnight Noir",
      desc: "Deep navy + cyan",
      vars: {
        "--color-brand": "#38bdf8",
        "--color-accent": "#7dd3fc",
        "--cta-gradient": "linear-gradient(120deg,#0ea5e9 0%,#38bdf8 55%,#7dd3fc 100%)",
        "--gradient-brand": "linear-gradient(120deg,#1e3a8a 0%,#0ea5e9 55%,#38bdf8 100%)",
        "--glass-bg-1": "rgba(255,255,255,0.08)",
        "--glass-bg-2": "rgba(255,255,255,0.045)",
        "--card-bg-1": "rgba(17, 24, 39, 0.86)",
        "--card-bg-2": "rgba(17, 24, 39, 0.74)",
        "--card-border": "rgba(255,255,255,0.12)",
        "--card-shadow": "0 18px 40px rgba(2,6,23,0.5)",
        "--app-bg":
          "radial-gradient(1000px 640px at 10% 0%, rgba(2,132,199,0.14), transparent 60%), radial-gradient(880px 520px at 90% 0%, rgba(2,6,23,0.5), transparent 62%), linear-gradient(90deg, rgba(15,23,42,0.65), rgba(2,6,23,0.55), rgba(2,6,23,0.6)), #030814",
      },
    },
  ];
}

function buildPreviewStyle(vars: Record<string, string>): React.CSSProperties {
  const style: React.CSSProperties = {};
  Object.entries(vars).forEach(([k, v]) => {
    (style as unknown as Record<string, string>)[k] = v;
  });
  return style;
}

export function ThemeStyleCarousel() {
const { user, isLoaded } = useCurrentUser();
const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);
const envelopeSignature = React.useMemo(() => (envelope ? JSON.stringify(envelope) : "anon"), [envelope]);

const basePresets = React.useMemo(() => builtInPresets(), []);

const envelopeRef = React.useRef<typeof envelope>(envelope);
React.useEffect(() => {
  envelopeRef.current = envelope;
}, [envelope]);

const listRef = React.useRef<HTMLDivElement | null>(null);
const [menuOpenFor, setMenuOpenFor] = React.useState<string | null>(null);
const [headerMenuOpen, setHeaderMenuOpen] = React.useState(false);
const [loading, setLoading] = React.useState(false);
const [items, setItems] = React.useState<Array<{ kind: "preset"; preset: Preset } | { kind: "saved"; saved: SavedStyle }>>(
  () => basePresets.map((preset) => ({ kind: "preset", preset })),
);

const fetchSaved = React.useCallback(async () => {
  const envelopePayload = envelopeRef.current;
  if (!envelopePayload) {
    setItems(basePresets.map((preset) => ({ kind: "preset", preset })));
    return;
  }
  setLoading(true);
  try {
    const res = await fetch("/api/memory/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: "theme", user: envelopePayload }),
    });
    const json = (await res.json().catch(() => ({}))) as { items?: unknown[] };
    const saved: SavedStyle[] = Array.isArray(json.items)
      ? json.items
          .map((raw) => {
            const rec = raw as Record<string, unknown>;
            const id = typeof rec.id === "string" ? rec.id : null;
            const meta = (rec.meta as Record<string, unknown>) ?? {};
            const vars = (meta.vars as Record<string, string>) ?? {};
            if (!id || !vars || !Object.keys(vars).length) return null;
            return {
              id,
              title: (rec.title as string) || "Saved style",
              summary: (meta.summary as string) || "",
              vars,
              createdLabel: typeof rec.created_at === "string" ? rec.created_at : undefined,
            } as SavedStyle;
          })
          .filter(Boolean) as SavedStyle[]
      : [];
    const merged = [
      ...basePresets.map((preset) => ({ kind: "preset", preset }) as const),
      ...saved.map((saved) => ({ kind: "saved", saved }) as const),
    ];
    setItems(merged);
  } finally {
    setLoading(false);
  }
}, [basePresets]);

React.useEffect(() => {
  if (!isLoaded) return;
  fetchSaved();
}, [isLoaded, envelopeSignature, fetchSaved]);

  const scrollByPage = React.useCallback((dir: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    const amount = el.clientWidth || 0;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }, []);

  const onKeyDownTile = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      endPreviewThemeVars();
      (e.currentTarget as HTMLElement).blur();
      setMenuOpenFor(null);
    }
  }, []);

const handleApply = React.useCallback((entry: (typeof items)[number]) => {
  if (entry.kind === "preset") {
    if (entry.preset.theme) setTheme(entry.preset.theme);
    if (Object.keys(entry.preset.vars).length) applyThemeVars(entry.preset.vars);
    return;
  }
  applyThemeVars(entry.saved.vars);
}, []);

  const handleRename = React.useCallback(async (entry: (typeof items)[number]) => {
    if (entry.kind !== "saved") return;
    const current = entry.saved.title || "Saved style";
    const next = window.prompt("Rename theme", current)?.trim();
    if (!next || next === current) return;
    const res = await fetch("/api/memory/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: entry.saved.id, title: next, kind: "theme" }),
    });
    if (res.ok) fetchSaved();
  }, [fetchSaved]);

const handleDelete = React.useCallback(async (entry: (typeof items)[number]) => {
  if (entry.kind !== "saved") return;
  const res = await fetch("/api/memory/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ids: [entry.saved.id], kind: "theme", user: envelopeRef.current ?? {} }),
  });
  if (res.ok) fetchSaved();
}, [fetchSaved]);

  const handleDeleteAll = React.useCallback(async () => {
    if (!window.confirm("Delete all saved styles? This cannot be undone.")) return;
    await fetch("/api/memory/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: "theme", all: true }),
    });
    fetchSaved();
    setHeaderMenuOpen(false);
  }, [fetchSaved]);

const handleSaveCurrent = React.useCallback(async () => {
  const vars = getStoredThemeVars();
  if (!Object.keys(vars).length) {
    window.alert("No theme overrides to save yet.");
    return;
  }
  const title = window.prompt("Save theme as", "My theme")?.trim();
  if (!title) return;
  const res = await fetch("/api/memory/theme/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ title, summary: title, vars, user: envelopeRef.current ?? {} }),
  });
  if (res.ok) fetchSaved();
}, [fetchSaved]);

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div className={styles.lead}>Hover to preview. Apply to keep. Save for later.</div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btn} onClick={handleSaveCurrent}>
            Save current
          </button>
          <div className={styles.menuWrap}>
            <button
              type="button"
              className={styles.ellipsisBtn}
              aria-label="More actions"
              onClick={() => setHeaderMenuOpen((v) => !v)}
              aria-expanded={headerMenuOpen}
            >
              ...
            </button>
            {headerMenuOpen ? (
              <div className={styles.menu} role="menu" onMouseLeave={() => setHeaderMenuOpen(false)}>
                <button className={`${styles.menuItem} ${styles.danger}`.trim()} role="menuitem" onClick={handleDeleteAll}>
                  Delete all saved
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.carousel}>
        <button type="button" className={styles.btn} aria-label="Previous" onClick={() => scrollByPage(-1)}>
          {"<"}
        </button>
        <div className={styles.track} ref={listRef}>
          {items.map((entry) => {
            const id = entry.kind === "preset" ? `preset:${entry.preset.id}` : `saved:${entry.saved.id}`;
            const title = entry.kind === "preset" ? entry.preset.title : entry.saved.title;
            const desc = entry.kind === "preset" ? entry.preset.desc ?? "" : entry.saved.summary ?? "";
            const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
            const menuOpen = menuOpenFor === id;
            return (
              <div
                key={id}
                className={styles.slide}
                tabIndex={0}
                onMouseEnter={() => startPreviewThemeVars(vars)}
                onMouseLeave={() => endPreviewThemeVars()}
                onFocus={() => startPreviewThemeVars(vars)}
                onBlur={() => endPreviewThemeVars()}
                onKeyDown={onKeyDownTile}
              >
                <div className={styles.swatch} style={buildPreviewStyle(vars)} aria-hidden>
                  <div className={styles.swatchBg} />
                  <div className={styles.swatchCard} />
                </div>
                <div className={styles.itemHead}>
                  <div>
                    <div className={styles.itemTitle}>{title}</div>
                    {desc ? <div className={styles.meta}>{desc}</div> : null}
                  </div>
                  <div className={styles.menuWrap}>
                    <button
                      type="button"
                      className={styles.ellipsisBtn}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpenFor(menuOpen ? null : id)}
                      aria-label="Theme actions"
                    >
                      ...
                    </button>
                    {menuOpen ? (
                      <div className={styles.menu} role="menu" onMouseLeave={() => setMenuOpenFor(null)}>
                        <button
                          className={styles.menuItem}
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenFor(null);
                            handleApply(entry);
                          }}
                        >
                          Apply
                        </button>
                        {entry.kind === "saved" ? (
                          <>
                            <button
                              className={styles.menuItem}
                              role="menuitem"
                              onClick={() => {
                                setMenuOpenFor(null);
                                void handleRename(entry);
                              }}
                            >
                              Rename
                            </button>
                            <button
                              className={`${styles.menuItem} ${styles.danger}`.trim()}
                              role="menuitem"
                              onClick={() => {
                                setMenuOpenFor(null);
                                void handleDelete(entry);
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className={styles.actions}>
                  <button type="button" className={`${styles.btn} ${styles.btnPrimary}`.trim()} onClick={() => handleApply(entry)}>
                    Apply
                  </button>
                  {entry.kind === "saved" ? (
                    <>
                      <button type="button" className={styles.btn} onClick={() => void handleRename(entry)}>
                        Rename
                      </button>
                      <button type="button" className={styles.btn} onClick={() => void handleDelete(entry)}>
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className={styles.btn} aria-label="Next" onClick={() => scrollByPage(1)}>
          {">"}
        </button>
      </div>
      {loading ? <div className={styles.meta}>Loading…</div> : null}
      {!loading && items.length === 0 ? (
        <div className={styles.empty}>No themes yet. Try styling with Capsule AI.</div>
      ) : null}
    </div>
  );
}
