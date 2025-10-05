"use client";

import { normalizeThemeVars } from "./theme/shared";

export type Theme = "light" | "dark";

function readStoredThemeVars(): Record<string, string> {
  try {
    const raw = localStorage.getItem("themeVars");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const normalized = normalizeThemeVars(parsed);
    return stabilizeThemeVars(normalized);
  } catch {
    return {};
  }
}

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function setTheme(theme: Theme) {
  try {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  } catch {}
}

export function getStoredThemeVars(): Record<string, string> {
  return { ...readStoredThemeVars() };
}

/** Apply a set of CSS custom properties and persist them for future visits. */
export function applyThemeVars(vars: Record<string, string>) {
  try {
    const sanitized = normalizeThemeVars(vars);
    const prepared = stabilizeThemeVars(sanitized);
    if (!Object.keys(prepared).length) return;
    const root = document.documentElement;
    Object.entries(prepared).forEach(([key, value]: [string, string]) => root.style.setProperty(key, value));
    const stored = { ...readStoredThemeVars(), ...prepared };
    if (Object.keys(stored).length) {
      localStorage.setItem("themeVars", JSON.stringify(stored));
    } else {
      localStorage.removeItem("themeVars");
    }
  } catch {}
}

/** Remove previously applied CSS custom properties. */
export function clearThemeVars(keys?: string[]) {
  try {
    const root = document.documentElement;
    if (Array.isArray(keys) && keys.length) {
      const stored = readStoredThemeVars();
      keys.forEach((rawKey) => {
        if (typeof rawKey !== "string") return;
        const key = rawKey.trim();
        if (!key.startsWith("--")) return;
        root.style.removeProperty(key);
        delete stored[key];
      });
      if (Object.keys(stored).length) {
        localStorage.setItem("themeVars", JSON.stringify(stored));
      } else {
        localStorage.removeItem("themeVars");
      }
      return;
    }
    const stored = readStoredThemeVars();
    Object.keys(stored).forEach((key) => root.style.removeProperty(key));
    localStorage.removeItem("themeVars");
  } catch {}
}

// -- Preview support -------------------------------------------------------

type PreviewState = {
  applied: Record<string, string>;
  previous: Record<string, string | null>;
};

let currentPreview: PreviewState | null = null;

/**
 * Temporarily apply theme variables to the document root without persisting them.
 * Call endPreviewThemeVars() to restore previous inline values.
 */
export function startPreviewThemeVars(vars: Record<string, string>) {
  try {
    const sanitized = normalizeThemeVars(vars);
    const prepared = stabilizeThemeVars(sanitized);
    if (!Object.keys(prepared).length) return;
    // If a preview is already active, end it before starting a new one
    if (currentPreview) endPreviewThemeVars();

    const root = document.documentElement;
    const previous: Record<string, string | null> = {};

    Object.entries(prepared).forEach(([key, value]: [string, string]) => {
      try {
        previous[key] = root.style.getPropertyValue(key) || null;
        root.style.setProperty(key, value);
      } catch {}
    });

    (root.dataset as Record<string, string>).previewTheme = "1";
    currentPreview = { applied: prepared, previous };
  } catch {}
}

/** Restore the inline CSS variables present before the preview began. */
export function endPreviewThemeVars() {
  try {
    if (!currentPreview) return;
    const { applied, previous } = currentPreview;
    const root = document.documentElement;

    Object.keys(applied).forEach((key) => {
      try {
        const prior = previous[key];
        if (prior && prior.length) {
          root.style.setProperty(key, prior);
        } else {
          root.style.removeProperty(key);
        }
      } catch {}
    });

    delete (root.dataset as Record<string, string | undefined>).previewTheme;
  } finally {
    currentPreview = null;
  }
}

/** Whether a theme preview is currently active. */
export function isPreviewingTheme(): boolean {
  return currentPreview !== null;
}



function stabilizeThemeVars(vars: Record<string, string>): Record<string, string> {
  const withBackground = ensureAppBackground(vars);
  const withBrand = ensureBrandIdentity(withBackground);
  return ensureComposerPalette(withBrand);
}

type RGBA = { r: number; g: number; b: number; a: number };

function ensureAppBackground(vars: Record<string, string>): Record<string, string> {
  let working = vars;
  if (!working["--app-bg"]) {
    const derived = deriveAppBackground(working);
    if (derived) {
      if (working === vars) working = { ...vars };
      working["--app-bg"] = derived;
    }
  }
  if (working["--app-bg"] && !working["--surface-app"]) {
    if (working === vars) working = { ...vars };
    working["--surface-app"] = "var(--app-bg)";
  }
  return working;
}

function ensureBrandIdentity(vars: Record<string, string>): Record<string, string> {
  const gradientCandidates = [
    vars["--cta-button-gradient"],
    vars["--cta-gradient"],
    vars["--brand-gradient"],
    vars["--gradient-brand"],
    vars["--cta-chip-gradient"],
  ];
  const existingGradient = gradientCandidates.find(isGradientValue) ?? null;
  const accent =
    pickColor(vars, ["--color-brand", "--brand-mid", "--cta-button-gradient", "--cta-gradient"]) ??
    (existingGradient ? extractFirstColor(existingGradient) : null) ??
    DEFAULT_ACCENT;
  const palette = buildBrandPalette(accent);
  let working = vars;
  const ensure = (key: string, value: string) => {
    if (working[key] === value) return;
    if (working === vars) working = { ...vars };
    working[key] = value;
  };

  const gradientKeys = [
    "--cta-button-gradient",
    "--cta-gradient",
    "--cta-chip-gradient",
    "--brand-gradient",
    "--gradient-brand",
  ];
  gradientKeys.forEach((key) => {
    if (!isGradientValue(working[key])) {
      ensure(key, palette.gradient);
    }
  });

  const brandStops: Array<[string, string]> = [
    ["--brand-from", palette.fromHex],
    ["--brand-mid", palette.midHex],
    ["--brand-to", palette.toHex],
  ];
  for (const [key, value] of brandStops) {
    if (!working[key]) ensure(key, value);
  }

  if (!working["--color-brand"]) ensure("--color-brand", palette.midHex);
  if (!working["--color-brand-strong"]) ensure("--color-brand-strong", palette.toHex);

  const textKeys = [
    "--cta-button-text",
    "--cta-chip-text",
    "--text-on-brand",
    "--header-foreground-strong",
    "--color-brand-foreground",
    "--tile-text-base",
    "--style-friends-text",
    "--style-chats-text",
    "--style-requests-text",
  ];
  textKeys.forEach((key) => {
    const current = working[key];
    if (!hasReadableContrast(current, palette.accent)) {
      ensure(key, palette.textHex);
    }
  });

  return working === vars ? vars : working;
}

function ensureComposerPalette(vars: Record<string, string>): Record<string, string> {
  let working = vars;
  const update = (key: string, value: string) => {
    if (working[key] === value) return;
    if (working === vars) working = { ...vars };
    working[key] = value;
  };
  const ensureMissing = (key: string, value: string) => {
    if (working[key]) return;
    update(key, value);
  };

  const accent =
    pickColor(working, ["--composer-accent", "--color-brand", "--brand-mid", "--color-brand-strong", "--accent-glow"]) ??
    DEFAULT_ACCENT;
  const base =
    pickColor(working, ["--surface-app", "--app-bg", "--surface-muted", "--surface-elevated"]) ?? DARK_ANCHOR;
  const elevated =
    pickColor(working, ["--surface-elevated", "--card-bg-1", "--card-bg-2", "--surface-overlay"]) ?? lighten(base, 0.18);
  const overlay =
    pickColor(working, ["--surface-overlay", "--modal-overlay", "--overlay", "--overlay-scrim"]) ??
    mixColors(base, BLACK, 0.2);
  const railBase = pickColor(working, ["--surface-rail", "--rail-background"]) ?? mixColors(elevated, base, 0.45);
  const text =
    pickColor(working, ["--composer-text", "--text", "--text-primary", "--foreground", "--text-base"]) ??
    LIGHT_TEXT_COLOR;

  const accentSolid = solidColor(accent);
  const baseSolid = solidColor(base);
  const elevatedSolid = solidColor(elevated);
  const overlaySolid = solidColor(overlay);
  const railSolid = solidColor(railBase);
  const textSolid = solidColor(text);

  const ensureReadableBackground = (
    key: string,
    candidates: RGBA[],
    options?: { lighten?: number; darken?: number; alpha?: number },
  ) => {
    const existingValue = working[key];
    if (existingValue) {
      const parsed = extractFirstColor(existingValue);
      if (parsed && contrastRatio(solidColor(parsed), textSolid) >= 4.5) {
        return;
      }
    }
    const palette = candidates.map(solidColor);
    const baseColor = pickReadableCandidate(palette, textSolid);
    const gradient = buildSoftGradient(baseColor, textSolid, options);
    update(key, gradient);
  };

  const overlayValue = toRgbaString(mixColors(overlaySolid, baseSolid, 0.32), 0.88);
  ensureMissing("--composer-overlay", overlayValue);

  ensureMissing("--composer-panel-background", buildAmbientGradient(baseSolid, accentSolid));
  ensureMissing("--composer-panel-border", toRgbaString(mixColors(baseSolid, WHITE, 0.52), 0.28));

  const mainCandidates = [
    mixColors(elevatedSolid, baseSolid, 0.6),
    mixColors(elevatedSolid, accentSolid, 0.2),
    mixColors(baseSolid, WHITE, 0.1),
  ];
  ensureReadableBackground("--composer-main-background", mainCandidates, { lighten: 0.08, darken: 0.16, alpha: 0.97 });

  const railCandidates = [
    railSolid,
    mixColors(railSolid, accentSolid, 0.2),
    mixColors(baseSolid, accentSolid, 0.18),
    mixColors(baseSolid, WHITE, 0.08),
  ];
  ensureReadableBackground("--composer-rail-background", railCandidates, { lighten: 0.06, darken: 0.18, alpha: 0.96 });
  ensureMissing("--composer-rail-border", toRgbaString(mixColors(railSolid, WHITE, 0.36), 0.28));

  const footerCandidates = [
    mixColors(baseSolid, BLACK, 0.24),
    mixColors(elevatedSolid, BLACK, 0.18),
    mixColors(baseSolid, accentSolid, 0.15),
  ];
  ensureReadableBackground("--composer-footer-background", footerCandidates, { lighten: 0.05, darken: 0.2, alpha: 0.98 });
  ensureMissing("--composer-footer-border", toRgbaString(mixColors(baseSolid, WHITE, 0.32), 0.24));

  const closeTop = mixColors(accentSolid, WHITE, 0.55);
  const closeBottom = mixColors(accentSolid, baseSolid, 0.28);
  ensureMissing(
    "--composer-close-background",
    `linear-gradient(180deg, ${toRgbaString(closeTop, 0.94)} 0%, ${toRgbaString(closeBottom, 0.88)} 100%)`,
  );
  ensureMissing("--composer-close-border", toRgbaString(mixColors(accentSolid, WHITE, 0.48), 0.4));

  ensureMissing("--composer-accent", toHex(accentSolid));
  ensureMissing("--composer-accent-soft", toRgbaString(mixColors(accentSolid, WHITE, 0.1), 0.22));

  const ensureStatus = (key: string, fallback: RGBA, sources: string[]) => {
    if (working[key]) return;
    const picked = pickColor(working, sources) ?? fallback;
    update(key, toHex(solidColor(picked)));
  };
  ensureStatus("--composer-status-error", FALLBACK_ERROR_COLOR, [
    "--feedback-error",
    "--status-error",
    "--color-danger",
    "--status-critical",
  ]);
  ensureStatus("--composer-status-warning", FALLBACK_WARNING_COLOR, [
    "--feedback-warning",
    "--status-warning",
    "--color-warning",
  ]);
  ensureStatus("--composer-status-success", FALLBACK_SUCCESS_COLOR, [
    "--feedback-success",
    "--status-success",
    "--color-positive",
  ]);

  const userBubbleCandidates = [
    mixColors(accentSolid, baseSolid, 0.28),
    mixColors(accentSolid, baseSolid, 0.35),
    mixColors(accentSolid, WHITE, 0.12),
  ];
  ensureReadableBackground("--composer-chat-user-background", userBubbleCandidates, {
    lighten: 0.08,
    darken: 0.14,
    alpha: 0.96,
  });

  const aiBubbleCandidates = [
    mixColors(baseSolid, accentSolid, 0.12),
    mixColors(baseSolid, WHITE, 0.08),
    mixColors(elevatedSolid, baseSolid, 0.52),
  ];
  ensureReadableBackground("--composer-chat-ai-background", aiBubbleCandidates, {
    lighten: 0.06,
    darken: 0.12,
    alpha: 0.96,
  });

  return working;
}

function deriveAppBackground(vars: Record<string, string>): string | null {
  const base = pickColor(vars, ["--card-bg-1", "--card-bg-2", "--surface-muted", "--surface-elevated"]);
  const accent = pickColor(vars, ["--color-brand", "--brand-mid", "--accent-glow", "--cta-gradient", "--cta-button-gradient"]);
  const baseColor = base ?? (accent ? mixColors(accent, DARK_ANCHOR, 0.3) : null);
  if (!baseColor) return null;
  const accentColor = accent ?? lighten(baseColor, 0.35);
  return buildAmbientGradient(baseColor, accentColor);
}

function pickColor(vars: Record<string, string>, keys: string[]): RGBA | null {
  for (const key of keys) {
    const value = vars[key];
    if (!value) continue;
    const color = extractFirstColor(value);
    if (color) return color;
  }
  return null;
}

function extractFirstColor(value: string): RGBA | null {
  const hexMatch = value.match(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})/i);
  if (hexMatch) {
    const color = parseHexColor(hexMatch[0]);
    if (color) return color;
  }
  const rgbaMatch = value.match(/rgba?\([^)]*\)/i);
  if (rgbaMatch) {
    const color = parseRgbColor(rgbaMatch[0]);
    if (color) return color;
  }
  const hslaMatch = value.match(/hsla?\([^)]*\)/i);
  if (hslaMatch) {
    const color = parseHslColor(hslaMatch[0]);
    if (color) return color;
  }
  return null;
}

function parseHexColor(raw: string): RGBA | null {
  const value = raw.trim();
  const match = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;
  const hex = match[1];
  if (!hex) return null;

  if (hex.length === 3 || hex.length === 4) {
    const [rChar, gChar, bChar, aChar] = hex.split("");
    if (!rChar || !gChar || !bChar) return null;
    const r = parseInt(rChar + rChar, 16);
    const g = parseInt(gChar + gChar, 16);
    const b = parseInt(bChar + bChar, 16);
    const aChunk = (aChar ?? "f") + (aChar ?? "f");
    const alphaValue = parseInt(aChunk, 16);
    if ([r, g, b, alphaValue].some((component) => Number.isNaN(component))) return null;
    return { r, g, b, a: alphaValue / 255 };
  }

  if (hex.length === 6 || hex.length === 8) {
    const rChunk = hex.slice(0, 2);
    const gChunk = hex.slice(2, 4);
    const bChunk = hex.slice(4, 6);
    const aChunk = hex.length === 8 ? hex.slice(6, 8) : "ff";
    if (rChunk.length !== 2 || gChunk.length !== 2 || bChunk.length !== 2 || aChunk.length !== 2) return null;
    const r = parseInt(rChunk, 16);
    const g = parseInt(gChunk, 16);
    const b = parseInt(bChunk, 16);
    const alphaValue = parseInt(aChunk, 16);
    if ([r, g, b, alphaValue].some((component) => Number.isNaN(component))) return null;
    return { r, g, b, a: alphaValue / 255 };
  }

  return null;
}

function parseRgbColor(raw: string): RGBA | null {
  const match = raw.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const inner = match[1];
  if (!inner) return null;
  const parts = inner.split(',').map((part) => part.trim());
  if (parts.length < 3) return null;
  const [rPart, gPart, bPart, aPart] = parts;
  if (!rPart || !gPart || !bPart) return null;
  const r = parseRgbComponent(rPart);
  const g = parseRgbComponent(gPart);
  const b = parseRgbComponent(bPart);
  if (r == null || g == null || b == null) return null;
  const alphaPart = aPart && aPart.length ? parseAlphaComponent(aPart) : 1;
  if (alphaPart == null) return null;
  return { r, g, b, a: alphaPart };
}

function parseRgbComponent(part: string): number | null {
  if (part.endsWith('%')) {
    const value = parseFloat(part);
    if (Number.isNaN(value)) return null;
    return clampChannel((value / 100) * 255);
  }
  const value = parseFloat(part);
  if (Number.isNaN(value)) return null;
  return clampChannel(value);
}

function parseAlphaComponent(part: string): number | null {
  if (part.endsWith('%')) {
    const value = parseFloat(part);
    if (Number.isNaN(value)) return null;
    return clamp(value / 100, 0, 1);
  }
  const value = parseFloat(part);
  if (Number.isNaN(value)) return null;
  return clamp(value, 0, 1);
}

function parseHslColor(raw: string): RGBA | null {
  const match = raw.trim().match(/^hsla?\(([^)]+)\)$/i);
  if (!match) return null;
  const inner = match[1];
  if (!inner) return null;
  const parts = inner.split(',').map((part) => part.trim());
  if (parts.length < 3) return null;
  const [hPart, sPart, lPart, aPart] = parts;
  if (!hPart || !sPart || !lPart) return null;
  const h = parseFloat(hPart);
  if (Number.isNaN(h)) return null;
  const s = parsePercent(sPart);
  const l = parsePercent(lPart);
  if (s == null || l == null) return null;
  const alphaPart = aPart && aPart.length ? parseAlphaComponent(aPart) : 1;
  if (alphaPart == null) return null;
  const rgb = hslToRgb(((h % 360) + 360) % 360 / 360, s, l);
  return { ...rgb, a: alphaPart };
}

function parsePercent(part: string): number | null {
  if (!part.endsWith('%')) return null;
  const value = parseFloat(part);
  if (Number.isNaN(value)) return null;
  return clamp(value / 100, 0, 1);
}

function hslToRgb(h: number, s: number, l: number): Omit<RGBA, 'a'> {
  if (s === 0) {
    const value = clampChannel(l * 255);
    return { r: value, g: value, b: value };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = clampChannel(hueToRgb(p, q, h + 1 / 3) * 255);
  const g = clampChannel(hueToRgb(p, q, h) * 255);
  const b = clampChannel(hueToRgb(p, q, h - 1 / 3) * 255);
  return { r, g, b };
}

function hueToRgb(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function buildAmbientGradient(base: RGBA, accent: RGBA): string {
  const baseOpaque = { ...base, a: 1 };
  const accentOpaque = { ...accent, a: 1 };
  const glow = mixColors(accentOpaque, baseOpaque, 0.35);
  const highlight = mixColors(accentOpaque, baseOpaque, 0.2);
  const top = lighten(baseOpaque, 0.26);
  const mid = mixColors(accentOpaque, lighten(baseOpaque, 0.12), 0.35);
  const bottom = darken(baseOpaque, 0.38);
  const deep = darken(baseOpaque, 0.55);

  return [
    'radial-gradient(1200px 720px at 0% 0%, ' + toRgbaString(glow, 0.22) + ', transparent 60%)',
    'radial-gradient(1020px 680px at 100% 0%, ' + toRgbaString(highlight, 0.18) + ', transparent 62%)',
    'linear-gradient(120deg, ' + toRgbaString(top, 0.95) + ' 0%, ' + toRgbaString(mid, 0.88) + ' 45%, ' + toHex(bottom) + ' 100%)',
    'radial-gradient(880px 560px at 50% 108%, ' + toRgbaString(highlight, 0.16) + ', transparent 74%)',
    toHex(deep),
  ].join(', ');
}

function mixColors(a: RGBA, b: RGBA, ratio: number): RGBA {
  const t = clamp(ratio, 0, 1);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

function lighten(color: RGBA, ratio: number): RGBA {
  return mixColors(color, WHITE, ratio);
}

function darken(color: RGBA, ratio: number): RGBA {
  return mixColors(color, BLACK, ratio);
}

type GradientOptions = { lighten?: number; darken?: number; alpha?: number };

function pickReadableCandidate(candidates: RGBA[], text: RGBA): RGBA {
  let best: RGBA | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const solid = solidColor(candidate);
    const score = contrastRatio(solid, text);
    if (score >= 4.5) return solid;
    if (best === null || score > bestScore) {
      best = solid;
      bestScore = score;
    }
  }
  return best ?? solidColor(text);
}

function buildSoftGradient(base: RGBA, text: RGBA, options?: GradientOptions): string {
  const lightenAmount = clamp(options?.lighten ?? 0.08, 0, 0.6);
  const darkenAmount = clamp(options?.darken ?? 0.12, 0, 0.8);
  const alpha = clamp(options?.alpha ?? 0.98, 0, 1);

  const baseSolid = solidColor(base);
  let top = solidColor(lighten(baseSolid, lightenAmount));
  let bottom = solidColor(darken(baseSolid, darkenAmount));

  let topContrast = contrastRatio(top, text);
  let bottomContrast = contrastRatio(bottom, text);

  if (topContrast < 3.8 || bottomContrast < 3.8) {
    const adjusted = pickReadableCandidate(
      [
        baseSolid,
        top,
        bottom,
        solidColor(lighten(baseSolid, Math.min(lightenAmount * 1.2, 0.2))),
        solidColor(darken(baseSolid, Math.min(darkenAmount * 1.4, 0.4))),
      ],
      text,
    );
    top = solidColor(lighten(adjusted, Math.min(lightenAmount, 0.12)));
    bottom = solidColor(darken(adjusted, Math.min(darkenAmount * 1.1, 0.5)));
    topContrast = contrastRatio(top, text);
    bottomContrast = contrastRatio(bottom, text);
    if (topContrast < 3.5 || bottomContrast < 3.5) {
      return toRgbaString(adjusted, alpha);
    }
  }

  return `linear-gradient(180deg, ${toRgbaString(top, alpha)} 0%, ${toRgbaString(bottom, alpha)} 100%)`;
}

function solidColor(color: RGBA): RGBA {
  return { r: color.r, g: color.g, b: color.b, a: 1 };
}

function toHex(color: RGBA): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}

function toRgbaString(color: RGBA, alpha?: number): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  const a = alpha ?? color.a;
  const normalizedAlpha = Math.round(clamp(a, 0, 1) * 100) / 100;
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + normalizedAlpha + ')';
}
function buildBrandPalette(accent: RGBA) {
  const accentOpaque: RGBA = { ...accent, a: 1 };
  const from = lighten(accentOpaque, 0.32);
  const to = darken(accentOpaque, 0.26);
  const gradient = 
    'linear-gradient(120deg, ' + toHex(from) + ' 0%, ' + toHex(accentOpaque) + ' 52%, ' + toHex(to) + ' 100%)';
  return {
    gradient,
    fromHex: toHex(from),
    midHex: toHex(accentOpaque),
    toHex: toHex(to),
    textHex: pickReadableTextHex(accentOpaque),
    accent: accentOpaque,
  };
}

function pickReadableTextHex(color: RGBA): string {
  const contrastWithLight = contrastRatio(color, LIGHT_TEXT_COLOR);
  const contrastWithDark = contrastRatio(color, DARK_TEXT_COLOR);
  return contrastWithLight >= contrastWithDark ? LIGHT_TEXT_HEX : DARK_TEXT_HEX;
}

function hasReadableContrast(value: string | undefined, background: RGBA): boolean {
  const candidate = value ? extractFirstColor(value) : null;
  if (!candidate) return false;
  return contrastRatio(candidate, background) >= 3.5;
}

function isGradientValue(value: unknown): value is string {
  return typeof value === "string" && /\bgradient\(/i.test(value);
}

function contrastRatio(a: RGBA, b: RGBA): number {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: RGBA): number {
  const r = srgbChannel(color.r);
  const g = srgbChannel(color.g);
  const b = srgbChannel(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function srgbChannel(value: number): number {
  const channel = clamp(value, 0, 255) / 255;
  return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}


function clampChannel(value: number): number {
  return clamp(value, 0, 255);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
const DARK_ANCHOR: RGBA = { r: 8, g: 10, b: 22, a: 1 };




const LIGHT_TEXT_HEX = '#f8fafc';
const DARK_TEXT_HEX = '#0f172a';
const LIGHT_TEXT_COLOR = parseHexColor(LIGHT_TEXT_HEX) ?? WHITE;
const DARK_TEXT_COLOR = parseHexColor(DARK_TEXT_HEX) ?? BLACK;
const DEFAULT_ACCENT = parseHexColor('#6366f1') ?? { r: 99, g: 102, b: 241, a: 1 };
const FALLBACK_ERROR_COLOR = parseHexColor('#ef4444') ?? { r: 239, g: 68, b: 68, a: 1 } as RGBA;
const FALLBACK_WARNING_COLOR = parseHexColor('#f59e0b') ?? { r: 245, g: 158, b: 11, a: 1 } as RGBA;
const FALLBACK_SUCCESS_COLOR = parseHexColor('#22c55e') ?? { r: 34, g: 197, b: 94, a: 1 } as RGBA;




