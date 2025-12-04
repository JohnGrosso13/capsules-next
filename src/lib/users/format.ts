export function sanitizeUserKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const withoutPrefix = trimmed.toLowerCase().startsWith("clerk:")
    ? trimmed.slice("clerk:".length)
    : trimmed;
  if (withoutPrefix.toLowerCase().startsWith("user_")) return null;
  return withoutPrefix;
}

export function looksLikeOpaqueId(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized.length) return false;
  if (normalized.toLowerCase().startsWith("clerk:")) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }
  if (/^[a-z0-9]{24,}$/i.test(normalized)) return true;
  return false;
}

export function preferDisplayName(options: {
  name?: string | null;
  handle?: string | null;
  fallback?: string | null;
  fallbackLabel?: string;
  allowOpaqueFallback?: boolean;
}): string {
  const {
    name,
    handle,
    fallback,
    fallbackLabel = "Someone",
    allowOpaqueFallback = false,
  } = options;
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (normalizedName) return normalizedName;

  const sanitizedHandle = sanitizeUserKey(handle);
  if (sanitizedHandle) return sanitizedHandle;

  const normalizedFallback = typeof fallback === "string" ? fallback.trim() : "";
  if (normalizedFallback) {
    if (allowOpaqueFallback || !looksLikeOpaqueId(normalizedFallback)) {
      return normalizedFallback;
    }
  }

  return fallbackLabel;
}
