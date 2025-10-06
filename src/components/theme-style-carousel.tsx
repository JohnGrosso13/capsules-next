"use client";

import * as React from "react";

import styles from "./theme-style-carousel.module.css";
import promo from "./promo-row.module.css";
import { Button, ButtonLink } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Trash } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

import {
  applyThemeVars,
  startPreviewThemeVars,
  endPreviewThemeVars,
  getStoredThemeVars,
  setTheme,
  getTheme,
  getThemePreference,
  clearThemeVars,
  type ThemePreference,
} from "@/lib/theme";
import {
  ThemeVariants,
  normalizeThemeVariantsInput,
  variantForMode,
  variantsEqual,
  isVariantEmpty,
} from "@/lib/theme/variants";
import { buildPresetThemeVariants } from "@/lib/theme/styler-heuristics";
import { PRESET_THEME_CONFIGS } from "@/lib/theme/preset-config";
import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { useCurrentUser } from "@/services/auth/client";
import { buildThemePreview, summarizeGroupLabels } from "@/lib/theme/token-groups";

type Preset = {
  id: string;
  title: string;
  desc?: string;
  variants: ThemeVariants;
  theme?: "light" | "dark";
};

type SavedStyle = {
  id: string;
  title: string;
  summary?: string;
  description?: string;
  variants: ThemeVariants;
  createdLabel?: string | null;
  details?: string | null;
};

type ThemeEntry = { kind: "preset"; preset: Preset } | { kind: "saved"; saved: SavedStyle };
const TITLE_FALLBACK = "Saved theme";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function coerceString(value: unknown, limit?: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (typeof limit === "number" && trimmed.length > limit) {
    return trimmed.slice(0, limit);
  }
  return trimmed;
}

function mapThemeRecord(raw: unknown): SavedStyle | null {
  if (!isPlainObject(raw)) return null;
  const id = coerceString(raw.id);
  if (!id) return null;

  const rawRecord = raw as Record<string, unknown>;
  const meta = isPlainObject(rawRecord.meta) ? rawRecord.meta : undefined;
  const primaryVariantsSource = isPlainObject(rawRecord.variants) ? rawRecord.variants : rawRecord.vars;
  let variants = normalizeThemeVariantsInput(primaryVariantsSource);
  if (isVariantEmpty(variants) && meta) {
    const metaVariantsSource = isPlainObject(meta.variants) ? meta.variants : meta.vars;
    variants = normalizeThemeVariantsInput(metaVariantsSource);
  }
  if (isVariantEmpty(variants)) return null;

  const title =
    coerceString(raw.title) ??
    coerceString(meta?.["title"]) ??
    coerceString(raw.summary) ??
    coerceString(meta?.["summary"]) ??
    coerceString(raw.description) ??
    coerceString(meta?.["description"]) ??
    coerceString(raw.prompt) ??
    coerceString(meta?.["prompt"]) ??
    TITLE_FALLBACK;

  const summary =
    coerceString(raw.summary) ??
    coerceString(meta?.["summary"]) ??
    null;

  const prompt =
    coerceString(raw.prompt) ??
    coerceString(meta?.["prompt"]) ??
    null;

  const description =
    coerceString(raw.description) ??
    coerceString(meta?.["description"]) ??
    summary ??
    prompt ??
    title;

  const details =
    coerceString(raw.details) ??
    coerceString(meta?.["details"]) ??
    null;

  const createdLabel =
    coerceString(raw.created_at) ??
    coerceString(raw.createdAt) ??
    coerceString(meta?.["created_at"]) ??
    null;

  return {
    id,
    title,
    summary: summary ?? description ?? title,
    description: description ?? title,
    details: details ?? prompt ?? null,
    variants,
    createdLabel: createdLabel ?? null,
  };
}


function builtInPresets(): Preset[] {
  const presetEntries = PRESET_THEME_CONFIGS.map((config) => ({
    id: config.id,
    title: config.title,
    desc: config.description,
    variants: buildPresetThemeVariants(config),
  }));
  return [
    { id: "default", title: "Default", desc: "Capsules baseline palette.", variants: { light: {}, dark: {} } },
    { id: "dark", title: "Default (Dark)", desc: "Capsules dark baseline palette.", variants: { dark: {} }, theme: "dark" },
    { id: "light", title: "Default (Light)", desc: "Capsules light baseline palette.", variants: { light: {} }, theme: "light" },
    ...presetEntries,
  ];
}


const PLACEHOLDER_THEMES: SavedStyle[] = [];

function getEntryId(entry: ThemeEntry): string {
  return entry.kind === "preset" ? `preset:${entry.preset.id}` : `saved:${entry.saved.id}`;
}

function getEntryVariants(entry: ThemeEntry): ThemeVariants {
  return entry.kind === "preset" ? entry.preset.variants : entry.saved.variants;
}

function useThemeStyles() {
  const { user, isLoaded } = useCurrentUser();
  const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);

  const basePresets = React.useMemo(() => builtInPresets(), []);
  const placeholderThemes = React.useMemo(() => PLACEHOLDER_THEMES, []);

  const envelopeRef = React.useRef(envelope);
  React.useEffect(() => {
    envelopeRef.current = envelope;
  }, [envelope]);

  const [savedStyles, setSavedStyles] = React.useState<SavedStyle[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [previewingId, setPreviewingId] = React.useState<string | null>(null);
  const [activeMode, setActiveMode] = React.useState<"light" | "dark">(() => getTheme());
  const [themePreference, setThemePreferenceState] = React.useState<ThemePreference>(() => getThemePreference());
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleModeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: string }>).detail;
      const mode = detail?.mode;
      if (mode === "light" || mode === "dark") {
        setActiveMode(mode);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "theme") {
        setThemePreferenceState(getThemePreference());
        setActiveMode(getTheme());
      }
    };
    window.addEventListener("capsules:theme-mode-change", handleModeChange as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("capsules:theme-mode-change", handleModeChange as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const displayedSavedStyles = React.useMemo(
    () => (savedStyles.length ? savedStyles : placeholderThemes),
    [savedStyles, placeholderThemes],
  );

  const items = React.useMemo<ThemeEntry[]>(() => {
    const presetEntries = basePresets
      .filter((preset) => preset.id !== "light" && preset.id !== "dark")
      .map((preset) => ({ kind: "preset", preset } as ThemeEntry));
    const savedEntries = displayedSavedStyles.map((saved) => ({ kind: "saved", saved } as ThemeEntry));
    return [...presetEntries, ...savedEntries];
  }, [basePresets, displayedSavedStyles]);

  React.useEffect(() => {
    const stored = getStoredThemeVars();
    if (isVariantEmpty(stored)) {
      setActiveId("preset:default");
      return;
    }
    const presetMatch = basePresets.find((preset) => variantsEqual(stored, preset.variants));
    if (presetMatch) {
      setActiveId(`preset:${presetMatch.id}`);
      return;
    }
    const savedMatch = savedStyles.find((style) => variantsEqual(stored, style.variants));
    if (savedMatch) {
      setActiveId(`saved:${savedMatch.id}`);
      return;
    }
    setActiveId(null);
  }, [basePresets, savedStyles]);

  const startPreview = React.useCallback(
    (entry: ThemeEntry) => {
      const id = getEntryId(entry);
      if (previewingId === id) return;
      setPreviewingId(id);
      const variants = getEntryVariants(entry);
      if (!isVariantEmpty(variants)) startPreviewThemeVars(variants);
    },
    [previewingId],
  );

  const stopPreview = React.useCallback(() => {
    endPreviewThemeVars();
    setPreviewingId(null);
  }, []);

  React.useEffect(
    () => () => {
      endPreviewThemeVars();
    },
    [],
  );

  const handleApply = React.useCallback(
    (entry: ThemeEntry) => {
      stopPreview();
      const id = getEntryId(entry);
      setActiveId(id);
      if (entry.kind === "preset" && entry.preset.theme) {
        setTheme(entry.preset.theme);
        setThemePreferenceState(entry.preset.theme);
        setActiveMode(entry.preset.theme);
      }
      const variants = getEntryVariants(entry);
      if (isVariantEmpty(variants)) {
        clearThemeVars();
      } else {
        applyThemeVars(variants);
      }
    },
    [stopPreview],
  );

  const handleSetPreference = React.useCallback(
    (preference: ThemePreference) => {
      stopPreview();
      setTheme(preference);
      setThemePreferenceState(preference);
      setActiveMode(preference === "system" ? getTheme() : preference);
    },
    [stopPreview],
  );

  const updateFromSaved = React.useCallback((saved: SavedStyle[]) => {
    const filtered = saved.filter((style) => Boolean(style?.id));
    setSavedStyles(filtered);
  }, []);

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
        ? json.items.map(mapThemeRecord).filter((style): style is SavedStyle => Boolean(style))
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
          prev.map((style) =>
            style.id === entry.saved.id ? { ...style, title: next, summary: next, description: next } : style,
          ),
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
        setSavedStyles((prev) => prev.filter((style) => style.id !== entry.saved.id));
      }
    },
    [stopPreview],
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
    setSavedStyles([]);
  }, [savedStyles, stopPreview]);

  const handleSaveCurrent = React.useCallback(async () => {
    const variants = getStoredThemeVars();
    if (isVariantEmpty(variants)) {
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
      body: JSON.stringify({ title, summary: title, variants, user: envelopeRef.current ?? {} }),
    });
    if (res.ok) {
      void fetchSaved();
    }
  }, [fetchSaved, stopPreview]);

  const activeEntry = React.useMemo(() => {
    if (!items.length) return null;
    if (activeId) {
      const match = items.find((entry) => getEntryId(entry) === activeId);
      if (match) return match;
    }
    return items[0] ?? null;
  }, [items, activeId]);

  const hasRealSaved = React.useMemo(
    () => savedStyles.some((style) => !style.id.startsWith("placeholder-")),
    [savedStyles],
  );

  return {
    items,
    activeEntry,
    activeId,
    activeMode,
    themePreference,
    previewingId,
    loading,
    hasRealSaved,
    handleApply,
    handleSetPreference,
    handleSaveCurrent,
    handleDeleteAll,
    handleRename,
    handleDelete,
    startPreview,
    stopPreview,
  } as const;
}

type ThemeEntryCardProps = {
  entry: ThemeEntry;
  isActive: boolean;
  variant: "summary" | "gallery";
  activeMode: "light" | "dark";
  onApply?: (entry: ThemeEntry) => void;
  onRename?: (entry: ThemeEntry) => void;
  onDelete?: (entry: ThemeEntry) => void;
  onPreview?: (entry: ThemeEntry) => void;
  onPreviewEnd?: () => void;
  isPreviewing?: boolean;
};

function ThemeEntryCard({
  entry,
  isActive,
  variant,
  activeMode,
  onApply,
  onRename,
  onDelete,
  onPreview,
  onPreviewEnd,
  isPreviewing = false,
}: ThemeEntryCardProps) {
  const entryId = getEntryId(entry);
  const variants = getEntryVariants(entry);
  const variantStyle = React.useMemo(() => variantForMode(variants, activeMode), [variants, activeMode]);
  const preview = React.useMemo(() => buildThemePreview(variantStyle), [variantStyle]);
  const groupBadges = preview.usages.slice(0, 3);
  const palette = preview.palette.slice(0, 4);
  const descriptionRaw = entry.kind === "preset" ? entry.preset.desc : entry.saved.description;
  const savedDetails = entry.kind === "saved" ? entry.saved.details : undefined;
  const fallbackDetails = summarizeGroupLabels(preview.usages);
  let description = descriptionRaw && descriptionRaw.trim().length ? descriptionRaw.trim() : "";
  if (!description && savedDetails && savedDetails.trim().length) {
    description = savedDetails.trim();
  }
  if (!description && fallbackDetails && fallbackDetails.length) {
    description = fallbackDetails;
  }
  if (!description) {
    description = "Capsules custom theme";
  }
  const name = entry.kind === "preset" ? entry.preset.title : entry.saved.title;
  const kindLabel = entry.kind === "saved" ? "Saved" : "Preset";
  const isEditable = entry.kind === "saved" && !entry.saved.id.startsWith("placeholder-");
  const showActions = variant === "gallery" && typeof onApply === "function";

  return (
    <article
      className={cn(
        styles.card,
        variant === "summary" ? styles.cardSummary : styles.cardGallery,
        isActive && styles.cardActive,
        isPreviewing && styles.cardPreviewing,
      )}
      data-theme-kind={entry.kind}
    >
      <div
        className={cn(promo.tile, styles.cardSurface)}
        tabIndex={variant === "gallery" ? 0 : -1}
        onMouseEnter={onPreview ? () => onPreview(entry) : undefined}
        onMouseLeave={onPreviewEnd}
        onFocus={onPreview ? () => onPreview(entry) : undefined}
        onBlur={onPreviewEnd}
        aria-pressed={isActive ? "true" : undefined}
      >
        <header className={styles.cardHeader}>
          <div className={styles.cardTitleBlock}>
            <span className={styles.cardSubtitle}>
              {variant === "summary" ? "Current theme" : kindLabel}
            </span>
            <span className={styles.cardTitle}>{name}</span>
          </div>
          {isActive ? <span className={styles.activeBadge}>Active</span> : null}
        </header>

        <div className={styles.previewShell} style={(variantStyle as React.CSSProperties)} aria-hidden>
          <div className={styles.swatchBg} />
          <div className={styles.swatchCard} />
        </div>

        <p className={styles.description}>{description}</p>

        {groupBadges.length || palette.length ? (
          <div className={styles.previewMeta}>
            {groupBadges.length ? (
              <div className={styles.previewTags}>
                {groupBadges.map(({ group }) => (
                  <span key={`${entryId}-group-${group.id}`} className={styles.previewTag}>
                    {group.label}
                  </span>
                ))}
              </div>
            ) : null}
            {palette.length ? (
              <div className={styles.previewPalette} aria-hidden>
                {palette.map((value, index) => (
                  <span key={`${entryId}-swatch-${index}`} className={styles.previewColor} style={{ background: value }} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {showActions ? (
          <div className={styles.buttonRow}>
            <Button variant="primary" size="sm" onClick={() => onApply?.(entry)}>
              {isActive ? "Applied" : "Apply"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onRename?.(entry)} disabled={!isEditable}>
              Rename
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onDelete?.(entry)} disabled={!isEditable}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ThemeStyleCarousel() {
  const { activeEntry, activeMode, themePreference, loading, handleSetPreference, handleSaveCurrent } = useThemeStyles();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h3 className={styles.title}>Choose your Capsules look</h3>
          <p className={styles.subtitle}>Preview a theme, then apply when you are ready.</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={handleSaveCurrent}>
            Save current
          </Button>
          <ButtonLink variant="ghost" size="sm" href="/settings/themes" rightIcon={<ArrowRight weight="bold" />}>
            View more
          </ButtonLink>
        </div>
      </div>

      <div className={styles.modeButtons}>
        <Button
          variant={themePreference === "system" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetPreference("system")}
        >
          System
        </Button>
        <Button
          variant={themePreference === "light" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetPreference("light")}
        >
          Light mode
        </Button>
        <Button
          variant={themePreference === "dark" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetPreference("dark")}
        >
          Dark mode
        </Button>
      </div>

      <div className={styles.summaryGrid}>
        {activeEntry ? (
          <ThemeEntryCard entry={activeEntry} isActive activeMode={activeMode} variant="summary" />
        ) : (
          <p className={styles.emptyState}>Choose a theme to begin customizing Capsules.</p>
        )}
      </div>

      {loading ? <div className={styles.meta}>Loading saved themes...</div> : null}
    </div>
  );
}

export function ThemeStylesGallery() {
  const {
    items,
    activeId,
    activeMode,
    themePreference,
    previewingId,
    loading,
    hasRealSaved,
    handleApply,
    handleSetPreference,
    handleSaveCurrent,
    handleDeleteAll,
    handleRename,
    handleDelete,
    startPreview,
    stopPreview,
  } = useThemeStyles();

  return (
    <section className={styles.fullRoot}>
      <div className={styles.fullHeader}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>All themes</h1>
          <p className={styles.fullSubtitle}>
            Browse built-in presets and your saved looks. Hover to preview, then apply to commit the change.
          </p>
        </div>
        <div className={styles.fullHeaderActions}>
          <Button variant="secondary" size="sm" onClick={handleSaveCurrent}>
            Save current
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { void handleDeleteAll(); }}
            disabled={!hasRealSaved}
            leftIcon={<Trash weight="bold" />}
          >
            Delete all saved
          </Button>
          <ButtonLink variant="ghost" size="sm" href="/settings" leftIcon={<ArrowLeft weight="bold" />}>
            Back to settings
          </ButtonLink>
        </div>
      </div>

      <div className={styles.modeButtons}>
        <Button
          variant={themePreference === "system" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetPreference("system")}
        >
          System
        </Button>
        <Button
          variant={themePreference === "light" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetPreference("light")}
        >
          Light mode
        </Button>
        <Button
          variant={themePreference === "dark" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSetPreference("dark")}
        >
          Dark mode
        </Button>
      </div>

      {loading ? <div className={styles.meta}>Loading saved themes...</div> : null}

      <div className={styles.grid}>
        {items.map((entry) => {
          const entryId = getEntryId(entry);
          return (
            <ThemeEntryCard
              key={entryId}
              entry={entry}
              isActive={entryId === activeId}
              variant="gallery"
              activeMode={activeMode}
              onApply={handleApply}
              onRename={handleRename}
              onDelete={handleDelete}
              onPreview={startPreview}
              onPreviewEnd={stopPreview}
              isPreviewing={entryId === previewingId}
            />
          );
        })}
      </div>
    </section>
  );
}











































