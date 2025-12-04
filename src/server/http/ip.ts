import "server-only";

function firstHeaderValue(header: string | null): string | null {
  if (!header) return null;
  const first = header
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);
  return first ?? null;
}

export function resolveClientIp(req: Request): string | null {
  const headers = req.headers;
  const forwarded = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for");
  const forwardedIp = firstHeaderValue(forwarded);
  if (forwardedIp) return forwardedIp;
  const realIp = headers.get("x-real-ip");
  return realIp && realIp.trim().length ? realIp.trim() : null;
}
