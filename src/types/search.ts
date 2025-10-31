export type MemorySearchItem = {
  id: string;
  kind?: string | null;
  title?: string | null;
  description?: string | null;
  mediaUrl?: string | null;
  media_type?: string | null;
  mediaType?: string | null;
  media_url?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  meta?: Record<string, unknown> | null;
};

export type UserSearchResult = {
  type: "user";
  id: string;
  name: string;
  avatarUrl: string | null;
  userKey: string | null;
  relation: "self" | "friend";
  url: string;
  highlight: string | null;
  subtitle: string | null;
};

export type CapsuleSearchResult = {
  type: "capsule";
  id: string;
  name: string;
  slug: string | null;
  ownership: "owner" | "member";
  role: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  url: string;
  highlight: string | null;
  subtitle: string | null;
};

export type MemorySearchResult = MemorySearchItem & {
  type: "memory";
};

export type GlobalSearchSection =
  | { type: "users"; items: UserSearchResult[] }
  | { type: "capsules"; items: CapsuleSearchResult[] }
  | { type: "memories"; items: MemorySearchResult[] };

export type GlobalSearchResponse = {
  query: string;
  sections: GlobalSearchSection[];
};
