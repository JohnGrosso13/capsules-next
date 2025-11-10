export type CreatePostInput = {
  id?: string | null;
  client_id?: string | null;
  kind?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  media_url?: string | null;
  mediaPrompt?: string | null;
  media_prompt?: string | null;
  userName?: string | null;
  user_name?: string | null;
  userAvatar?: string | null;
  user_avatar?: string | null;
  capsuleId?: string | null;
  capsule_id?: string | null;
  tags?: unknown;
  poll?: unknown;
  title?: string | null;
  source?: string | null;
  ts?: string | null;
  [key: string]: unknown;
};

export type PostsQueryInput = {
  viewerId: string | null;
  origin?: string | null;
  cloudflareEnabled?: boolean | null;
  query: {
    capsuleId?: string | null;
    limit?: string | number | null;
    before?: string | null;
    after?: string | null;
    authorId?: string | null;
    authorKey?: string | null;
    sort?: "recent" | "top" | "hot" | null;
  };
};
