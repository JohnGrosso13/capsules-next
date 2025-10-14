const LOCAL_HOSTNAME_SUFFIXES = [".local", ".localdomain", ".test"];

function normalizeHostnameValue(hostname: string): string {
  return hostname.trim().toLowerCase();
}

export function isLocalLikeHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const value = normalizeHostnameValue(hostname);
  if (!value.length) return false;
  if (value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::]")
    return true;
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
        const absoluteHostname = absolute.hostname;
        const currentHostname = current.hostname;
        const hostsMatch = absoluteHostname === currentHostname;

        if (hostsMatch) {
          if (absolute.protocol !== current.protocol) {
            absolute.protocol = current.protocol;
          }
          if (absolute.port !== current.port) {
            if (current.port) {
              absolute.port = current.port;
            } else if (absolute.port === "80" || absolute.port === "443") {
              absolute.port = "";
            }
          }
        } else if (
          isLocalLikeHostname(absoluteHostname) &&
          isLocalLikeHostname(currentHostname) &&
          absoluteHostname !== currentHostname
        ) {
          absolute.protocol = current.protocol;
          absolute.hostname = current.hostname;
          absolute.port = current.port;
        } else if (
          absolute.protocol === "http:" &&
          current.protocol === "https:" &&
          !isLocalLikeHostname(absoluteHostname)
        ) {
          absolute.protocol = "https:";
          if (absolute.port === "80") {
            absolute.port = "";
          }
        }
      } catch {
        // noop - fallback to the parsed absolute URL
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

function safeParseUrl(value: string | null): URL | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function normalizeHeaderValue(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const first = value.split(",")[0]?.trim() ?? "";
  return first.length ? first : null;
}

type HeaderLike = {
  get(name: string): string | null;
};

function extractHeaders(
  input: Request | { headers?: HeaderLike | null } | null | undefined,
): HeaderLike | null {
  if (!input) return null;
  if (input instanceof Request) return input.headers;
  if (input.headers && typeof input.headers.get === "function") {
    return input.headers;
  }
  return null;
}

export function deriveRequestOrigin(
  input: Request | { headers?: HeaderLike | null } | null | undefined,
): string | null {
  const headers = extractHeaders(input);
  if (!headers) return null;

  const getHeader = (name: string) => normalizeHeaderValue(headers.get(name));

  const originHeader = getHeader("origin");
  const originUrl =
    originHeader && originHeader.toLowerCase() !== "null" ? safeParseUrl(originHeader) : null;
  if (originUrl) {
    return originUrl.origin;
  }

  const forwardedProto = getHeader("x-forwarded-proto") ?? getHeader("x-forwarded-protocol");
  const forwardedHost = getHeader("x-forwarded-host");
  const forwardedPort = getHeader("x-forwarded-port");
  const hostHeader = forwardedHost ?? getHeader("host");

  let protocol = forwardedProto;
  if (!protocol) {
    const frontEndHttps = getHeader("front-end-https");
    if (frontEndHttps && frontEndHttps.toLowerCase() !== "off") {
      protocol = "https";
    }
  }

  if (hostHeader) {
    const authority =
      forwardedPort && !hostHeader.includes(":") ? `${hostHeader}:${forwardedPort}` : hostHeader;
    const protoCandidate =
      protocol ??
      (originHeader ? safeParseUrl(originHeader)?.protocol.replace(/:$/, "") : null) ??
      "https";
    const composite = `${protoCandidate}://${authority}`;
    const compositeUrl = safeParseUrl(composite);
    if (compositeUrl) {
      return compositeUrl.origin;
    }
    const httpsFallback = safeParseUrl(`https://${authority}`);
    if (httpsFallback) {
      return httpsFallback.origin;
    }
    const httpFallback = safeParseUrl(`http://${authority}`);
    if (httpFallback) {
      return httpFallback.origin;
    }
  }

  return null;
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
