export type PresetThemeVariantConfig = {
  seedHex: string;
  accentHex?: string;
  accentGlow?: number;
  overrides?: Record<string, string>;
};

export type PresetThemeConfig = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  variants: Record<"light" | "dark", PresetThemeVariantConfig>;
};

export const PRESET_THEME_CONFIGS: PresetThemeConfig[] = [
  {
    id: "dawn",
    title: "Dawn",
    description: "Sunrise apricot with soft coral highlights.",
    keywords: ["dawn", "sunrise", "dawn theme"],
    variants: {
      light: { seedHex: "#f7c5a8", accentHex: "#f97316", accentGlow: 0.3 },
      dark: { seedHex: "#24151c", accentHex: "#f97316", accentGlow: 0.32 },
    },
  },
  {
    id: "dusk",
    title: "Dusk",
    description: "Twilight plum with indigo neon.",
    keywords: ["dusk", "twilight", "dusk theme", "plum"],
    variants: {
      light: { seedHex: "#cdb8ff", accentHex: "#6366f1", accentGlow: 0.32 },
      dark: { seedHex: "#0f1124", accentHex: "#a855f7", accentGlow: 0.34 },
    },
  },
  {
    id: "glacier",
    title: "Glacier",
    description: "Icy blue glass with teal highlights.",
    keywords: ["glacier", "ice", "frost", "glacier theme"],
    variants: {
      light: { seedHex: "#cfe8ff", accentHex: "#0ea5e9", accentGlow: 0.28 },
      dark: { seedHex: "#0b1628", accentHex: "#38bdf8", accentGlow: 0.3 },
    },
  },
  {
    id: "grove",
    title: "Grove",
    description: "Mossy greens with fresh mint accents.",
    keywords: ["grove", "forest", "green", "grove theme"],
    variants: {
      light: { seedHex: "#c9f0dd", accentHex: "#22c55e", accentGlow: 0.28 },
      dark: { seedHex: "#0d2218", accentHex: "#22c55e", accentGlow: 0.3 },
    },
  },
  {
    id: "ember",
    title: "Ember",
    description: "Honeyed amber with ember glow.",
    keywords: ["ember", "amber", "ember theme"],
    variants: {
      light: { seedHex: "#f8e0b3", accentHex: "#f59e0b", accentGlow: 0.3 },
      dark: { seedHex: "#24160b", accentHex: "#f97316", accentGlow: 0.32 },
    },
  },
  {
    id: "mono",
    title: "Mono",
    description: "Soft grayscale with slate accents.",
    keywords: ["mono", "minimal", "monochrome"],
    variants: {
      light: { seedHex: "#dfe3ec", accentHex: "#111827", accentGlow: 0.2 },
      dark: { seedHex: "#0b0e16", accentHex: "#3f4c6b", accentGlow: 0.24 },
    },
  },
];

export const PRESET_THEME_CONFIG_BY_ID = new Map(
  PRESET_THEME_CONFIGS.map((config) => [config.id, config] as const),
);
