import { normalizeMediaUrl, IMAGE_EXTENSION_PATTERN } from "@/lib/media";
import { safeRandomUUID } from "@/lib/random";

import type { FeedAttachment, FeedPoll, FeedPost } from "./types";

type FeedMediaSource = Pick<FeedPost, "mediaUrl" | "attachments">;

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

const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v|avi|ogv|ogg|mkv|3gp|3g2)(\?|#|$)/i;

function inferMediaKindFromSource(
  mimeType: string | null | undefined,
  ...sources: Array<string | null | undefined>
): "image" | "video" | null {
  const loweredMime = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
  if (loweredMime.startsWith("image/")) return "image";
  if (loweredMime.startsWith("video/")) return "video";

  for (const source of sources) {
    if (!source || typeof source !== "string") continue;
    const normalized = source.trim().toLowerCase();
    if (!normalized.length) continue;
    if (VIDEO_EXTENSION_PATTERN.test(normalized)) return "video";
    if (IMAGE_EXTENSION_PATTERN.test(normalized)) return "image";
  }

  return null;
}

function decodePollFromMediaPrompt(raw: unknown): unknown | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("__POLL__")) return null;
  const payload = trimmed.slice(8);
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function normalizeFeedPoll(rawPoll: unknown): FeedPoll | null {
  if (rawPoll === null || rawPoll === undefined) return null;

  let source: Record<string, unknown> | null = null;
  if (typeof rawPoll === "string") {
    try {
      const parsed = JSON.parse(rawPoll);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        source = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      return null;
    }
  } else if (typeof rawPoll === "object" && !Array.isArray(rawPoll)) {
    source = { ...(rawPoll as Record<string, unknown>) };
  }

  if (!source) return null;

  const questionValue =
    typeof source["question"] === "string"
      ? (source["question"] as string).trim()
      : typeof source["title"] === "string"
        ? (source["title"] as string).trim()
        : "";

  const optionSources =
    Array.isArray(source["options"])
      ? (source["options"] as unknown[])
      : Array.isArray(source["choices"])
        ? (source["choices"] as unknown[])
        : [];

  const options = optionSources
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (typeof entry === "number" && Number.isFinite(entry)) return String(entry);
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        if (typeof record["label"] === "string") return record["label"]!.trim();
        if (typeof record["value"] === "string") return record["value"]!.trim();
      }
      return "";
    })
    .filter((value) => value.length > 0);

  if (!options.length) {
    return null;
  }

  const countCandidates = [
    source["counts"],
    source["voteCounts"],
    source["vote_counts"],
    source["votes"],
  ];
  let counts: number[] | null = null;
  for (const candidate of countCandidates) {
    if (!Array.isArray(candidate)) continue;
    counts = (candidate as unknown[]).map((entry) => {
      const numeric = typeof entry === "number" ? entry : Number(entry);
      if (!Number.isFinite(numeric)) return 0;
      return Math.max(0, Math.trunc(numeric));
    });
    break;
  }

  const totalVotes =
    typeof source["totalVotes"] === "number"
      ? Math.max(0, Math.trunc(source["totalVotes"]))
      : typeof source["total_votes"] === "number"
        ? Math.max(0, Math.trunc(source["total_votes"]))
        : counts
          ? counts.reduce((sum, value) => sum + value, 0)
          : null;

  let userVote: number | null = null;
  const userVoteCandidates = [
    source["userVote"],
    source["user_vote"],
    source["viewerVote"],
    source["viewer_vote"],
  ];
  for (const candidate of userVoteCandidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      userVote = Math.max(0, Math.trunc(candidate));
      break;
    }
  }

  return {
    question: questionValue || "Poll",
    options,
    counts,
    totalVotes,
    userVote,
  };
}

export function resolveFeedPostMediaUrl(post: FeedMediaSource): string | null {
  const fromPost = normalizeMediaUrl(post.mediaUrl) ?? null;
  if (fromPost) {
    const inferred = inferMediaKindFromSource(null, fromPost);
    if (inferred === "image" || inferred === "video") {
      return fromPost;
    }
  }

  if (!Array.isArray(post.attachments)) {
    return null;
  }

  for (const attachment of post.attachments) {
    if (!attachment) continue;

    const attachmentKind = inferMediaKindFromSource(
      attachment.mimeType,
      attachment.url,
      attachment.thumbnailUrl,
      attachment.variants?.feed,
      attachment.variants?.thumb,
      attachment.variants?.original,
    );
    if (attachmentKind !== "image" && attachmentKind !== "video") {
      continue;
    }

    const normalized =
      attachmentKind === "image"
        ? normalizeMediaUrl(attachment.variants?.feed) ??
          normalizeMediaUrl(attachment.variants?.thumb) ??
          normalizeMediaUrl(attachment.thumbnailUrl) ??
          normalizeMediaUrl(attachment.url)
        : normalizeMediaUrl(attachment.url) ??
          normalizeMediaUrl(attachment.variants?.original) ??
          normalizeMediaUrl(attachment.variants?.feed) ??
          normalizeMediaUrl(attachment.thumbnailUrl);
    if (normalized) {
      return normalized;
    }

    const fallback =
      attachmentKind === "image"
        ? attachment.variants?.feed ??
          attachment.variants?.thumb ??
          attachment.thumbnailUrl ??
          attachment.url
        : attachment.url ??
          attachment.variants?.original ??
          attachment.variants?.feed ??
          attachment.thumbnailUrl;
    if (typeof fallback === "string" && fallback.trim().length > 0) {
      return fallback.trim();
    }
  }

  return null;
}

export function normalizeFeedPosts(rawPosts: unknown[]): FeedPost[] {
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
      coerceIdentifier(record["authorUserId"]) ??
      coerceIdentifier(record["author_user_id"]) ??
      null;

    const ownerId =
      coerceIdentifier(record["ownerUserId"]) ??
      coerceIdentifier(record["owner_user_id"]) ??
      authorIdRaw;

    const authorId = authorIdRaw ?? ownerId;

    const authorKeyRaw =
      coerceIdentifier(record["authorUserKey"]) ??
      coerceIdentifier(record["author_user_key"]) ??
      null;

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
    const attachments: FeedAttachment[] = [];

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
        const recordVariants = variantsSource as Record<string, unknown>;
        const original = normalizeMediaUrl(recordVariants["original"]);
        if (!original) return null;
        const thumb = normalizeMediaUrl(recordVariants["thumb"]);
        const feed = normalizeMediaUrl(recordVariants["feed"]);
        const full = normalizeMediaUrl(recordVariants["full"]);
        return {
          original,
          thumb: thumb ?? null,
          feed: feed ?? null,
          full: full ?? null,
        };
      })();

      const metaRaw = (data as { meta?: unknown }).meta;
      const meta =
        metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
          ? { ...(metaRaw as Record<string, unknown>) }
          : null;

      const identifierValue = data["id"];
      const attachmentId =
        typeof identifierValue === "string"
          ? identifierValue
          : typeof identifierValue === "number"
            ? String(identifierValue)
            : safeRandomUUID();

      attachments.push({
        id: attachmentId,
        url,
        mimeType: mime ?? null,
        name: name ?? null,
        thumbnailUrl: thumbnailUrl ?? null,
        storageKey: storageKey ?? null,
        variants,
        meta,
      });
    }

    const media = resolveFeedPostMediaUrl({
      mediaUrl: initialMedia,
      attachments,
    });

    const pollSource =
      record["poll"] ??
      decodePollFromMediaPrompt(record["mediaPrompt"]) ??
      decodePollFromMediaPrompt(record["media_prompt"]);

    const userNameValue =
      typeof record["user_name"] === "string"
        ? (record["user_name"] as string)
        : typeof record["userName"] === "string"
          ? (record["userName"] as string)
          : null;

    const userAvatarValue =
      typeof record["user_avatar"] === "string"
        ? (record["user_avatar"] as string)
        : typeof record["userAvatar"] === "string"
          ? (record["userAvatar"] as string)
          : null;

    const dbIdValue =
      typeof record["dbId"] === "string"
        ? (record["dbId"] as string)
        : typeof record["db_id"] === "string"
          ? (record["db_id"] as string)
          : null;

    return {
      id: String(identifier),
      dbId: dbIdValue,
      user_name: userNameValue ?? "Capsules AI",
      userName: userNameValue ?? "Capsules AI",
      user_avatar: userAvatarValue,
      userAvatar: userAvatarValue,
      content: typeof record["content"] === "string" ? (record["content"] as string) : "",
      mediaUrl: media,
      created_at: createdAt,
      createdAt: createdAt,
      owner_user_id: ownerId ?? null,
      ownerUserId: ownerId ?? null,
      owner_user_key: ownerKey ?? null,
      ownerUserKey: ownerKey ?? null,
      ownerKey: ownerKey ?? null,
      author_user_id: authorId ?? null,
      authorUserId: authorId ?? null,
      author_user_key: authorKey ?? null,
      authorUserKey: authorKey ?? null,
      authorKey: authorKey ?? null,
      likes,
      comments,
      shares,
      viewer_liked: viewerLiked,
      viewerLiked,
      viewer_remembered: viewerRemembered,
      viewerRemembered,
      attachments,
      poll: normalizeFeedPoll(pollSource),
    };
  });
}
const FALLBACK_POST_SEEDS: Array<Omit<FeedPost, "id">> = [
  {
    dbId: "demo-welcome",
    userName: "Capsules Demo Bot",
    user_name: "Capsules Demo Bot",
    userAvatar: null,
    user_avatar: null,
    content:
      "Welcome to Capsules! Connect your Supabase project to see real posts here. This demo post is only shown locally when the data source is offline.",
    mediaUrl: null,
    createdAt: null,
    created_at: null,
    ownerUserId: null,
    owner_user_id: null,
    ownerUserKey: null,
    owner_user_key: null,
    authorUserId: null,
    author_user_id: null,
    authorUserKey: null,
    author_user_key: null,
    likes: 12,
    comments: 2,
    shares: 0,
    viewerLiked: false,
    viewer_liked: false,
    viewerRemembered: false,
    viewer_remembered: false,
    attachments: [],
    poll: null,
  },
  {
    dbId: "demo-prompt-ideas",
    userName: "Capsules Tips",
    user_name: "Capsules Tips",
    userAvatar: null,
    user_avatar: null,
    content:
      "Tip: Use the Generate button to draft a welcome message or poll. Once Supabase is configured you'll see the real-time feed here.",
    mediaUrl: null,
    createdAt: null,
    created_at: null,
    ownerUserId: null,
    owner_user_id: null,
    ownerUserKey: null,
    owner_user_key: null,
    authorUserId: null,
    author_user_id: null,
    authorUserKey: null,
    author_user_key: null,
    likes: 4,
    comments: 0,
    shares: 0,
    viewerLiked: false,
    viewer_liked: false,
    viewerRemembered: false,
    viewer_remembered: false,
    attachments: [],
    poll: null,
  },
];

export function buildFallbackFeedPosts(): FeedPost[] {
  const now = Date.now();
  return FALLBACK_POST_SEEDS.map((seed, index) => ({
    ...seed,
    id:
      typeof seed.dbId === "string" && seed.dbId.trim().length
        ? seed.dbId.trim()
        : `demo-${index + 1}`,
    createdAt:
      typeof seed.createdAt === "string" && seed.createdAt.trim().length
        ? seed.createdAt
        : new Date(now - index * 90_000).toISOString(),
    created_at:
      typeof seed.created_at === "string" && seed.created_at.trim().length
        ? seed.created_at
        : new Date(now - index * 90_000).toISOString(),
  }));
}

export { normalizeFeedPosts as normalizePosts };

