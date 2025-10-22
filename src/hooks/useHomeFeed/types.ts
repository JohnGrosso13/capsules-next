import type { CloudflareImageVariantSet } from "@/lib/cloudflare/images";

export type HomeFeedAttachment = {
  id: string;
  url: string;
  mimeType: string | null;
  name: string | null;
  thumbnailUrl: string | null;
  storageKey: string | null;
  uploadSessionId?: string | null;
  variants?: CloudflareImageVariantSet | null;
};

export type HomeFeedPost = {
  id: string;
  dbId?: string | null;
  user_name?: string | null;
  user_avatar?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  created_at?: string | null;
  owner_user_id?: string | null;
  ownerUserId?: string | null;
  owner_user_key?: string | null;
  ownerKey?: string | null;
  author_user_id?: string | null;
  authorUserId?: string | null;
  author_user_key?: string | null;
  authorUserKey?: string | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  viewer_liked?: boolean | null;
  viewerLiked?: boolean | null;
  viewer_remembered?: boolean | null;
  viewerRemembered?: boolean | null;
  attachments?: HomeFeedAttachment[];
};
