export function resolveCapsuleHandle(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!trimmed.length) return null;
  return trimmed.replace(/^@/, "").replace(/^\/+capsule\//, "");
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
