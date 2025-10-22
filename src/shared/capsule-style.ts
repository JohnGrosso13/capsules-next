"use strict";

import { z } from "zod";

export const CAPSULE_ART_ASSET_KINDS = ["banner", "storeBanner", "tile", "logo", "avatar"] as const;
export type CapsuleArtAssetType = (typeof CAPSULE_ART_ASSET_KINDS)[number];

export const capsuleArtAssetKindSchema = z.enum(CAPSULE_ART_ASSET_KINDS);

export const CAPSULE_STYLE_CATEGORIES = ["palette", "lighting", "medium", "mood"] as const;
export type CapsuleStyleCategory = (typeof CAPSULE_STYLE_CATEGORIES)[number];

export type CapsuleStyleSelection = Partial<Record<CapsuleStyleCategory, string | null>>;

export type CapsuleStyleOption = {
  id: string;
  category: CapsuleStyleCategory;
  label: string;
  description?: string;
  instruction: string;
  appliesTo?: CapsuleArtAssetType[] | ["*"];
  defaultFor?: CapsuleArtAssetType[] | ["*"];
  weight?: number;
};

const styleOptions: CapsuleStyleOption[] = [
  {
    id: "palette.balanced",
    category: "palette",
    label: "Balanced contrast",
    description: "Clear subject/background separation for UI overlays.",
    instruction:
      "Keep colors balanced with confident contrast between subject and background so captions stay readable.",
    defaultFor: ["banner", "storeBanner", "tile", "avatar"],
  },
  {
    id: "palette.brand",
    category: "palette",
    label: "Brand-forward",
    description: "Rich jewel tones with a luminous accent.",
    instruction:
      "Lean into layered jewel tones with a single luminous accent so the composition feels confidently branded.",
    appliesTo: ["banner", "storeBanner", "tile"],
  },
  {
    id: "palette.vibrant",
    category: "palette",
    label: "Vibrant neon",
    description: "Electric gradients and deep shadows.",
    instruction:
      "Push toward neon accents with glossy gradients and deep shadowing for high-energy impact.",
    appliesTo: ["banner", "tile"],
  },
  {
    id: "palette.pastel",
    category: "palette",
    label: "Soft pastels",
    description: "Airy powdery hues with gentle blends.",
    instruction:
      "Use airy pastel hues with subtle complementary contrast and soft feathered transitions.",
    appliesTo: ["banner", "storeBanner", "tile", "avatar"],
  },
  {
    id: "palette.monochrome",
    category: "palette",
    label: "Monochrome",
    description: "Single-family palette driven by value shifts.",
    instruction:
      "Work within a refined monochrome palette, relying on value and texture changes instead of multiple colors.",
    appliesTo: ["banner", "logo", "avatar"],
  },
  {
    id: "palette.prompt",
    category: "palette",
    label: "Prompt decides",
    description: "Suppress defaults and follow the user's wording.",
    instruction:
      "Do not impose any color palette beyond what the user describes; obey their palette language exactly.",
    defaultFor: ["logo"],
  },
  {
    id: "lighting.soft",
    category: "lighting",
    label: "Soft editorial",
    description: "Flattering key light with gentle diffusion.",
    instruction:
      "Light the scene with soft, flattering illumination and clean gradients so details read at multiple sizes.",
    defaultFor: ["banner", "tile", "avatar"],
  },
  {
    id: "lighting.dramatic",
    category: "lighting",
    label: "Dramatic contrast",
    description: "Cinematic rim light and shadow play.",
    instruction:
      "Introduce dramatic lighting with defined highlights and cinematic shadows to add dimensional depth.",
    appliesTo: ["banner", "tile", "avatar"],
  },
  {
    id: "lighting.moody",
    category: "lighting",
    label: "Noir glow",
    description: "Low key lighting with selective glow accents.",
    instruction:
      "Keep lighting moody and low-key with selective glow accents or neon glints to build atmosphere.",
    appliesTo: ["banner", "tile"],
  },
  {
    id: "lighting.haze",
    category: "lighting",
    label: "Hazy ambience",
    description: "Diffused volumetrics with misty bloom.",
    instruction:
      "Add hazy ambience with volumetric light shafts and gentle bloom for a dreamy, cinematic finish.",
    appliesTo: ["banner", "storeBanner", "tile"],
  },
  {
    id: "lighting.prompt",
    category: "lighting",
    label: "Prompt decides",
    description: "Neutral lighting bias—follow the request.",
    instruction:
      "Avoid adding lighting cues beyond the user's direction; treat lighting as neutral unless specified.",
    defaultFor: ["logo"],
  },
  {
    id: "medium.polished",
    category: "medium",
    label: "Polished digital",
    description: "Modern digital art with light photoreal touches.",
    instruction:
      "Render with a polished digital aesthetic that blends illustration clarity with subtle photoreal detail.",
    defaultFor: ["banner", "storeBanner", "tile", "avatar"],
  },
  {
    id: "medium.vector",
    category: "medium",
    label: "Vector clarity",
    description: "Crisp edges and simplified shading.",
    instruction:
      "Keep shapes vector-friendly with crisp edges, limited shading, and clean negative space for scaling.",
    appliesTo: ["banner", "logo", "tile"],
    defaultFor: ["logo"],
  },
  {
    id: "medium.collage",
    category: "medium",
    label: "Mixed collage",
    description: "Layered tactile textures and cutouts.",
    instruction:
      "Layer tactile collage elements—paper cutouts, grain, and mixed media textures—for dimensional depth.",
    appliesTo: ["banner", "storeBanner", "tile"],
  },
  {
    id: "medium.render3d",
    category: "medium",
    label: "3D render",
    description: "Sculpted materials with realistic shading.",
    instruction:
      "Model the scene as a high-quality 3D render with believable materials, reflections, and depth cues.",
    appliesTo: ["banner", "tile", "avatar"],
  },
  {
    id: "medium.prompt",
    category: "medium",
    label: "Prompt decides",
    description: "Let the user's words drive the medium.",
    instruction:
      "Avoid assuming a medium; match the user's requested medium or leave it open for the model.",
    defaultFor: ["storeBanner"],
  },
  {
    id: "mood.confident",
    category: "mood",
    label: "Confident & welcoming",
    description: "Energetic but approachable community tone.",
    instruction:
      "Keep the mood confident and welcoming with a sense of forward momentum and community warmth.",
    defaultFor: ["banner", "storeBanner", "tile", "avatar"],
  },
  {
    id: "mood.playful",
    category: "mood",
    label: "Playful & bright",
    description: "Whimsical pacing and optimistic cues.",
    instruction:
      "Inject playful energy with light-hearted moments, rhythmic motion, and optimistic details.",
    appliesTo: ["banner", "tile", "avatar"],
  },
  {
    id: "mood.lux",
    category: "mood",
    label: "Lux & refined",
    description: "Premium calm with intentional minimalism.",
    instruction:
      "Project a refined, premium tone with restrained composition, intentional negative space, and elegant finishing.",
    appliesTo: ["banner", "storeBanner", "logo", "avatar"],
  },
  {
    id: "mood.edgy",
    category: "mood",
    label: "Edgy & bold",
    description: "High-intensity, experimental flair.",
    instruction:
      "Lean into bold, experimental energy with unexpected contrasts, expressive forms, and decisive motion.",
    appliesTo: ["banner", "tile", "logo"],
  },
  {
    id: "mood.prompt",
    category: "mood",
    label: "Prompt decides",
    description: "No preset mood—mirror the user.",
    instruction:
      "Do not preload a mood; interpret emotional tone strictly from the user's request.",
    defaultFor: ["logo"],
  },
];

function optionMatchesMode(option: CapsuleStyleOption, mode: CapsuleArtAssetType): boolean {
  if (!option.appliesTo || option.appliesTo.length === 0) return true;
  if (option.appliesTo.includes("*")) return true;
  return option.appliesTo.includes(mode);
}

export const capsuleStyleSelectionSchema = z
  .object({
    palette: z.string().optional().nullable(),
    lighting: z.string().optional().nullable(),
    medium: z.string().optional().nullable(),
    mood: z.string().optional().nullable(),
  })
  .partial()
  .optional()
  .nullable();

export type CapsuleStyleSelectionInput = z.infer<typeof capsuleStyleSelectionSchema>;

export function getCapsuleStyleOptionsByCategory(
  mode: CapsuleArtAssetType,
): Record<CapsuleStyleCategory, CapsuleStyleOption[]> {
  const grouped: Record<CapsuleStyleCategory, CapsuleStyleOption[]> = {
    palette: [],
    lighting: [],
    medium: [],
    mood: [],
  };

  for (const option of styleOptions) {
    if (optionMatchesMode(option, mode)) {
      grouped[option.category].push(option);
    }
  }

  for (const category of CAPSULE_STYLE_CATEGORIES) {
    grouped[category].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));
  }

  return grouped;
}

export function getDefaultCapsuleStyleSelection(mode: CapsuleArtAssetType): CapsuleStyleSelection {
  const options = getCapsuleStyleOptionsByCategory(mode);
  const selection: CapsuleStyleSelection = {};

  for (const category of CAPSULE_STYLE_CATEGORIES) {
    const categoryOptions = options[category];
    const defaultOption =
      categoryOptions.find((option) => {
        if (!option.defaultFor || option.defaultFor.length === 0) return false;
        if (option.defaultFor.includes("*")) return true;
        return option.defaultFor.includes(mode);
      }) ?? categoryOptions[0];

    selection[category] = defaultOption?.id ?? null;
  }

  return selection;
}

export function sanitizeCapsuleStyleSelection(
  mode: CapsuleArtAssetType,
  incoming: CapsuleStyleSelectionInput | null | undefined,
): CapsuleStyleSelection {
  const defaults = getDefaultCapsuleStyleSelection(mode);
  if (!incoming) return defaults;

  const options = getCapsuleStyleOptionsByCategory(mode);
  const normalized: CapsuleStyleSelection = {};

  for (const category of CAPSULE_STYLE_CATEGORIES) {
    const categoryOptions = options[category];
    const nextId = incoming?.[category] ?? null;
    const matched = nextId ? categoryOptions.find((option) => option.id === nextId) : null;
    normalized[category] = matched?.id ?? defaults[category] ?? null;
  }

  return normalized;
}

export function resolveCapsuleStyleInstructions(
  mode: CapsuleArtAssetType,
  selection: CapsuleStyleSelection,
): string[] {
  const options = getCapsuleStyleOptionsByCategory(mode);
  const lines: string[] = [];

  for (const category of CAPSULE_STYLE_CATEGORIES) {
    const selectedId = selection[category];
    if (!selectedId) continue;
    const option = options[category].find((entry) => entry.id === selectedId);
    if (!option) continue;
    const line = option.instruction.trim();
    if (line.length) {
      lines.push(line);
    }
  }

  return lines;
}

export function deriveStyleSummary(selection: CapsuleStyleSelection): string | null {
  const parts: string[] = [];
  for (const category of CAPSULE_STYLE_CATEGORIES) {
    const value = selection[category];
    if (!value) continue;
    parts.push(`${category}:${value}`);
  }
  return parts.length ? parts.join(" | ") : null;
}
