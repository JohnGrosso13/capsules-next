"use client";

import { z } from "zod";

import { aiImageVariantSchema } from "@/shared/schemas/ai";

export type CapsuleCustomizerMode = "banner" | "storeBanner" | "tile" | "logo" | "avatar";

export type CapsulePromptClarifier = {
  prompt: string;
  suggestions: string[];
  prompterChips?: string[];
};

export type BannerCrop = {
  offsetX: number;
  offsetY: number;
};

export type SelectedBanner =
  | ({
        kind: "upload";
        name: string;
        url: string;
        file: File | null;
      } & { crop: BannerCrop })
  | ({
        kind: "memory";
        id: string;
        title: string | null;
        url: string;
        fullUrl: string | null;
      } & { crop: BannerCrop })
  | { kind: "ai"; prompt: string };

export const capsuleVariantSchema = aiImageVariantSchema.pick({
  id: true,
  runId: true,
  assetKind: true,
  branchKey: true,
  version: true,
  imageUrl: true,
  thumbUrl: true,
  metadata: true,
  parentVariantId: true,
  createdAt: true,
});

export type CapsuleVariant = z.infer<typeof capsuleVariantSchema>;

export type CroppableBanner = Extract<SelectedBanner, { kind: "upload" | "memory" }>;

export function cloneSelectedBanner(banner: SelectedBanner): SelectedBanner {
  if (banner.kind === "upload") {
    return {
      kind: "upload",
      name: banner.name,
      url: banner.url,
      file: banner.file ?? null,
      crop: { ...banner.crop },
    };
  }
  if (banner.kind === "memory") {
    return {
      kind: "memory",
      id: banner.id,
      title: banner.title,
      url: banner.url,
      fullUrl: banner.fullUrl,
      crop: { ...banner.crop },
    };
  }
  return { ...banner };
}

export function isCroppableBanner(banner: SelectedBanner | null): banner is CroppableBanner {
  return Boolean(banner && banner.kind !== "ai");
}

export function bannerSourceKey(banner: SelectedBanner | null): string | null {
  if (!banner) return null;
  if (banner.kind === "memory") return `memory:${banner.id}`;
  if (banner.kind === "upload") return `upload:${banner.url}`;
  if (banner.kind === "ai") return `ai:${banner.prompt}`;
  return null;
}

export type ChatRole = "assistant" | "user";

export type CapsuleCustomizerSaveResult =
  | { type: "banner"; bannerUrl: string | null }
  | { type: "storeBanner"; storeBannerUrl: string | null }
  | { type: "tile"; tileUrl: string | null }
  | { type: "logo"; logoUrl: string | null }
  | { type: "avatar"; avatarUrl: string | null };

export type CapsuleVariantState = {
  items: CapsuleVariant[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (variant: CapsuleVariant) => void;
};

export type CapsuleStylePersona = {
  id: string;
  name: string;
  palette: string | null;
  medium: string | null;
  camera: string | null;
  notes: string | null;
  capsuleId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CapsuleAdvancedOptionsState = {
  seed: number | null;
  guidance: number | null;
  setSeed: (value: number | null) => void;
  setGuidance: (value: number | null) => void;
  clear: () => void;
};

export type CapsulePersonaState = {
  items: CapsuleStylePersona[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  refresh: () => Promise<void>;
  select: (personaId: string | null) => void;
  create: (input: {
    name: string;
    palette?: string | null;
    medium?: string | null;
    camera?: string | null;
    notes?: string | null;
  }) => Promise<void>;
  remove: (personaId: string) => Promise<void>;
};

export type PromptHistorySnapshot = {
  base: string | null;
  refinements: string[];
  sourceKey: string | null;
};

export type ChatBannerOption = {
  id: string;
  label: string;
  previewUrl: string;
  banner: SelectedBanner;
  promptState: PromptHistorySnapshot;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  bannerOptions?: ChatBannerOption[];
  suggestions?: string[];
};
