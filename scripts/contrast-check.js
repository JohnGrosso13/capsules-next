// Quick contrast audit for generated themes.
// Approximates the theme generator in src/server/ai/styler.ts
// and computes contrast ratios for key pairs.

function hexToRgb(hex) {
  const value = hex.trim().replace(/^#/, "");
  const v = value.length === 3
    ? `${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
    : value.slice(0, 6);
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(Math.round(r))}${toHex(Math.round(g))}${toHex(Math.round(b))}`;
}

function mix(a, b, t) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return {
    r: clamp(a.r + (b.r - a.r) * t),
    g: clamp(a.g + (b.g - a.g) * t),
    b: clamp(a.b + (b.b - a.b) * t),
  };
}

function tint(rgb, amount) { return mix(rgb, { r: 255, g: 255, b: 255 }, amount); }
function shade(rgb, amount) { return mix(rgb, { r: 0, g: 0, b: 0 }, amount); }

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

function ensureContrast(bg, fgLight = {r:255,g:255,b:255}, fgDark = {r:14,g:16,b:36}) {
  return luminance(bg) > 0.6 ? fgDark : fgLight;
}

function solveOverlayAlphaForContrast(bg, overlay, text, minRatio) {
  const maxA = 0.9;
  if (contrastRatio(text, bg) >= minRatio) return 0;
  let lo = 0, hi = maxA, best = maxA;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const adjustedBg = blendOver(bg, overlay, mid);
    const cr = contrastRatio(text, adjustedBg);
    if (cr >= minRatio) { best = mid; hi = mid; } else { lo = mid; }
  }
  return Math.max(0, Math.min(1, best));
}

function buildSiteThemeVarsFromHex(hex) {
  const rgb = hexToRgb(hex);
  const isLight = luminance(rgb) > 0.55;

  const neutralBase = isLight ? { r: 246, g: 248, b: 255 } : { r: 10, g: 12, b: 30 };
  const neutralAlt = isLight ? { r: 235, g: 240, b: 252 } : { r: 14, g: 18, b: 36 };
  const neutralDeep = isLight ? { r: 220, g: 226, b: 245 } : { r: 5, g: 8, b: 20 };

  const surfaceStrength = isLight ? 0.18 : 0.26;
  const surfaceAltStrength = isLight ? 0.12 : 0.2;

  const cardBg1Rgb = mix(neutralBase, rgb, surfaceStrength);
  const brandFromRgb = tint(rgb, isLight ? 0.30 : 0.18);
  const brandMidRgb = rgb;
  const brandToRgb = shade(rgb, isLight ? 0.15 : 0.25);

  const dark = {r:14,g:16,b:36};
  const light = {r:255,g:255,b:255};
  const textBase = contrastRatio(light, cardBg1Rgb) >= contrastRatio(dark, cardBg1Rgb) ? light : dark;
  // Enforce >=10:1 on text vs card
  const minRatio = 10;
  let textAlpha = 1;
  // minimal alpha search
  if (contrastRatio(textBase, cardBg1Rgb) >= minRatio) {
    let lo=0, hi=1, best=1; for(let i=0;i<16;i++){ const mid=(lo+hi)/2; const blended=blendOver(cardBg1Rgb, textBase, mid); const cr=contrastRatio(blended, cardBg1Rgb); if (cr>=minRatio){ best=mid; hi=mid;} else {lo=mid;} } textAlpha=best;
  }
  const textRgb = textBase; // report base; alpha used in CSS

  const brandTextBase = contrastRatio(light, brandMidRgb) >= contrastRatio(dark, brandMidRgb) ? light : dark;
  const overlay = (brandTextBase.r+brandTextBase.g+brandTextBase.b) > (255*1.5) ? {r:0,g:0,b:0} : {r:255,g:255,b:255};
  const overlayAlpha = solveOverlayAlphaForContrast(brandMidRgb, overlay, brandTextBase, minRatio);
  const brandMidAdjusted = blendOver(brandMidRgb, overlay, overlayAlpha);
  const textOnBrandRgb = brandTextBase;

  return { cardBg1Rgb, textRgb, brandMidRgb: brandMidAdjusted, textOnBrandRgb, brandFromRgb, brandToRgb, isLight, textAlpha, overlayAlpha };
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

function fmt(n) { return Math.round(n * 100) / 100; }

console.log("Theme contrast checks (text vs card, on-brand vs brand mid):\n");
for (const hex of samples) {
  const { cardBg1Rgb, textRgb, brandMidRgb, textOnBrandRgb, isLight, textAlpha, overlayAlpha } = buildSiteThemeVarsFromHex(hex);
  const crText = contrastRatio(blendOver(cardBg1Rgb, textRgb, textAlpha), cardBg1Rgb);
  const crBrand = contrastRatio(textOnBrandRgb, brandMidRgb);
  const passesAAAText = crText >= 7.0;
  const passesAAALarge = crText >= 4.5;
  const passesBrandAAAText = crBrand >= 7.0;
  const passesBrandAAALarge = crBrand >= 4.5;
  const passes10 = crText >= 10 && crBrand >= 10;
  console.log(`${hex} ${isLight ? '(light-ish)' : '(dark-ish)'} -> text/card: ${fmt(crText)}; brandText/brand: ${fmt(crBrand)}; ` +
    `textAlpha=${fmt(textAlpha)}; brandOverlay=${fmt(overlayAlpha)} ${passes10 ? '[>=10:1 OK]' : ''}`);
}

console.log("\nNote: This approximates; gradients and alpha layers may reduce real-world contrast.");
