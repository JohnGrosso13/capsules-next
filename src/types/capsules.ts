export type CapsuleMemberProfile = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  userKey: string | null;
};

export type CapsuleMemberSummary = {
  userId: string;
  role: string | null;
  joinedAt: string | null;
  name: string | null;
  avatarUrl: string | null;
  userKey: string | null;
  isOwner: boolean;
};

export type CapsuleMemberRequestStatus = "pending" | "approved" | "declined" | "cancelled";

export type CapsuleMemberRequestSummary = {
  id: string;
  capsuleId: string;
  requesterId: string;
  responderId: string | null;
  status: CapsuleMemberRequestStatus;
  role: string | null;
  message: string | null;
  createdAt: string | null;
  respondedAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  requester: CapsuleMemberProfile | null;
};

export type CapsuleMembershipViewer = {
  userId: string | null;
  isOwner: boolean;
  isMember: boolean;
  canManage: boolean;
  canRequest: boolean;
  role: string | null;
  memberSince: string | null;
  requestStatus: CapsuleMemberRequestStatus | "none";
  requestId: string | null;
};

export type CapsuleMembershipState = {
  capsule: {
    id: string;
    name: string | null;
    slug: string | null;
    ownerId: string;
    bannerUrl: string | null;
    storeBannerUrl: string | null;
    promoTileUrl: string | null;
    logoUrl: string | null;
  };
  viewer: CapsuleMembershipViewer;
  counts: {
    members: number;
    pendingRequests: number;
  };
  members: CapsuleMemberSummary[];
  requests: CapsuleMemberRequestSummary[];
  viewerRequest: CapsuleMemberRequestSummary | null;
};

export type CapsuleMembershipAction =
  | "request_join"
  | "approve_request"
  | "decline_request"
  | "remove_member"
  | "set_role";

export type CapsuleHistoryPeriod = "weekly" | "monthly" | "all_time";

export type CapsuleHistorySourceType = "post" | "quote" | "topic_page" | "manual";

export type CapsuleHistorySource = {
  id: string;
  type: CapsuleHistorySourceType;
  label: string | null;
  description: string | null;
  url: string | null;
  postId: string | null;
  topicPageId: string | null;
  quoteId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  occurredAt: string | null;
  metrics: {
    reactions: number | null;
    comments: number | null;
    shares: number | null;
  };
};

export type CapsuleHistoryContentBlock = {
  id: string;
  text: string;
  sourceIds: string[];
  pinned: boolean;
  pinId: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
};

export type CapsuleHistoryTimelineEntry = CapsuleHistoryContentBlock & {
  label: string;
  detail: string;
  timestamp: string | null;
  postId?: string | null;
  permalink?: string | null;
};

export type CapsuleHistorySectionContent = {
  summary: CapsuleHistoryContentBlock;
  highlights: CapsuleHistoryContentBlock[];
  timeline: CapsuleHistoryTimelineEntry[];
  nextFocus: CapsuleHistoryContentBlock[];
};

export type CapsuleHistoryCoverageMetric = {
  id: string;
  label: string;
  covered: boolean;
  weight: number;
};

export type CapsuleHistoryCoverage = {
  completeness: number;
  authors: CapsuleHistoryCoverageMetric[];
  themes: CapsuleHistoryCoverageMetric[];
  timeSpans: CapsuleHistoryCoverageMetric[];
};

export type CapsuleHistoryCandidateKind = "post" | "quote" | "milestone";

export type CapsuleHistoryCandidate = {
  id: string;
  kind: CapsuleHistoryCandidateKind;
  postId: string | null;
  quoteId: string | null;
  title: string | null;
  excerpt: string | null;
  sourceIds: string[];
  createdAt: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  metrics: {
    reactions: number;
    comments: number;
    shares: number;
  };
  tags: string[];
};

export type CapsuleHistoryPinnedItemType = "summary" | "highlight" | "timeline" | "next_focus";

export type CapsuleHistoryPinnedItem = {
  id: string;
  type: CapsuleHistoryPinnedItemType;
  period: CapsuleHistoryPeriod;
  postId: string | null;
  quote: string | null;
  rank: number;
  sourceId: string | null;
  createdAt: string;
  createdBy: string | null;
};

export type CapsuleHistoryVersion = {
  id: string;
  createdAt: string;
  editorId: string;
  editorName: string | null;
  changeType: string;
  reason: string | null;
};

export type CapsuleHistoryPromptMemory = {
  guidelines: string[];
  tone: string | null;
  mustInclude: string[];
  autoLinkTopics: string[];
};

export type CapsuleHistoryTemplatePreset = {
  id: string;
  label: string;
  description: string | null;
  tone: string | null;
};

export type CapsuleHistorySection = {
  period: CapsuleHistoryPeriod;
  title: string;
  timeframe: {
    start: string | null;
    end: string | null;
  };
  postCount: number;
  suggested: CapsuleHistorySectionContent;
  published: CapsuleHistorySectionContent | null;
  editorNotes: string | null;
  excludedPostIds: string[];
  coverage: CapsuleHistoryCoverage;
  candidates: CapsuleHistoryCandidate[];
  pinned: CapsuleHistoryPinnedItem[];
  versions: CapsuleHistoryVersion[];
  discussionThreadId: string | null;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  templateId: string | null;
  toneRecipeId: string | null;
};

export type CapsuleHistorySnapshot = {
  capsuleId: string;
  capsuleName: string | null;
  suggestedGeneratedAt: string;
  publishedGeneratedAt: string | null;
  sections: CapsuleHistorySection[];
  sources: Record<string, CapsuleHistorySource>;
  promptMemory: CapsuleHistoryPromptMemory;
  templates: CapsuleHistoryTemplatePreset[];
};
