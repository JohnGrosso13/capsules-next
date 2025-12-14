export type ShareablePost = {
  id: string;
  user_name?: string | null;
  userName?: string | null;
  content?: string | null;
  capsuleId?: string | null;
  capsule_id?: string | null;
  [key: string]: unknown;
};

function trimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function getPostCapsuleId(post: ShareablePost): string | null {
  return trimString(post.capsuleId ?? post.capsule_id);
}

export function buildPostSharePath(post: ShareablePost): string {
  const capsuleId = getPostCapsuleId(post);
  const postId = trimString(post.id) ?? "";
  if (capsuleId) {
    return `/capsule?capsuleId=${encodeURIComponent(capsuleId)}&postId=${encodeURIComponent(postId)}`;
  }
  return `/home?postId=${encodeURIComponent(postId)}`;
}

export function buildPostShareUrl(post: ShareablePost, origin?: string | null): string | null {
  const base =
    trimString(origin) ??
    trimString(process.env.NEXT_PUBLIC_SITE_URL) ??
    (typeof window !== "undefined" ? window.location.origin : null);
  if (!base) return null;
  return `${base}${buildPostSharePath(post)}`;
}

export function buildPostShareMessage(post: ShareablePost): { title: string; text: string } {
  const author = trimString(post.user_name ?? post.userName) ?? "Capsules member";
  const rawContent = trimString(post.content) ?? "";
  const snippet = rawContent.slice(0, 160);
  const ellipsis = rawContent.length > 160 ? "…" : "";
  const text = snippet ? `${snippet}${ellipsis}` : "Check out this update.";
  const title = `${author} shared a post`;
  return { title, text };
}
