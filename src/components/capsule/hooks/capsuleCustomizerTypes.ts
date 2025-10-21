"use client";

export type CapsuleCustomizerMode = "banner" | "storeBanner" | "tile" | "logo" | "avatar";

export type BannerCrop = {
  offsetX: number;
  offsetY: number;
};

export type SelectedBanner =
  | ({ kind: "upload"; name: string; url: string; file: File | null } & { crop: BannerCrop })
  | ({
      kind: "memory";
      id: string;
      title: string | null;
      url: string;
      fullUrl: string | null;
    } & { crop: BannerCrop })
  | { kind: "ai"; prompt: string };

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
};
