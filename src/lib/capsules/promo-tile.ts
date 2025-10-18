import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";

export function resolveCapsuleHandle(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!trimmed.length) return null;
  return trimmed.replace(/^@/, "").replace(/^\/+capsule\//, "");
}

export type CapsuleTileMediaSources = {
  promoTileUrl?: string | null;
  bannerUrl?: string | null;
  coverUrl?: string | null;
  logoUrl?: string | null;
};

export type CapsuleTileMedia = {
  bannerUrl: string | null;
  logoUrl: string | null;
};

function toAbsolute(url: string | null): string | null {
  if (!url) return null;
  return resolveToAbsoluteUrl(url) ?? url;
}

export function resolveCapsuleTileMedia(
  sources: CapsuleTileMediaSources,
  options: { absolute?: boolean } = {},
): CapsuleTileMedia {
  const { absolute = true } = options;
  const prioritizedBanner = sources.promoTileUrl ?? sources.bannerUrl ?? sources.coverUrl ?? null;
  const normalizedBanner = normalizeMediaUrl(prioritizedBanner);
  const normalizedLogo = normalizeMediaUrl(sources.logoUrl ?? null);
  if (absolute) {
    return {
      bannerUrl: toAbsolute(normalizedBanner),
      logoUrl: toAbsolute(normalizedLogo),
    };
  }
  return {
    bannerUrl: normalizedBanner,
    logoUrl: normalizedLogo,
  };
}

export function resolveCapsuleHref(
  slug: string | null | undefined,
  explicit: string | null | undefined = null,
): string | null {
  if (typeof explicit === "string") {
    const trimmedExplicit = explicit.trim();
    if (trimmedExplicit.length) return trimmedExplicit;
  }
  if (!slug) return null;
  const trimmedSlug = slug.trim();
  if (!trimmedSlug.length) return null;
  if (trimmedSlug.startsWith("/")) return trimmedSlug;
  const handle = resolveCapsuleHandle(trimmedSlug);
  if (handle) return `/capsule/${handle}`;
  const withoutAt = trimmedSlug.replace(/^@/, "");
  return withoutAt.startsWith("/capsule/") ? withoutAt : `/capsule/${withoutAt}`;
}
