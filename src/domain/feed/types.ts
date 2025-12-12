import type { CloudflareImageVariantSet } from "@/lib/cloudflare/images";

export type FeedAttachment = {
  id: string;
  url: string;
  mimeType: string | null;
  name: string | null;
  thumbnailUrl: string | null;
  storageKey: string | null;
  uploadSessionId?: string | null;
  variants?: CloudflareImageVariantSet | null;
  meta?: Record<string, unknown> | null;
};

export type FeedPoll = {
  question: string;
  options: string[];
  counts?: number[] | null;
  totalVotes?: number | null;
  userVote?: number | null;
  thumbnails?: (string | null)[] | null;
};

export type FeedInsert = {
  id: string;
  type: "promo" | "module" | "post";
  score?: number | null;
  slotInterval?: number | null;
  pinnedAt?: string | null;
  payload?: Record<string, unknown> | null;
};

export type FeedItem =
  | {
      id: string;
      type: "post";
      post: FeedPost;
      score?: number | null;
      slotInterval?: number | null;
      pinnedAt?: string | null;
      payload?: Record<string, unknown> | null;
    }
  | {
      id: string;
      type: "promo" | "module";
      post?: undefined;
      score?: number | null;
      slotInterval?: number | null;
      pinnedAt?: string | null;
      payload?: Record<string, unknown> | null;
    };

export type FeedPost = {
  id: string;
  dbId?: string | null;
  user_name?: string | null;
  userName?: string | null;
  user_avatar?: string | null;
  userAvatar?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  owner_user_id?: string | null;
  ownerUserId?: string | null;
  owner_user_key?: string | null;
  ownerUserKey?: string | null;
  ownerKey?: string | null;
  author_user_id?: string | null;
  authorUserId?: string | null;
  author_user_key?: string | null;
  authorUserKey?: string | null;
  authorKey?: string | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  viewer_liked?: boolean | null;
  viewerLiked?: boolean | null;
  viewer_remembered?: boolean | null;
  viewerRemembered?: boolean | null;
  attachments?: FeedAttachment[];
  poll?: FeedPoll | null;
  [key: string]: unknown;
};

export type FeedSnapshot = {
  posts: FeedPost[];
  cursor: string | null;
  hydrationKey: string;
};

export type FeedPage = {
  posts: FeedPost[];
  cursor: string | null;
  inserts?: FeedInsert[] | null;
};

export type FeedFetchOptions = {
  limit?: number;
  cursor?: string | null;
  capsuleId?: string | null;
  signal?: AbortSignal;
};

export type FeedFetchResult = {
  posts: unknown[];
  cursor: string | null;
  deleted: string[];
  inserts?: FeedInsert[] | null;
};
