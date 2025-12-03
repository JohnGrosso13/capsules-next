export type CapsuleRow = {
  id: string | null;
  name: string | null;
  slug: string | null;
  banner_url: string | null;
  store_banner_url: string | null;
  promo_tile_url: string | null;
  logo_url: string | null;
  membership_policy?: string | null;
  created_by_id: string | null;
  created_at?: string | null;
};

export type CapsuleMemberRow = {
  capsule_id: string | null;
  role: string | null;
  joined_at: string | null;
  capsule: CapsuleRow | null;
};

export type MemberProfileRow = {
  id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  user_key: string | null;
};

export type CapsuleMemberRecord = {
  capsule_id: string | null;
  user_id: string | null;
  role: string | null;
  joined_at: string | null;
};

export type CapsuleMemberDetailsRow = {
  capsule_id: string | null;
  user_id: string | null;
  role: string | null;
  joined_at: string | null;
  user: MemberProfileRow | null;
};

export type CapsuleMemberRequestRow = {
  id: string | null;
  capsule_id: string | null;
  requester_id: string | null;
  status: string | null;
  role: string | null;
  message: string | null;
  origin: string | null;
  responded_by: string | null;
  created_at: string | null;
  responded_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  requester: MemberProfileRow | null;
  initiator_id: string | null;
  initiator: MemberProfileRow | null;
  capsule: CapsuleRow | null;
};

export type CapsuleFollowerRow = {
  capsule_id: string | null;
  user_id: string | null;
  created_at: string | null;
  user: MemberProfileRow | null;
  capsule?: CapsuleRow | null;
};

export type CapsuleAssetRow = {
  id: string | null;
  owner_user_id: string | null;
  media_url: string | null;
  media_type: string | null;
  title: string | null;
  description: string | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  post_id: string | null;
  kind: string | null;
  view_count: number | null;
  uploaded_by: string | null;
};

export type PostCapsuleRow = {
  client_id: string | null;
  capsule_id: string | null;
};

export type CapsuleHistorySnapshotRow = {
  capsule_id: string | null;
  suggested_generated_at: string | null;
  suggested_latest_post_at: string | null;
  post_count: number | null;
  suggested_snapshot: Record<string, unknown> | null;
  updated_at: string | null;
  suggested_period_hashes: Record<string, unknown> | null;
  published_snapshot: Record<string, unknown> | null;
  published_generated_at: string | null;
  published_latest_post_at: string | null;
  published_period_hashes: Record<string, unknown> | null;
  published_editor_id: string | null;
  published_editor_reason: string | null;
  prompt_memory: Record<string, unknown> | null;
  template_presets: Record<string, unknown> | null;
  coverage_meta: Record<string, unknown> | null;
};

export type CapsuleHistoryActivityRow = {
  id: string | null;
  created_at: string | null;
};

export type CapsuleHistoryRefreshCandidateRow = {
  capsule_id: string | null;
  owner_user_id: string | null;
  snapshot_generated_at: string | null;
  snapshot_latest_post: string | null;
  latest_post: string | null;
};

export type CapsuleHistorySectionSettingsRow = {
  capsule_id: string | null;
  period: string | null;
  editor_notes: string | null;
  excluded_post_ids: unknown;
  template_id: string | null;
  tone_recipe_id: string | null;
  prompt_overrides: Record<string, unknown> | null;
  coverage_snapshot: Record<string, unknown> | null;
  discussion_thread_id: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type CapsuleHistoryPinRow = {
  id: string | null;
  capsule_id: string | null;
  period: string | null;
  pin_type: string | null;
  post_id: string | null;
  quote: string | null;
  source: Record<string, unknown> | null;
  rank: number | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CapsuleHistoryExclusionRow = {
  capsule_id: string | null;
  period: string | null;
  post_id: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type CapsuleHistoryEditRow = {
  id: string | null;
  capsule_id: string | null;
  period: string | null;
  editor_id: string | null;
  change_type: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  created_at: string | null;
};

export type CapsuleTopicPageRow = {
  id: string | null;
  capsule_id: string | null;
  slug: string | null;
  title: string | null;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CapsuleTopicPageBacklinkRow = {
  id: string | null;
  topic_page_id: string | null;
  capsule_id: string | null;
  source_type: string | null;
  source_id: string | null;
  period: string | null;
  created_at: string | null;
};

export type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  storeBannerUrl: string | null;
  promoTileUrl: string | null;
  logoUrl: string | null;
  role: string | null;
  ownership: "owner" | "member" | "follower";
  membershipPolicy?: string | null;
};

export type DiscoverCapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  storeBannerUrl: string | null;
  promoTileUrl: string | null;
  logoUrl: string | null;
  createdAt: string | null;
  membershipPolicy?: string | null;
};

