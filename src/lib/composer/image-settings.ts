const QUALITY_VALUES = ["low", "standard", "high"] as const;

export const COMPOSER_IMAGE_SETTINGS_STORAGE_KEY = "capsules:composer:imageSettings";
export const COMPOSER_IMAGE_SETTINGS_EVENT = "capsules:composer:image-settings-change";

export const COMPOSER_IMAGE_QUALITY_OPTIONS = [...QUALITY_VALUES] as const;

export type ComposerImageQuality = (typeof QUALITY_VALUES)[number];

export type ComposerImageSettings = {
  quality: ComposerImageQuality;
};

export const DEFAULT_COMPOSER_IMAGE_SETTINGS: ComposerImageSettings = {
  quality: "standard",
};

const QUALITY_SET = new Set<string>(QUALITY_VALUES);

function normalizeQuality(value: unknown): ComposerImageQuality | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized.length) return null;
  return QUALITY_SET.has(normalized) ? (normalized as ComposerImageQuality) : null;
}

export function coerceComposerImageQuality(value: unknown): ComposerImageQuality | null {
  return normalizeQuality(value);
}

export function parseComposerImageSettings(value: string | null | undefined): ComposerImageSettings {
  if (!value) return DEFAULT_COMPOSER_IMAGE_SETTINGS;
  try {
    const parsed = JSON.parse(value) as Partial<ComposerImageSettings>;
    const quality = coerceComposerImageQuality(parsed?.quality) ?? DEFAULT_COMPOSER_IMAGE_SETTINGS.quality;
    return { quality };
  } catch {
    return DEFAULT_COMPOSER_IMAGE_SETTINGS;
  }
}

export function serializeComposerImageSettings(settings: ComposerImageSettings): string {
  return JSON.stringify({
    quality: settings.quality,
  });
}

export function extractComposerImageOptions(
  raw?: Record<string, unknown> | null,
): Partial<{ quality: ComposerImageQuality }> {
  if (!raw || typeof raw !== "object") return {};
  const options: Partial<{ quality: ComposerImageQuality }> = {};
  const candidateQuality = coerceComposerImageQuality((raw as { imageQuality?: unknown }).imageQuality);
  if (candidateQuality) {
    options.quality = candidateQuality;
  }
  return options;
}

export function titleCaseComposerQuality(value: ComposerImageQuality): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
