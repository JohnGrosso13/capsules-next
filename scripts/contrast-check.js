// Quick contrast audit for generated themes.
// Approximates the theme generator in src/server/ai/styler.ts
// and computes contrast ratios for key pairs.

function hexToRgb(hex) {
  const value = hex.trim().replace(/^#/, "");
  const v =
    value.length === 3
      ? `${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
      : value.slice(0, 6);
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return { r, g, b };
}

function mix(a, b, t) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return {
    r: clamp(a.r + (b.r - a.r) * t),
    g: clamp(a.g + (b.g - a.g) * t),
    b: clamp(a.b + (b.b - a.b) * t),
  };
}

function tint(rgb, amount) {
  return mix(rgb, { r: 255, g: 255, b: 255 }, amount);
}
function shade(rgb, amount) {
  return mix(rgb, { r: 0, g: 0, b: 0 }, amount);
}

function luminance({ r, g, b }) {
  // Same simple luma heuristic used in styler.ts (not WCAG relative luminance)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function relLuminance({ r, g, b }) {
  // WCAG relative luminance
  const srgb = [r, g, b].map((v) => v / 255);
  const lin = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(a, b) {
  const L1 = relLuminance(a);
  const L2 = relLuminance(b);
  const [lighter, darker] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

function blendOver(bg, fg, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

function enforceContrastRgb(bg, text, minRatio) {
  if (contrastRatio(bg, text) >= minRatio) return bg;
  const textLum = relLuminance(text);
  const bgLum = relLuminance(bg);
  const target = textLum > bgLum ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  let lo = 0,
    hi = 1,
    best = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const candidate = mix(bg, target, mid);
    if (contrastRatio(candidate, text) >= minRatio) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const adjusted = mix(bg, target, best);
  if (contrastRatio(adjusted, text) >= minRatio) return adjusted;
  return target;
}

const TEXT_LIGHT = { r: 255, g: 255, b: 255 };
const TEXT_DARK = { r: 0, g: 0, b: 0 };

function pickTextBaseFor(bg) {
  return contrastRatio(TEXT_LIGHT, bg) >= contrastRatio(TEXT_DARK, bg) ? TEXT_LIGHT : TEXT_DARK;
}

function solveTextAlphaForContrast(bg, textBase, minRatio) {
  if (contrastRatio(textBase, bg) < minRatio) return 1;
  let lo = 0;
  let hi = 1;
  let best = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const blended = blendOver(bg, textBase, mid);
    const cr = contrastRatio(blended, bg);
    if (cr >= minRatio) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return Math.max(0, Math.min(1, best));
}

function solveOverlayAlphaForContrast(bg, overlay, text, minRatio) {
  const maxA = 0.9;
  if (contrastRatio(text, bg) >= minRatio) return 0;
  let lo = 0,
    hi = maxA,
    best = maxA;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const adjustedBg = blendOver(bg, overlay, mid);
    const cr = contrastRatio(text, adjustedBg);
    if (cr >= minRatio) {
      best = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return Math.max(0, Math.min(1, best));
}

function buildThemeSample(hex) {
  const rgb = hexToRgb(hex);
  const isLight = luminance(rgb) > 0.55;

  const neutralBase = isLight ? { r: 246, g: 248, b: 255 } : { r: 10, g: 12, b: 30 };
  const neutralAlt = isLight ? { r: 235, g: 240, b: 252 } : { r: 14, g: 18, b: 36 };
  const neutralDeep = isLight ? { r: 220, g: 226, b: 245 } : { r: 5, g: 8, b: 20 };

  const surfaceStrength = isLight ? 0.18 : 0.26;
  const surfaceAltStrength = isLight ? 0.12 : 0.2;

  let cardBg1Rgb = mix(neutralBase, rgb, surfaceStrength);
  let cardBg2Rgb = mix(neutralAlt, rgb, surfaceAltStrength);
  let railBgRgb = mix(neutralAlt, rgb, isLight ? 0.1 : 0.22);
  let headerTopRgb = mix(neutralBase, rgb, isLight ? 0.1 : 0.24);
  let headerBottomRgb = mix(neutralAlt, rgb, isLight ? 0.08 : 0.2);
  let headerTintFromRgb = mix(rgb, neutralAlt, isLight ? 0.2 : 0.28);
  let headerTintToRgb = mix(rgb, neutralDeep, isLight ? 0.14 : 0.26);
  let glassBg1Rgb = mix(neutralAlt, rgb, isLight ? 0.08 : 0.16);
  let glassBg2Rgb = mix(neutralAlt, rgb, isLight ? 0.05 : 0.12);
  let pillBg1Rgb = mix(neutralAlt, rgb, isLight ? 0.08 : 0.18);
  let pillBg2Rgb = mix(neutralAlt, rgb, isLight ? 0.05 : 0.16);

  const brandFromRgb = tint(rgb, isLight ? 0.3 : 0.18);
  const brandMidRgb = rgb;
  const brandToRgb = shade(rgb, isLight ? 0.15 : 0.25);

  const MIN_PRIMARY = 16;
  const MIN_SECONDARY = 12;
  const MIN_BRAND_TARGET = 16;
  const MIN_BRAND_FALLBACK = 12;

  let textBase = pickTextBaseFor(cardBg1Rgb);
  cardBg1Rgb = enforceContrastRgb(cardBg1Rgb, textBase, MIN_PRIMARY);
  textBase = pickTextBaseFor(cardBg1Rgb);

  const adjustPrimary = (value) => enforceContrastRgb(value, textBase, MIN_PRIMARY);
  const adjustSecondary = (value) => enforceContrastRgb(value, textBase, MIN_SECONDARY);

  cardBg2Rgb = adjustSecondary(cardBg2Rgb);
  railBgRgb = adjustPrimary(railBgRgb);
  headerTopRgb = adjustPrimary(headerTopRgb);
  headerBottomRgb = adjustPrimary(headerBottomRgb);
  headerTintFromRgb = adjustSecondary(headerTintFromRgb);
  headerTintToRgb = adjustSecondary(headerTintToRgb);
  glassBg1Rgb = adjustSecondary(glassBg1Rgb);
  glassBg2Rgb = adjustSecondary(glassBg2Rgb);
  pillBg1Rgb = adjustSecondary(pillBg1Rgb);
  pillBg2Rgb = adjustSecondary(pillBg2Rgb);

  const appBaseRgb = enforceContrastRgb(
    mix(neutralDeep, rgb, isLight ? 0.06 : 0.14),
    textBase,
    MIN_SECONDARY,
  );
  const appTopRgb = adjustSecondary(mix(appBaseRgb, brandFromRgb, 0.12));
  const appBottomRgb = adjustSecondary(mix(appBaseRgb, brandToRgb, 0.12));

  const textAlpha = solveTextAlphaForContrast(cardBg1Rgb, textBase, MIN_PRIMARY);
  const text2Alpha = solveTextAlphaForContrast(cardBg1Rgb, textBase, MIN_SECONDARY);

  let brandTextBase = pickTextBaseFor(brandMidRgb);
  const brandTextIsLight = brandTextBase.r > 128;
  let overlayColor = brandTextIsLight ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  let overlayForBrand = solveOverlayAlphaForContrast(
    brandMidRgb,
    overlayColor,
    brandTextBase,
    MIN_BRAND_TARGET,
  );
  let brandMidAdjusted = blendOver(brandMidRgb, overlayColor, overlayForBrand);
  if (contrastRatio(brandTextBase, brandMidAdjusted) < MIN_BRAND_TARGET) {
    overlayForBrand = solveOverlayAlphaForContrast(
      brandMidRgb,
      overlayColor,
      brandTextBase,
      MIN_BRAND_FALLBACK,
    );
    brandMidAdjusted = blendOver(brandMidRgb, overlayColor, overlayForBrand);
  }
  const ctaOverlayAlpha = Math.min(0.95, overlayForBrand + 0.08);
  const ctaMid = blendOver(brandMidRgb, overlayColor, ctaOverlayAlpha);

  return {
    isLight,
    cardBg1Rgb,
    cardBg2Rgb,
    railBgRgb,
    headerTopRgb,
    headerBottomRgb,
    headerTintFromRgb,
    headerTintToRgb,
    glassBg1Rgb,
    glassBg2Rgb,
    pillBg1Rgb,
    pillBg2Rgb,
    appTopRgb,
    appBottomRgb,
    textBase,
    textAlpha,
    text2Alpha,
    brandMidAdjusted,
    brandTextBase,
    ctaMid,
    overlayForBrand,
  };
}

const samples = [
  "#8b5cf6", // violet
  "#6366f1", // indigo
  "#22d3ee", // cyan
  "#06b6d4", // cyan darker
  "#34d399", // mint
  "#10b981", // emerald
  "#f59e0b", // amber
  "#eab308", // yellow
  "#ef4444", // red
  "#111111", // near black
  "#f5f5dc", // beige
  "#ffffff", // white
];

function fmt(n) {
  return Math.round(n * 100) / 100;
}

console.log("Theme contrast checks (selected surfaces):\n");
for (const hex of samples) {
  const sample = buildThemeSample(hex);
  const textColor = blendOver(sample.cardBg1Rgb, sample.textBase, sample.textAlpha);
  const text2Color = blendOver(sample.cardBg1Rgb, sample.textBase, sample.text2Alpha);
  const cardContrast = contrastRatio(textColor, sample.cardBg1Rgb);
  const text2Contrast = contrastRatio(text2Color, sample.cardBg1Rgb);
  const appContrast = contrastRatio(textColor, sample.appTopRgb);
  const railContrast = contrastRatio(textColor, sample.railBgRgb);
  const headerContrast = contrastRatio(textColor, sample.headerTopRgb);
  const brandContrast = contrastRatio(sample.brandTextBase, sample.brandMidAdjusted);
  const ctaContrast = contrastRatio(sample.brandTextBase, sample.ctaMid);

  console.log(
    `${hex} ${sample.isLight ? "(light-ish)" : "(dark-ish)"} -> ` +
      `card:${fmt(cardContrast)} primary / ${fmt(text2Contrast)} secondary, ` +
      `app:${fmt(appContrast)}, rail:${fmt(railContrast)}, header:${fmt(headerContrast)}, ` +
      `brand:${fmt(brandContrast)}, cta:${fmt(ctaContrast)}, overlay=${fmt(sample.overlayForBrand)}`,
  );
}

console.log(
  "\nTargets: Primary ≥16:1, Secondary ≥12:1, others ≥10:1. This approximates theme generation; run UI for final verification.\n",
);
