import { isLocalLikeHostname, resolveToAbsoluteUrl } from "@/lib/url";
import type { CloudflareImageVariantSet } from "@/lib/cloudflare/images";

const envSource =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? (process.env as Record<string, string | undefined>)
    : {};

const FORCE_ENV_FLAG = normalizeBoolean(envSource.NEXT_PUBLIC_FORCE_CLOUDFLARE_IMAGES);
const OVERRIDE_STORAGE_KEY = "capsules:forceCloudflareImages";
const OVERRIDE_QUERY_KEY = "cloudflareImages";

function normalizeBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readOverrideFromSearch(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(OVERRIDE_QUERY_KEY)) return null;
    const raw = params.get(OVERRIDE_QUERY_KEY)?.trim().toLowerCase();
    const enabled = !(raw === "0" || raw === "false" || raw === "off");
    try {
      window.localStorage?.setItem(OVERRIDE_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // ignore storage errors (private mode, etc.)
    }
    return enabled;
  } catch {
    return null;
  }
}

function readOverrideFromStorage(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage?.getItem(OVERRIDE_STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // ignore
  }
  return null;
}

export function shouldForceCloudflareImages(): boolean {
  if (typeof window === "undefined") {
    return FORCE_ENV_FLAG;
  }
  const fromSearch = readOverrideFromSearch();
  if (fromSearch !== null) return fromSearch;
  const fromStorage = readOverrideFromStorage();
  if (fromStorage !== null) return fromStorage;
  return FORCE_ENV_FLAG;
}

export function containsCloudflareResize(url: string | null | undefined): boolean {
  return typeof url === "string" && url.includes("/cdn-cgi/image/");
}

export function buildLocalImageVariants(
  originalUrl: string,
  thumbnailUrl?: string | null,
  origin?: string | null,
): CloudflareImageVariantSet {
  const absoluteOriginal = resolveToAbsoluteUrl(originalUrl, origin) ?? originalUrl;
  const absoluteThumbCandidate = resolveToAbsoluteUrl(thumbnailUrl ?? null, origin);
  const safeThumb =
    absoluteThumbCandidate && !containsCloudflareResize(absoluteThumbCandidate)
      ? absoluteThumbCandidate
      : absoluteOriginal;

  return {
    original: absoluteOriginal,
    feed: safeThumb,
    promo: safeThumb,
    thumb: safeThumb,
    full: absoluteOriginal,
    feedSrcset: null,
    promoSrcset: null,
    fullSrcset: null,
  };
}

function normalizeHostname(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

function isHostCloudflareCompatible(hostname: string | null | undefined): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  if (isLocalLikeHostname(normalized)) return false;
  if (/ngrok/i.test(normalized)) return false;
  if (/\.vercel\.app$/.test(normalized)) return false;
  return true;
}

function extractHostname(origin: string | null | undefined): string | null {
  if (typeof origin !== "string") return null;
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function shouldUseCloudflareImagesForHost(hostname: string | null | undefined): boolean {
  if (shouldForceCloudflareImages()) return true;
  return isHostCloudflareCompatible(hostname);
}

export function shouldUseCloudflareImagesForOrigin(origin: string | null | undefined): boolean {
  if (shouldForceCloudflareImages()) return true;
  const hostname = extractHostname(origin);
  return shouldUseCloudflareImagesForHost(hostname);
}

export function shouldBypassCloudflareImages(): boolean {
  if (shouldForceCloudflareImages()) return false;
  if (typeof window === "undefined") {
    return !FORCE_ENV_FLAG;
  }
  const host = window.location.hostname?.toLowerCase() ?? "";
  if (!host.length) return false;
  return !shouldUseCloudflareImagesForHost(host);
}
