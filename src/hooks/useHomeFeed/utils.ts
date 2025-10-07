import { normalizeMediaUrl } from "@/lib/media";
import { safeRandomUUID } from "@/lib/random";

import type { HomeFeedAttachment, HomeFeedPost } from "./types";

export type FriendTarget = Record<string, unknown> | null;

function coerceIdentifier(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function formatFeedCount(value?: number | null): string {
  const count =
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

export type PostMediaSource = Pick<HomeFeedPost, "mediaUrl" | "attachments">;

export function resolvePostMediaUrl(post: PostMediaSource): string | null {
  const fromPost = normalizeMediaUrl(post.mediaUrl) ?? null;
  if (fromPost) {
    return fromPost;
  }

  if (!Array.isArray(post.attachments)) {
    return null;
  }

  for (const attachment of post.attachments) {
    if (!attachment) continue;

    const normalized =
      normalizeMediaUrl(attachment.variants?.feed) ??
      normalizeMediaUrl(attachment.variants?.thumb) ??
      normalizeMediaUrl(attachment.thumbnailUrl) ??
      normalizeMediaUrl(attachment.url);
    if (normalized) {
      return normalized;
    }

    const fallback =
      attachment.variants?.feed ??
      attachment.variants?.thumb ??
      attachment.thumbnailUrl ??
      attachment.url;
    if (typeof fallback === "string" && fallback.trim().length > 0) {
      return fallback;
    }
  }

  return null;
}

export function buildFriendTarget(post: HomeFeedPost): FriendTarget {
  const userId =
    post.owner_user_id ??
    post.ownerUserId ??
    post.author_user_id ??
    post.authorUserId ??
    null;
  const userKey =
    post.owner_user_key ??
    post.ownerKey ??
    post.author_user_key ??
    post.authorUserKey ??
    null;
  if (!userId && !userKey) return null;
  const target: Record<string, unknown> = {};
  if (userId) target.userId = userId;
  if (userKey) target.userKey = userKey;
  if (post.user_name) target.name = post.user_name;
  if (post.user_avatar) target.avatar = post.user_avatar;
  return target;
}

export function normalizePosts(rawPosts: unknown[]): HomeFeedPost[] {
  return rawPosts.map((raw) => {
    const record = raw as Record<string, unknown>;

    const initialMedia =
      normalizeMediaUrl(record["mediaUrl"]) ?? normalizeMediaUrl(record["media_url"]) ?? null;

    const createdAt =
      typeof record["created_at"] === "string"
        ? (record["created_at"] as string)
        : typeof record["ts"] === "string"
          ? (record["ts"] as string)
          : null;

    const authorIdRaw =
      coerceIdentifier(record["authorUserId"]) ?? coerceIdentifier(record["author_user_id"]) ?? null;

    const ownerId =
      coerceIdentifier(record["ownerUserId"]) ??
      coerceIdentifier(record["owner_user_id"]) ??
      authorIdRaw;

    const authorId = authorIdRaw ?? ownerId;

    const authorKeyRaw =
      coerceIdentifier(record["authorUserKey"]) ?? coerceIdentifier(record["author_user_key"]) ?? null;

    const ownerKey =
      coerceIdentifier(record["ownerKey"]) ??
      coerceIdentifier(record["owner_user_key"]) ??
      authorKeyRaw;

    const authorKey = authorKeyRaw ?? ownerKey;

    const identifier =
      coerceIdentifier(record["id"]) ??
      coerceIdentifier(record["client_id"]) ??
      ownerId ??
      safeRandomUUID();

    const likes =
      typeof record["likes"] === "number"
        ? (record["likes"] as number)
        : typeof record["likes_count"] === "number"
          ? (record["likes_count"] as number)
          : 0;

    const comments =
      typeof record["comments"] === "number"
        ? (record["comments"] as number)
        : typeof record["comments_count"] === "number"
          ? (record["comments_count"] as number)
          : 0;

    const shares =
      typeof record["shares"] === "number"
        ? (record["shares"] as number)
        : typeof record["share_count"] === "number"
          ? (record["share_count"] as number)
          : 0;

    const viewerLiked =
      typeof record["viewerLiked"] === "boolean"
        ? (record["viewerLiked"] as boolean)
        : typeof record["viewer_liked"] === "boolean"
          ? (record["viewer_liked"] as boolean)
          : false;

    const viewerRemembered =
      typeof record["viewerRemembered"] === "boolean"
        ? (record["viewerRemembered"] as boolean)
        : typeof record["viewer_remembered"] === "boolean"
          ? (record["viewer_remembered"] as boolean)
          : false;

    const attachmentsRaw = Array.isArray(record["attachments"])
      ? (record["attachments"] as Array<Record<string, unknown>>)
      : [];

    const seenAttachmentUrls = new Set<string>();
    const attachments: HomeFeedAttachment[] = [];

    for (const entry of attachmentsRaw) {
      if (!entry || typeof entry !== "object") continue;
      const data = entry as Record<string, unknown>;
      const url = normalizeMediaUrl(data["url"]);
      if (!url || seenAttachmentUrls.has(url)) continue;
      seenAttachmentUrls.add(url);

      const mime =
        typeof data["mimeType"] === "string"
          ? (data["mimeType"] as string)
          : typeof data["mime_type"] === "string"
            ? (data["mime_type"] as string)
            : null;

      const name =
        typeof data["name"] === "string"
          ? (data["name"] as string)
          : typeof data["title"] === "string"
            ? (data["title"] as string)
            : null;

      const thumbSource =
        typeof data["thumbnailUrl"] === "string"
          ? (data["thumbnailUrl"] as string)
          : typeof data["thumbnail_url"] === "string"
            ? (data["thumbnail_url"] as string)
            : typeof data["thumbUrl"] === "string"
              ? (data["thumbUrl"] as string)
              : null;
      const thumbnailUrl = normalizeMediaUrl(thumbSource);

      const storageKey =
        typeof data["storageKey"] === "string"
          ? (data["storageKey"] as string)
          : typeof data["storage_key"] === "string"
            ? (data["storage_key"] as string)
            : null;

      const variantsSource = data["variants"];
      const variants = (() => {
        if (!variantsSource || typeof variantsSource !== "object") return null;
        const record = variantsSource as Record<string, unknown>;
        const original = normalizeMediaUrl(record["original"]);
        if (!original) return null;
        const thumb = normalizeMediaUrl(record["thumb"]);
        const feed = normalizeMediaUrl(record["feed"]);
        const full = normalizeMediaUrl(record["full"]);
        return {
          original,
          thumb: thumb ?? null,
          feed: feed ?? null,
          full: full ?? null,
        };
      })();

      const identifierValue = data["id"];
      const id =
        typeof identifierValue === "string"
          ? identifierValue
          : typeof identifierValue === "number"
            ? String(identifierValue)
            : safeRandomUUID();

      attachments.push({
        id,
        url,
        mimeType: mime ?? null,
        name: name ?? null,
        thumbnailUrl: thumbnailUrl ?? null,
        storageKey: storageKey ?? null,
        variants,
      });
    }

    const media = resolvePostMediaUrl({
      mediaUrl: initialMedia,
      attachments,
    });

    return {
      id: String(identifier),
      dbId:
        typeof record["dbId"] === "string"
          ? (record["dbId"] as string)
          : typeof record["db_id"] === "string"
            ? (record["db_id"] as string)
            : null,
      user_name:
        typeof record["user_name"] === "string"
          ? (record["user_name"] as string)
          : typeof record["userName"] === "string"
            ? (record["userName"] as string)
            : "Capsules AI",
      user_avatar:
        typeof record["user_avatar"] === "string"
          ? (record["user_avatar"] as string)
          : typeof record["userAvatar"] === "string"
            ? (record["userAvatar"] as string)
            : null,
      content: typeof record["content"] === "string" ? (record["content"] as string) : null,
      mediaUrl: media,
      created_at: createdAt,
      owner_user_id: ownerId ?? null,
      ownerUserId: ownerId ?? null,
      owner_user_key: ownerKey ?? null,
      ownerKey: ownerKey ?? null,
      author_user_id: authorId ?? null,
      authorUserId: authorId ?? null,
      author_user_key: authorKey ?? null,
      authorUserKey: authorKey ?? null,
      likes,
      comments,
      shares,
      viewerLiked,
      viewer_liked: viewerLiked,
      viewer_remembered: viewerRemembered,
      viewerRemembered,
      attachments,
    };
  });
}
