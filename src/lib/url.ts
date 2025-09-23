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
