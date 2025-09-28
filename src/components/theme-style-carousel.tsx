"use client";

import * as React from "react";
import styles from "./theme-style-carousel.module.css";
import promo from "./promo-row.module.css";
import { Button } from "@/components/ui/button";

import {
  applyThemeVars,
  startPreviewThemeVars,
  endPreviewThemeVars,
  getStoredThemeVars,
  setTheme,
} from "@/lib/theme";
import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { useCurrentUser } from "@/services/auth/client";

type Preset = {
  id: string;
  title: string;
  desc?: string;
  vars: Record<string, string>;
  theme?: "light" | "dark";
};

type SavedStyle = {
  id: string;
  title: string;
  summary?: string;
  description?: string;
  vars: Record<string, string>;
  createdLabel?: string;
};

type ThemeEntry = { kind: "preset"; preset: Preset } | { kind: "saved"; saved: SavedStyle };

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
  Object.entries(vars).forEach(([key, value]) => {
    (style as unknown as Record<string, string>)[key] = value;
  });
  return style;
}

function getEntryId(entry: ThemeEntry): string {
  return entry.kind === "preset" ? `preset:${entry.preset.id}` : `saved:${entry.saved.id}`;
}

export function ThemeStyleCarousel() {
  const { user, isLoaded } = useCurrentUser();
  const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);
  const envelopeSignature = React.useMemo(
    () => (envelope ? JSON.stringify(envelope) : "anon"),
    [envelope],
  );

  const basePresets = React.useMemo(() => builtInPresets(), []);

  const envelopeRef = React.useRef(envelope);
  React.useEffect(() => {
    envelopeRef.current = envelope;
  }, [envelope]);

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<ThemeEntry[]>(() =>
    basePresets.map((preset) => ({ kind: "preset", preset })),
  );
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const updateScrollState = React.useCallback(() => {
    const el = listRef.current;
    if (!el) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollByPage = React.useCallback(
    (dir: 1 | -1) => {
      const el = listRef.current;
      if (!el) return;
      const amount = el.clientWidth || 0;
      el.scrollBy({ left: dir * (amount * 0.95), behavior: "smooth" });
      window.setTimeout(updateScrollState, 320);
    },
    [updateScrollState],
  );

  const fetchSaved = React.useCallback(async () => {
    const envelopePayload = envelopeRef.current;
    if (!envelopePayload) {
      setItems(basePresets.map((preset) => ({ kind: "preset", preset })));
      window.requestAnimationFrame(updateScrollState);
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
              const titleRaw = typeof rec.title === "string" ? rec.title.trim() : "";
              const metaSummary = typeof meta.summary === "string" ? (meta.summary as string).trim() : "";
              const prompt = typeof meta.prompt === "string" ? (meta.prompt as string).trim() : "";
              const summary = titleRaw || metaSummary;
              const title = summary || prompt || "Saved theme";
              return {
                id,
                title,
                summary,
                description: summary || prompt,
                vars,
                createdLabel: typeof rec.created_at === "string" ? rec.created_at : undefined,
              } as SavedStyle;
            })
            .filter(Boolean) as SavedStyle[]
        : [];
      const merged: ThemeEntry[] = [
        ...basePresets.map((preset) => ({ kind: "preset", preset } as ThemeEntry)),
        ...saved.map((saved) => ({ kind: "saved", saved } as ThemeEntry)),
      ];
      setItems(merged);
      window.requestAnimationFrame(updateScrollState);
    } finally {
      setLoading(false);
    }
  }, [basePresets, updateScrollState]);

  React.useEffect(() => {
    if (!isLoaded) return;
    fetchSaved();
  }, [isLoaded, envelopeSignature, fetchSaved]);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => updateScrollState();
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    resizeObserver?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resizeObserver?.disconnect();
    };
  }, [updateScrollState, items.length]);

  const stopPreview = React.useCallback(() => {
    endPreviewThemeVars();
    setPreviewingId(null);
  }, []);

  const onKeyDownTile = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        stopPreview();
        (event.currentTarget as HTMLElement).blur();
      }
    },
    [stopPreview],
  );

  const handleApply = React.useCallback(
    (entry: ThemeEntry) => {
      stopPreview();
      const id = getEntryId(entry);
      setActiveId(id);
      if (entry.kind === "preset") {
        if (entry.preset.theme) setTheme(entry.preset.theme);
        if (Object.keys(entry.preset.vars).length) applyThemeVars(entry.preset.vars);
      } else {
        applyThemeVars(entry.saved.vars);
      }
    },
    [stopPreview],
  );

  const togglePreview = React.useCallback(
    (entry: ThemeEntry) => {
      const id = getEntryId(entry);
      if (previewingId === id) {
        stopPreview();
        return;
      }
      stopPreview();
      const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
      if (Object.keys(vars).length) {
        startPreviewThemeVars(vars);
        setPreviewingId(id);
      }
    },
    [previewingId, stopPreview],
  );

  React.useEffect(() => () => endPreviewThemeVars(), []);

  const handleRename = React.useCallback(
    async (entry: ThemeEntry) => {
      if (entry.kind !== "saved") return;
      const current = entry.saved.title || "Saved theme";
      const next = window.prompt("Rename theme", current)?.trim();
      if (!next || next === current) return;
      const res = await fetch("/api/memory/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: entry.saved.id, title: next, kind: "theme" }),
      });
      if (res.ok) fetchSaved();
    },
    [fetchSaved],
  );

  const handleDelete = React.useCallback(
    async (entry: ThemeEntry) => {
      if (entry.kind !== "saved") return;
      stopPreview();
      const id = getEntryId(entry);
      const res = await fetch("/api/memory/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [entry.saved.id], kind: "theme", user: envelopeRef.current ?? {} }),
      });
      if (res.ok) {
        if (activeId === id) setActiveId(null);
        fetchSaved();
      }
    },
    [fetchSaved, stopPreview, activeId],
  );

  const handleDeleteAll = React.useCallback(async () => {
    if (!window.confirm("Delete all saved styles? This cannot be undone.")) return;
    stopPreview();
    await fetch("/api/memory/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: "theme", all: true }),
    });
    setActiveId(null);
    fetchSaved();
    setHeaderMenuOpen(false);
  }, [fetchSaved, stopPreview]);

  const handleSaveCurrent = React.useCallback(async () => {
    const vars = getStoredThemeVars();
    if (!Object.keys(vars).length) {
      window.alert("No theme overrides to save yet.");
      return;
    }
    const title = window.prompt("Save theme as", "My theme")?.trim();
    if (!title) return;
    stopPreview();
    const res = await fetch("/api/memory/theme/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, summary: title, vars, user: envelopeRef.current ?? {} }),
    });
    if (res.ok) fetchSaved();
  }, [fetchSaved, stopPreview]);

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div className={styles.lead}>Preview before you apply. Your saved looks live here.</div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={handleSaveCurrent}>
            Save current
          </Button>
          <div className={styles.headerMenu}>
            <button
              type="button"
              className={styles.ellipsisBtn}
              aria-label="More theme actions"
              aria-expanded={headerMenuOpen}
              onClick={() => setHeaderMenuOpen((value) => !value)}
            >
              …
            </button>
            {headerMenuOpen ? (
              <div className={styles.menu} role="menu" onMouseLeave={() => setHeaderMenuOpen(false)}>
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuDanger}`.trim()}
                  role="menuitem"
                  onClick={handleDeleteAll}
                >
                  Delete all saved
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.carousel}>
        {canLeft ? (
          <div className={`${styles.navOverlay} ${styles.navLeft}`.trim()}>
            <button
              type="button"
              className={styles.navArrow}
              aria-label="Scroll left"
              onClick={() => scrollByPage(-1)}
            >
              {"<"}
            </button>
          </div>
        ) : null}
        <div className={styles.track} ref={listRef}>
          {items.map((entry) => {
            const id = getEntryId(entry);
            const title = entry.kind === "preset" ? entry.preset.title : entry.saved.title;
            const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
            const descriptionRaw =
              entry.kind === "preset" ? entry.preset.desc : entry.saved.description;
            const description =
              descriptionRaw && descriptionRaw.trim().length
                ? descriptionRaw
                : "Capsule AI custom theme";
            const isPreviewing = previewingId === id;
            const isActive = activeId === id;
            return (
              <div key={id} className={styles.slide}>
                <div
                  className={`${promo.tile} ${isActive ? styles.activeTile : ""}`.trim()}
                  tabIndex={0}
                  onKeyDown={onKeyDownTile}
                >
                  <div className={styles.tileHeader}>
                    <div className={styles.tileTitle}>{title}</div>
                    <div className={styles.tileBadge}>{entry.kind === "saved" ? "Saved" : "Preset"}</div>
                  </div>
                  <div
                    className={`${promo.short} ${styles.previewHalf}`.trim()}
                    style={buildPreviewStyle(vars)}
                    aria-hidden
                  >
                    <div className={styles.swatchBg} />
                    <div className={styles.swatchCard} />
                    {isActive ? <span className={styles.activeBadge}>Active</span> : null}
                  </div>
                  <div className={styles.descArea}>{description}</div>
                  <div className={styles.buttonRow}>
                    <Button variant="secondary" size="sm" onClick={() => togglePreview(entry)}>
                      {isPreviewing ? "End preview" : "Preview"}
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => handleApply(entry)}>
                      Apply
                    </Button>
                  </div>
                  {entry.kind === "saved" ? (
                    <div className={styles.manageRow}>
                      <button type="button" className={styles.manageLink} onClick={() => handleRename(entry)}>
                        Rename
                      </button>
                      <button type="button" className={styles.manageLink} onClick={() => handleDelete(entry)}>
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {canRight ? (
          <div className={`${styles.navOverlay} ${styles.navRight}`.trim()}>
            <button
              type="button"
              className={styles.navArrow}
              aria-label="Scroll right"
              onClick={() => scrollByPage(1)}
            >
              {">"}
            </button>
          </div>
        ) : null}
      </div>
      {loading ? <div className={styles.meta}>Loading…</div> : null}
      {!loading && items.length === 0 ? (
        <div className={styles.empty}>No themes yet. Ask Capsule AI to style your capsule.</div>
      ) : null}
    </div>
  );
}
