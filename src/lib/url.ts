const LOCAL_HOSTNAME_SUFFIXES = [
  ".local",
  ".localdomain",
  ".test",
];

function normalizeHostnameValue(hostname: string): string {
  return hostname.trim().toLowerCase();
}

export function isLocalLikeHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const value = normalizeHostnameValue(hostname);
  if (!value.length) return false;
  if (value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::]") return true;
  if (value === "0.0.0.0") return true;
  for (const suffix of LOCAL_HOSTNAME_SUFFIXES) {
    if (value.endsWith(suffix)) return true;
  }
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (value.startsWith("fe80:")) return true;
  if (/^169\.254\./.test(value)) return true;
  return false;
}

export function resolveToAbsoluteUrl(
  input: string | null | undefined,
  originOverride?: string | null,
): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed.length) return null;

  let currentOrigin = originOverride ?? null;
  if (!currentOrigin && typeof window !== "undefined") {
    currentOrigin = window.location.origin;
  }

  try {
    const absolute = new URL(trimmed);
    if (currentOrigin) {
      try {
        const current = new URL(currentOrigin);
        if (
          isLocalLikeHostname(absolute.hostname) &&
          isLocalLikeHostname(current.hostname) &&
          absolute.hostname !== current.hostname
        ) {
          absolute.protocol = current.protocol;
          absolute.hostname = current.hostname;
          absolute.port = current.port;
        }
      } catch {
        // noop – fallback to the parsed absolute URL
      }
    }
    return absolute.toString();
  } catch {
    if (!currentOrigin) {
      return trimmed;
    }
    try {
      return new URL(trimmed, currentOrigin).toString();
    } catch {
      return trimmed;
    }
  }
}

export function resolveRedirectUrl(target: string | null | undefined, siteUrl: string) {
  const base = siteUrl.replace(/\/$/, "");
  if (!target) return base;
  const trimmed = target.trim();
  if (!trimmed) return base;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${base}${trimmed}`;
  return `${base}/${trimmed}`;
}

export function appendQueryParams(url: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${search.toString()}`;
}
