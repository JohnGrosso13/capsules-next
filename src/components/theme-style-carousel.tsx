"use client";

import * as React from "react";
import styles from "./theme-style-carousel.module.css";
import promo from "./promo-row.module.css";
import { Button } from "@/components/ui/button";
import cm from "@/components/ui/context-menu.module.css";

import {
  applyThemeVars,
  startPreviewThemeVars,
  endPreviewThemeVars,
  getStoredThemeVars,
  setTheme,
  clearThemeVars,
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
  createdLabel?: string | null;
};

type ThemeEntry = { kind: "preset"; preset: Preset } | { kind: "saved"; saved: SavedStyle };

function builtInPresets(): Preset[] {
  return [
    { id: "light", title: "Light Mode", desc: "System light theme", vars: {}, theme: "light" },
    { id: "dark", title: "Dark Mode", desc: "System dark theme", vars: {}, theme: "dark" },
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

  const basePresets = React.useMemo(() => builtInPresets(), []);
  const placeholderSaved = React.useMemo<SavedStyle[]>(
    () =>
      Array.from({ length: 6 }).map((_, index) => ({
        id: `placeholder-${index}`,
        title: `Capsule Vibe ${index + 1}`,
        summary: `AI moodboard style ${index + 1}`,
        description: `Futuristic gradient #${index + 1}`,
        vars: basePresets[index % basePresets.length]?.vars ?? {},
        createdLabel: null,
      })),
    [basePresets],
  );

  const envelopeRef = React.useRef(envelope);
  React.useEffect(() => {
    envelopeRef.current = envelope;
  }, [envelope]);

  const [savedStyles, setSavedStyles] = React.useState<SavedStyle[]>(placeholderSaved);
  const [headerMenuOpen, setHeaderMenuOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);

  const items = React.useMemo<ThemeEntry[]>(
    () => [
      ...basePresets.map((preset) => ({ kind: "preset", preset } as ThemeEntry)),
      ...savedStyles.map((saved) => ({ kind: "saved", saved } as ThemeEntry)),
    ],
    [basePresets, savedStyles],
  );

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const itemWidthRef = React.useRef(0);

  const loopCount = items.length;
  const loopItems = React.useMemo(() => (loopCount ? [...items, ...items, ...items] : []), [items, loopCount]);

  const scrollByPage = React.useCallback(
    (dir: 1 | -1) => {
      const el = listRef.current;
      const span = itemWidthRef.current || el?.clientWidth || 0;
      if (!el || !span) return;
      el.scrollBy({ left: dir * span * 2.5, behavior: "smooth" });
    },
    [],
  );

  const updateScrollState = React.useCallback(() => {
    const hasItems = loopCount > 0;
    setCanLeft(hasItems);
    setCanRight(hasItems);
  }, [loopCount]);

  const measureAndPrime = React.useCallback(() => {
    const el = listRef.current;
    if (!el || !loopCount) return;
    const firstSlide = el.querySelector<HTMLElement>(`.${styles.slide}`);
    if (!firstSlide) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || "0");
    itemWidthRef.current = firstSlide.getBoundingClientRect().width + gap;
    el.scrollLeft = itemWidthRef.current * loopCount;
  }, [loopCount]);

  React.useEffect(() => {
    if (!loopCount) return;
    requestAnimationFrame(() => {
      measureAndPrime();
      updateScrollState();
    });
  }, [loopCount, measureAndPrime, updateScrollState, loopItems]);

  const handleScroll = React.useCallback(() => {
    const el = listRef.current;
    const span = itemWidthRef.current;
    if (!el || !loopCount || !span) return;
    const total = span * loopCount;
    if (el.scrollLeft < total * 0.5) {
      el.scrollLeft += total;
    } else if (el.scrollLeft > total * 1.5) {
      el.scrollLeft -= total;
    }
    updateScrollState();
  }, [loopCount, updateScrollState]);

  React.useEffect(() => {
    const resizeHandler = () => {
      measureAndPrime();
      updateScrollState();
    };
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, [measureAndPrime, updateScrollState]);

  const startPreview = React.useCallback((entry: ThemeEntry) => {
    const id = getEntryId(entry);
    setPreviewingId(id);
    const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
    if (Object.keys(vars).length) startPreviewThemeVars(vars);
  }, []);

  const stopPreview = React.useCallback(() => {
    endPreviewThemeVars();
    setPreviewingId(null);
  }, []);

  React.useEffect(() => () => endPreviewThemeVars(), []);

  const handleApply = React.useCallback(
    (entry: ThemeEntry) => {
      stopPreview();
      const id = getEntryId(entry);
      setActiveId(id);
      clearThemeVars();
      if (entry.kind === "preset") {
        if (entry.preset.theme) setTheme(entry.preset.theme);
        if (Object.keys(entry.preset.vars).length) applyThemeVars(entry.preset.vars);
      } else {
        applyThemeVars(entry.saved.vars);
      }
    },
    [stopPreview],
  );

  const handleSetMode = React.useCallback(
    (mode: "light" | "dark") => {
      stopPreview();
      clearThemeVars();
      setTheme(mode);
      setActiveId(`preset:${mode}`);
    },
    [stopPreview],
  );

  const updateFromSaved = React.useCallback(
    (saved: SavedStyle[]) => {
      setSavedStyles(saved.length ? saved : placeholderSaved);
    },
    [placeholderSaved],
  );

  const fetchSaved = React.useCallback(async () => {
    const envelopePayload = envelopeRef.current;
    if (!envelopePayload) {
      updateFromSaved([]);
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
      const normalized: SavedStyle[] = Array.isArray(json.items)
        ? json.items
            .map((raw) => {
              const record = raw as Record<string, unknown>;
              const id = typeof record.id === "string" ? record.id : null;
              const meta = (record.meta as Record<string, unknown>) ?? {};
              const vars = (meta.vars as Record<string, string>) ?? {};
              if (!id || !Object.keys(vars).length) return null;
              const titleRaw = typeof record.title === "string" ? record.title.trim() : "";
              const summaryRaw = typeof meta.summary === "string" ? (meta.summary as string).trim() : "";
              const prompt = typeof meta.prompt === "string" ? (meta.prompt as string).trim() : "";
              const summary = titleRaw || summaryRaw;
              return {
                id,
                title: summary || prompt || "Saved theme",
                summary,
                description: summary || prompt,
                vars,
                createdLabel: typeof record.created_at === "string" ? record.created_at : undefined,
              } as SavedStyle;
            })
            .filter((style): style is SavedStyle => Boolean(style))
        : [];
      updateFromSaved(normalized);
    } finally {
      setLoading(false);
    }
  }, [updateFromSaved]);

  React.useEffect(() => {
    if (!isLoaded) return;
    void fetchSaved();
  }, [isLoaded, fetchSaved]);

  const handleRename = React.useCallback(
    async (entry: ThemeEntry) => {
      if (entry.kind !== "saved" || entry.saved.id.startsWith("placeholder-")) return;
      const currentTitle = entry.saved.title || "Saved theme";
      const next = window.prompt("Rename theme", currentTitle)?.trim();
      if (!next || next === currentTitle) return;
      const res = await fetch("/api/memory/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: entry.saved.id, title: next, kind: "theme" }),
      });
      if (res.ok) {
        setSavedStyles((prev) =>
          prev.map((style) => (style.id === entry.saved.id ? { ...style, title: next, summary: next } : style)),
        );
      }
    },
    [],
  );

  const handleDelete = React.useCallback(
    async (entry: ThemeEntry) => {
      if (entry.kind !== "saved" || entry.saved.id.startsWith("placeholder-")) return;
      stopPreview();
      const res = await fetch("/api/memory/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [entry.saved.id], kind: "theme", user: envelopeRef.current ?? {} }),
      });
      if (res.ok) {
        setSavedStyles((prev) => {
          const next = prev.filter((style) => style.id !== entry.saved.id);
          return next.length ? next : placeholderSaved;
        });
      }
    },
    [placeholderSaved, stopPreview],
  );

  const handleDeleteAll = React.useCallback(async () => {
    stopPreview();
    const hasRealSaved = savedStyles.some((style) => !style.id.startsWith("placeholder-"));
    if (hasRealSaved) {
      await fetch("/api/memory/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind: "theme", all: true, user: envelopeRef.current ?? {} }),
      });
    }
    setSavedStyles(placeholderSaved);
    setHeaderMenuOpen(false);
  }, [placeholderSaved, savedStyles, stopPreview]);

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
    if (res.ok) {
      void fetchSaved();
    }
  }, [fetchSaved, stopPreview]);

  const hasRealSaved = React.useMemo(
    () => savedStyles.some((style) => !style.id.startsWith("placeholder-")),
    [savedStyles],
  );

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
              <div className={cm.menu} role="menu" style={{ right: 0, top: 40 }} onMouseLeave={() => setHeaderMenuOpen(false)}>
                <button
                  type="button"
                  className={`${cm.item} ${cm.danger}`.trim()}
                  role="menuitem"
                  onClick={handleDeleteAll}
                  disabled={!hasRealSaved}
                  aria-disabled={!hasRealSaved}
                >
                  Delete all saved
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.modeButtons}>
        <Button
          variant={activeId === "preset:light" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetMode("light")}
        >
          Light mode
        </Button>
        <Button
          variant={activeId === "preset:dark" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetMode("dark")}
        >
          Dark mode
        </Button>
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
        <div className={styles.track} ref={listRef} onScroll={handleScroll}>
          {loopItems.map((entry, index) => {
            const baseId = getEntryId(entry);
            const key = `${baseId}::${index}`;
            const vars = entry.kind === "preset" ? entry.preset.vars : entry.saved.vars;
            const descriptionRaw = entry.kind === "preset" ? entry.preset.desc : entry.saved.description;
            const description =
              descriptionRaw && descriptionRaw.trim().length ? descriptionRaw : "Capsule AI custom theme";
            const isActive = activeId === baseId;
            const isEditable = entry.kind === "saved" && !entry.saved.id.startsWith("placeholder-");
            return (
              <div key={key} className={styles.slide}>
                <div
                  className={`${promo.tile} ${isActive ? styles.activeTile : ""}`.trim()}
                  tabIndex={0}
                  onMouseEnter={() => startPreview(entry)}
                  onMouseLeave={stopPreview}
                  onFocus={() => startPreview(entry)}
                  onBlur={stopPreview}
                >
                  <div className={styles.tileHeader}>
                    <div className={styles.tileTitle}>{entry.kind === "preset" ? entry.preset.title : entry.saved.title}</div>
                    <div className={styles.tileBadge}>{entry.kind === "saved" ? "Saved" : "Preset"}</div>
                  </div>
                  <div className={`${promo.short} ${styles.previewHalf}`.trim()} style={buildPreviewStyle(vars)} aria-hidden>
                    <div className={styles.swatchBg} />
                    <div className={styles.swatchCard} />
                    {isActive ? <span className={styles.activeBadge}>Active</span> : null}
                  </div>
                  <div className={styles.descArea}>{description}</div>
                  <div className={styles.buttonRow}>
                    <Button variant="primary" size="sm" onClick={() => handleApply(entry)}>
                      Apply
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => isEditable && handleRename(entry)} disabled={!isEditable}>
                      Rename
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => isEditable && handleDelete(entry)} disabled={!isEditable}>
                      Delete
                    </Button>
                  </div>
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
    </div>
  );
}
