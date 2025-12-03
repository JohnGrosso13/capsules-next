import { randomUUID } from "crypto";

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function randomSlugSuffix(): string {
  const raw = randomUUID().replace(/[^a-z0-9]/gi, "");
  return raw.slice(0, 6).toLowerCase();
}
