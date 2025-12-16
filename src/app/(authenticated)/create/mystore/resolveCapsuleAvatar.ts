import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";

type CapsuleLike = { name?: string | null; slug?: string | null; logoUrl?: string | null; bannerUrl?: string | null } | null;

export function resolveCapsuleAvatar(capsule: CapsuleLike, origin?: string | null) {
  const logo = resolveToAbsoluteUrl(normalizeMediaUrl(capsule?.logoUrl ?? null), origin);
  const banner = resolveToAbsoluteUrl(normalizeMediaUrl(capsule?.bannerUrl ?? null), origin);
  const avatarUrl = logo ?? banner ?? null;
  const name = capsule?.name?.trim();
  const slug = capsule?.slug?.trim();
  const avatarInitial = name?.slice(0, 1).toUpperCase() ?? slug?.slice(0, 1).toUpperCase() ?? "C";
  return { avatarUrl, avatarInitial };
}
