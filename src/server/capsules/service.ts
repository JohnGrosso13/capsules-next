import type {
  CapsuleHistoryArticle,
  CapsuleHistoryArticleLink,
  CapsuleHistoryArticleMetadata,
  CapsuleHistoryContentBlock,
  CapsuleHistoryPeriod,
  CapsuleHistorySection,
  CapsuleHistorySectionContent,
  CapsuleHistorySnapshot,
  CapsuleHistoryTimelineEntry,
  CapsuleHistoryCandidate,
  CapsuleHistoryCoverage,
  CapsuleHistoryCoverageMetric,
  CapsuleHistoryPinnedItem,
  CapsuleHistoryPinnedItemType,
  CapsuleHistoryPromptMemory,
  CapsuleHistoryTemplatePreset,
  CapsuleHistorySource,
  CapsuleHistoryVersion,
  CapsuleMemberRequestSummary,
  CapsuleMembershipState,
  CapsuleMembershipViewer,
} from "@/types/capsules";
import {
  createCapsuleForUser,
  deleteCapsuleMember as deleteCapsuleMemberRecord,
  deleteCapsuleOwnedByUser,
  findCapsuleById,
  getCapsuleMemberRecord,
  getCapsuleMemberRequest,
  listCapsuleMemberRequests,
  listCapsuleMembers,
  setCapsuleMemberRequestStatus,
  upsertCapsuleMember,
  upsertCapsuleMemberRequest,
  listCapsulesForUser,
  listRecentPublicCapsules,
  getCapsuleSummaryForViewer as repoGetCapsuleSummaryForViewer,
  type CapsuleSummary,
  type DiscoverCapsuleSummary,
  type CapsuleAssetRow,
  getCapsuleHistorySnapshotRecord,
  upsertCapsuleHistorySnapshotRecord,
  updateCapsuleHistoryPublishedSnapshotRecord,
  getCapsuleHistoryActivity,
  listCapsuleHistoryRefreshCandidates,
  listCapsuleHistorySectionSettings,
  listCapsuleHistoryPins,
  listCapsuleHistoryEdits,
  listCapsuleHistoryExclusions,
  listCapsuleTopicPages,
  listCapsuleTopicPageBacklinks,
  type CapsuleHistorySectionSettings,
  type CapsuleHistoryPin,
  type CapsuleHistoryEdit,
  type CapsuleHistoryExclusion,
  type CapsuleTopicPage,
  type CapsuleTopicPageBacklink,
  updateCapsuleMemberRole,
  updateCapsuleBanner,
  updateCapsuleStoreBanner,
  updateCapsulePromoTile,
  updateCapsuleLogo,
  listCapsuleAssets,
  upsertCapsuleHistorySectionSettingsRecord,
  insertCapsuleHistoryEdit,
  insertCapsuleHistoryPin,
  deleteCapsuleHistoryPin,
  insertCapsuleHistoryExclusion,
  deleteCapsuleHistoryExclusion,
  updateCapsuleHistoryPromptMemory,
} from "./repository";
import {
  isCapsuleMemberUiRole,
  resolveViewerUiRole,
  uiRoleToDbRole,
  type CapsuleMemberUiRole,
} from "./roles";
import { indexMemory } from "@/server/memories/service";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { getDatabaseAdminClient } from "@/config/database";
import { createHash } from "node:crypto";
import { AIConfigError, callOpenAIChat, extractJSON } from "@/lib/ai/prompter";

export type { CapsuleSummary, DiscoverCapsuleSummary } from "./repository";
export type {
  CapsuleMemberSummary,
  CapsuleMemberRequestSummary,
  CapsuleMembershipViewer,
  CapsuleMembershipState,
} from "@/types/capsules";

export type CapsuleLibraryItem = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string | null;
  title: string | null;
  description: string | null;
  createdAt: string | null;
  meta: Record<string, unknown> | null;
  viewCount: number | null;
  uploadedBy: string | null;
  postId: string | null;
  storageKey: string | null;
};

export type CapsuleLibrary = {
  media: CapsuleLibraryItem[];
  files: CapsuleLibraryItem[];
};

const REQUEST_MESSAGE_MAX_LENGTH = 500;

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_POST_LIMIT = 180;
const HISTORY_MODEL_POST_LIMIT = 150;
const HISTORY_HIGHLIGHT_LIMIT = 5;
const HISTORY_TIMELINE_LIMIT = 6;
const HISTORY_NEXT_FOCUS_LIMIT = 4;
const HISTORY_ARTICLE_LIMIT = 4;
const HISTORY_ARTICLE_PARAGRAPH_LIMIT = 2;
const HISTORY_ARTICLE_PARAGRAPH_LENGTH = 600;
const HISTORY_ARTICLE_TITLE_LIMIT = 120;
const HISTORY_ARTICLE_LINK_LIMIT = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_PERSIST_REFRESH_MS = WEEK_MS;

type CapsuleHistoryCacheEntry = {
  expiresAt: number;
  snapshot: CapsuleHistorySnapshot;
  latestPostAt: string | null;
  suggestedGeneratedAtMs: number;
  suggestedPeriodHashes: Record<string, string>;
};

const capsuleHistoryCache = new Map<string, CapsuleHistoryCacheEntry>();

function getCachedCapsuleHistory(capsuleId: string): CapsuleHistoryCacheEntry | null {
  const entry = capsuleHistoryCache.get(capsuleId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    capsuleHistoryCache.delete(capsuleId);
    return null;
  }
  return entry;
}

function invalidateCapsuleHistoryCache(capsuleId: string): void {
  capsuleHistoryCache.delete(capsuleId);
}

function setCachedCapsuleHistory(
  capsuleId: string,
  snapshot: CapsuleHistorySnapshot,
  meta: { latestPostAt: string | null; suggestedPeriodHashes: Record<string, string> },
): void {
  const generatedAtMs = Date.parse(snapshot.suggestedGeneratedAt);
  capsuleHistoryCache.set(capsuleId, {
    expiresAt: Date.now() + HISTORY_CACHE_TTL_MS,
    snapshot,
    latestPostAt: meta.latestPostAt ?? null,
    suggestedGeneratedAtMs: Number.isNaN(generatedAtMs) ? Date.now() : generatedAtMs,
    suggestedPeriodHashes: meta.suggestedPeriodHashes,
  });
}

function historySnapshotIsStale(params: {
  suggestedGeneratedAtMs: number;
  storedLatestPostAt: string | null;
  activityLatestPostAt: string | null;
}): boolean {
  const { suggestedGeneratedAtMs, storedLatestPostAt, activityLatestPostAt } = params;
  const snapshotLatestMs = toTimestamp(storedLatestPostAt);
  const activityLatestMs = toTimestamp(activityLatestPostAt);

  if (activityLatestMs !== null) {
    if (snapshotLatestMs === null || activityLatestMs > snapshotLatestMs) {
      return true;
    }
  } else if (snapshotLatestMs !== null) {
    return true;
  }

  if (Date.now() - suggestedGeneratedAtMs > HISTORY_PERSIST_REFRESH_MS) {
    return true;
  }

  return false;
}

function extractLatestTimelineTimestampFromStored(snapshot: StoredHistorySnapshot): string | null {
  let latestMs: number | null = null;
  let latestIso: string | null = null;
  snapshot.sections.forEach((section) => {
    section.content.timeline.forEach((entry) => {
      const timestamp = entry.timestamp ?? null;
      const ms = toTimestamp(timestamp);
      if (ms !== null && (latestMs === null || ms > latestMs)) {
        latestMs = ms;
        latestIso = timestamp;
      }
    });
  });
  return latestIso;
}

function resolveCapsuleMediaUrl(
  value: string | null,
  originOverride?: string | null,
): string | null {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return null;
  const origin = originOverride ?? serverEnv.SITE_URL;
  return resolveToAbsoluteUrl(normalized, origin) ?? normalized;
}

function buildCapsulePostPermalink(capsuleId: string, postId: string): string {
  const base = `/capsule?capsuleId=${encodeURIComponent(capsuleId)}`;
  return `${base}&postId=${encodeURIComponent(postId)}`;
}

function normalizeMemberRole(value: unknown): CapsuleMemberUiRole {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new CapsuleMembershipError("invalid", "Invalid capsule role.", 400);
  }
  const lower = normalized.toLowerCase();
  if (!isCapsuleMemberUiRole(lower)) {
    throw new CapsuleMembershipError("invalid", "Invalid capsule role.", 400);
  }
  return lower as CapsuleMemberUiRole;
}

function normalizeRequestMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  return trimmed.slice(0, REQUEST_MESSAGE_MAX_LENGTH);
}

export class CapsuleMembershipError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict" | "invalid",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function requireCapsule(capsuleId: string) {
  const capsule = await findCapsuleById(capsuleId);
  if (!capsule?.id) {
    throw new CapsuleMembershipError("not_found", "Capsule not found.", 404);
  }
  const ownerId = normalizeId(capsule.created_by_id);
  if (!ownerId) {
    throw new Error("capsules.membership: capsule missing owner identifier");
  }
  return { capsule, ownerId };
}

export async function requireCapsuleOwnership(capsuleId: string, ownerId: string) {
  const normalizedOwnerId = normalizeId(ownerId);
  if (!normalizedOwnerId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsule(capsuleId);
  if (capsuleOwnerId !== normalizedOwnerId) {
    throw new CapsuleMembershipError(
      "forbidden",
      "You do not have permission to manage this capsule.",
      403,
    );
  }
  return { capsule, ownerId: capsuleOwnerId };
}

export type CapsuleGatePayload = {
  capsules: CapsuleSummary[];
  defaultCapsuleId: string | null;
};

export async function resolveCapsuleGate(
  supabaseUserId: string | null | undefined,
  options: { origin?: string | null } = {},
): Promise<CapsuleGatePayload> {
  if (!supabaseUserId) {
    return { capsules: [], defaultCapsuleId: null };
  }

  const capsules = await listCapsulesForUser(supabaseUserId);
  const hydratedCapsules = capsules.map((capsule) => ({
    ...capsule,
    bannerUrl: resolveCapsuleMediaUrl(capsule.bannerUrl, options.origin ?? null),
    storeBannerUrl: resolveCapsuleMediaUrl(capsule.storeBannerUrl, options.origin ?? null),
    promoTileUrl: resolveCapsuleMediaUrl(capsule.promoTileUrl, options.origin ?? null),
    logoUrl: resolveCapsuleMediaUrl(capsule.logoUrl, options.origin ?? null),
  }));
  const defaultCapsuleId = hydratedCapsules.length === 1 ? (hydratedCapsules[0]?.id ?? null) : null;

  return { capsules: hydratedCapsules, defaultCapsuleId };
}

export async function getUserCapsules(
  supabaseUserId: string | null | undefined,
  options: { origin?: string | null } = {},
): Promise<CapsuleSummary[]> {
  if (!supabaseUserId) return [];
  const capsules = await listCapsulesForUser(supabaseUserId);
  return capsules.map((capsule) => ({
    ...capsule,
    bannerUrl: resolveCapsuleMediaUrl(capsule.bannerUrl, options.origin ?? null),
    storeBannerUrl: resolveCapsuleMediaUrl(capsule.storeBannerUrl, options.origin ?? null),
    promoTileUrl: resolveCapsuleMediaUrl(capsule.promoTileUrl, options.origin ?? null),
    logoUrl: resolveCapsuleMediaUrl(capsule.logoUrl, options.origin ?? null),
  }));
}

export async function getRecentCapsules(
  options: {
    viewerId?: string | null | undefined;
    limit?: number;
    origin?: string | null;
  } = {},
): Promise<DiscoverCapsuleSummary[]> {
  const normalizedViewer = normalizeId(options.viewerId ?? null);
  const origin = options.origin ?? null;
  const queryOptions: {
    excludeCreatorId?: string | null;
    limit?: number;
  } = {
    ...(normalizedViewer ? { excludeCreatorId: normalizedViewer } : {}),
  };
  if (typeof options.limit === "number") {
    queryOptions.limit = options.limit;
  }
  const capsules = await listRecentPublicCapsules(queryOptions);
  return capsules.map((capsule) => ({
    ...capsule,
    bannerUrl: resolveCapsuleMediaUrl(capsule.bannerUrl, origin),
    storeBannerUrl: resolveCapsuleMediaUrl(capsule.storeBannerUrl, origin),
    promoTileUrl: resolveCapsuleMediaUrl(capsule.promoTileUrl, origin),
    logoUrl: resolveCapsuleMediaUrl(capsule.logoUrl, origin),
  }));
}

export async function getCapsuleSummaryForViewer(
  capsuleId: string,
  viewerId?: string | null | undefined,
  options: { origin?: string | null } = {},
): Promise<CapsuleSummary | null> {
  const summary = await repoGetCapsuleSummaryForViewer(capsuleId, viewerId ?? null);
  if (!summary) return null;
  return {
    ...summary,
    bannerUrl: resolveCapsuleMediaUrl(summary.bannerUrl, options.origin ?? null),
    storeBannerUrl: resolveCapsuleMediaUrl(summary.storeBannerUrl, options.origin ?? null),
    promoTileUrl: resolveCapsuleMediaUrl(summary.promoTileUrl, options.origin ?? null),
    logoUrl: resolveCapsuleMediaUrl(summary.logoUrl, options.origin ?? null),
  };
}

export async function createCapsule(
  ownerId: string,
  params: { name: string },
): Promise<CapsuleSummary> {
  return createCapsuleForUser(ownerId, params);
}

export async function deleteCapsule(ownerId: string, capsuleId: string): Promise<boolean> {
  return deleteCapsuleOwnedByUser(ownerId, capsuleId);
}

type BannerCrop = {
  offsetX: number;
  offsetY: number;
};

export async function updateCapsuleBannerImage(
  ownerId: string,
  capsuleId: string,
  params: {
    bannerUrl: string;
    storageKey?: string | null;
    mimeType?: string | null;
    crop?: BannerCrop | null;
    source?: string | null;
    originalUrl?: string | null;
    originalName?: string | null;
    prompt?: string | null;
    width?: number | null;
    height?: number | null;
    memoryId?: string | null;
  },
  context: { origin?: string | null } = {},
): Promise<{ bannerUrl: string | null }> {
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.banner.update: capsule has invalid identifier");
  }

  const canonicalBannerUrl = normalizeOptionalString(params.bannerUrl ?? null);
  if (!canonicalBannerUrl) {
    throw new CapsuleMembershipError("invalid", "A banner URL is required.", 400);
  }

  const resolvedBannerUrl = resolveCapsuleMediaUrl(canonicalBannerUrl, context.origin ?? null);
  if (!resolvedBannerUrl) {
    throw new CapsuleMembershipError("invalid", "A banner URL is required.", 400);
  }

  const updated = await updateCapsuleBanner({
    capsuleId: capsuleIdValue,
    ownerId: capsuleOwnerId,
    bannerUrl: canonicalBannerUrl,
  });

  if (!updated) {
    throw new CapsuleMembershipError("invalid", "Failed to update capsule banner.", 400);
  }

  const capsuleName = normalizeOptionalString(capsule.name ?? null) ?? "your capsule";
  const originalName = normalizeOptionalString(params.originalName ?? null);

  const memoryTitle = originalName ? `${originalName} banner` : `Banner for ${capsuleName}`;

  const savedAtIso = new Date().toISOString();
  const baseDescription = `Custom banner saved for ${capsuleName} on ${savedAtIso}.`;
  const promptText = normalizeOptionalString(params.prompt ?? null);
  const description = promptText ? `${baseDescription} Prompt: ${promptText}` : baseDescription;

  const metadata: Record<string, string | number | boolean> = {
    capsule_id: capsuleIdValue,
    asset_variant: "banner",
    asset_ratio: "16:9",
  };

  if (params.storageKey) metadata.storage_key = params.storageKey;
  if (params.source) metadata.source_kind = params.source;
  const resolvedOriginalUrl = resolveCapsuleMediaUrl(
    normalizeOptionalString(params.originalUrl ?? null),
    context.origin ?? null,
  );
  if (resolvedOriginalUrl) metadata.original_url = resolvedOriginalUrl;
  if (promptText) metadata.prompt = promptText;
  if (params.width) metadata.width = params.width;
  if (params.height) metadata.height = params.height;
  if (params.originalName) metadata.original_name = params.originalName;
  if (params.mimeType) metadata.mime_type = params.mimeType;
  const normalizedMemoryId = normalizeOptionalString(params.memoryId ?? null);
  if (normalizedMemoryId) metadata.memory_id = normalizedMemoryId;
  if (params.crop) {
    if (Number.isFinite(params.crop.offsetX)) {
      metadata.crop_offset_x = Number(params.crop.offsetX.toFixed(4));
    }
    if (Number.isFinite(params.crop.offsetY)) {
      metadata.crop_offset_y = Number(params.crop.offsetY.toFixed(4));
    }
  }

  await indexMemory({
    ownerId: capsuleOwnerId,
    kind: "upload",
    mediaUrl: resolvedBannerUrl,
    mediaType: normalizeOptionalString(params.mimeType ?? null) ?? "image/jpeg",
    title: memoryTitle,
    description,
    postId: null,
    metadata: Object.keys(metadata).length ? metadata : null,
    rawText: description,
    source: "capsule_banner",
    tags: ["capsule", "banner", capsuleName],
    eventAt: savedAtIso,
  });

  return { bannerUrl: resolvedBannerUrl };
}

export async function updateCapsuleStoreBannerImage(
  ownerId: string,
  capsuleId: string,
  params: {
    storeBannerUrl: string;
    storageKey?: string | null;
    mimeType?: string | null;
    crop?: BannerCrop | null;
    source?: string | null;
    originalUrl?: string | null;
    originalName?: string | null;
    prompt?: string | null;
    width?: number | null;
    height?: number | null;
    memoryId?: string | null;
  },
  context: { origin?: string | null } = {},
): Promise<{ storeBannerUrl: string | null }> {
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.storeBanner.update: capsule has invalid identifier");
  }

  const canonicalStoreBannerUrl = normalizeOptionalString(params.storeBannerUrl ?? null);
  if (!canonicalStoreBannerUrl) {
    throw new CapsuleMembershipError("invalid", "A store banner URL is required.", 400);
  }

  const resolvedStoreBannerUrl = resolveCapsuleMediaUrl(
    canonicalStoreBannerUrl,
    context.origin ?? null,
  );
  if (!resolvedStoreBannerUrl) {
    throw new CapsuleMembershipError("invalid", "A store banner URL is required.", 400);
  }

  const updated = await updateCapsuleStoreBanner({
    capsuleId: capsuleIdValue,
    ownerId: capsuleOwnerId,
    storeBannerUrl: canonicalStoreBannerUrl,
  });

  if (!updated) {
    throw new CapsuleMembershipError("invalid", "Failed to update capsule store banner.", 400);
  }

  const capsuleName = normalizeOptionalString(capsule.name ?? null) ?? "your capsule";
  const originalName = normalizeOptionalString(params.originalName ?? null);

  const memoryTitle = originalName
    ? `${originalName} store banner`
    : `Store banner for ${capsuleName}`;

  const savedAtIso = new Date().toISOString();
  const baseDescription = `Custom store banner saved for ${capsuleName} on ${savedAtIso}.`;
  const promptText = normalizeOptionalString(params.prompt ?? null);
  const description = promptText ? `${baseDescription} Prompt: ${promptText}` : baseDescription;

  const metadata: Record<string, string | number | boolean> = {
    capsule_id: capsuleIdValue,
    asset_variant: "store_banner",
    asset_ratio: "5:2",
  };

  if (params.storageKey) metadata.storage_key = params.storageKey;
  if (params.source) metadata.source_kind = params.source;
  const resolvedOriginalUrl = resolveCapsuleMediaUrl(
    normalizeOptionalString(params.originalUrl ?? null),
    context.origin ?? null,
  );
  if (resolvedOriginalUrl) metadata.original_url = resolvedOriginalUrl;
  if (promptText) metadata.prompt = promptText;
  if (params.width) metadata.width = params.width;
  if (params.height) metadata.height = params.height;
  if (params.originalName) metadata.original_name = params.originalName;
  if (params.mimeType) metadata.mime_type = params.mimeType;
  const normalizedMemoryId = normalizeOptionalString(params.memoryId ?? null);
  if (normalizedMemoryId) metadata.memory_id = normalizedMemoryId;
  if (params.crop) {
    if (Number.isFinite(params.crop.offsetX)) {
      metadata.crop_offset_x = Number(params.crop.offsetX.toFixed(4));
    }
    if (Number.isFinite(params.crop.offsetY)) {
      metadata.crop_offset_y = Number(params.crop.offsetY.toFixed(4));
    }
  }

  await indexMemory({
    ownerId: capsuleOwnerId,
    kind: "upload",
    mediaUrl: resolvedStoreBannerUrl,
    mediaType: normalizeOptionalString(params.mimeType ?? null) ?? "image/jpeg",
    title: memoryTitle,
    description,
    postId: null,
    metadata: Object.keys(metadata).length ? metadata : null,
    rawText: description,
    source: "capsule_store_banner",
    tags: ["capsule", "store_banner", capsuleName],
    eventAt: savedAtIso,
  });

  return { storeBannerUrl: resolvedStoreBannerUrl };
}

export async function updateCapsulePromoTileImage(
  ownerId: string,
  capsuleId: string,
  params: {
    tileUrl: string;
    storageKey?: string | null;
    mimeType?: string | null;
    crop?: BannerCrop | null;
    source?: string | null;
    originalUrl?: string | null;
    originalName?: string | null;
    prompt?: string | null;
    width?: number | null;
    height?: number | null;
    memoryId?: string | null;
  },
  context: { origin?: string | null } = {},
): Promise<{ tileUrl: string | null }> {
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.tile.update: capsule has invalid identifier");
  }

  const canonicalTileUrl = normalizeOptionalString(params.tileUrl ?? null);
  if (!canonicalTileUrl) {
    throw new CapsuleMembershipError("invalid", "A tile URL is required.", 400);
  }

  const resolvedTileUrl = resolveCapsuleMediaUrl(canonicalTileUrl, context.origin ?? null);
  if (!resolvedTileUrl) {
    throw new CapsuleMembershipError("invalid", "A tile URL is required.", 400);
  }

  const updated = await updateCapsulePromoTile({
    capsuleId: capsuleIdValue,
    ownerId: capsuleOwnerId,
    promoTileUrl: canonicalTileUrl,
  });

  if (!updated) {
    throw new CapsuleMembershipError("invalid", "Failed to update capsule promo tile.", 400);
  }

  const capsuleName = normalizeOptionalString(capsule.name ?? null) ?? "your capsule";
  const originalName = normalizeOptionalString(params.originalName ?? null);

  const memoryTitle = originalName ? `${originalName} promo tile` : `Promo tile for ${capsuleName}`;

  const savedAtIso = new Date().toISOString();
  const baseDescription = `Custom promo tile saved for ${capsuleName} on ${savedAtIso}.`;
  const promptText = normalizeOptionalString(params.prompt ?? null);
  const description = promptText ? `${baseDescription} Prompt: ${promptText}` : baseDescription;

  const metadata: Record<string, string | number | boolean> = {
    capsule_id: capsuleIdValue,
    asset_variant: "promo_tile",
    asset_ratio: "9:16",
  };

  if (params.storageKey) metadata.storage_key = params.storageKey;
  if (params.source) metadata.source_kind = params.source;
  const resolvedOriginalUrl = resolveCapsuleMediaUrl(
    normalizeOptionalString(params.originalUrl ?? null),
    context.origin ?? null,
  );
  if (resolvedOriginalUrl) metadata.original_url = resolvedOriginalUrl;
  if (promptText) metadata.prompt = promptText;
  if (params.width) metadata.width = params.width;
  if (params.height) metadata.height = params.height;
  if (params.originalName) metadata.original_name = params.originalName;
  if (params.mimeType) metadata.mime_type = params.mimeType;
  const normalizedMemoryId = normalizeOptionalString(params.memoryId ?? null);
  if (normalizedMemoryId) metadata.memory_id = normalizedMemoryId;
  if (params.crop) {
    if (Number.isFinite(params.crop.offsetX)) {
      metadata.crop_offset_x = Number(params.crop.offsetX.toFixed(4));
    }
    if (Number.isFinite(params.crop.offsetY)) {
      metadata.crop_offset_y = Number(params.crop.offsetY.toFixed(4));
    }
  }

  await indexMemory({
    ownerId: capsuleOwnerId,
    kind: "upload",
    mediaUrl: resolvedTileUrl,
    mediaType: normalizeOptionalString(params.mimeType ?? null) ?? "image/jpeg",
    title: memoryTitle,
    description,
    postId: null,
    metadata: Object.keys(metadata).length ? metadata : null,
    rawText: description,
    source: "capsule_tile",
    tags: ["capsule", "tile", capsuleName],
    eventAt: savedAtIso,
  });

  return { tileUrl: resolvedTileUrl };
}

export async function updateCapsuleLogoImage(
  ownerId: string,
  capsuleId: string,
  params: {
    logoUrl: string;
    storageKey?: string | null;
    mimeType?: string | null;
    crop?: BannerCrop | null;
    source?: string | null;
    originalUrl?: string | null;
    originalName?: string | null;
    prompt?: string | null;
    width?: number | null;
    height?: number | null;
    memoryId?: string | null;
  },
  context: { origin?: string | null } = {},
): Promise<{ logoUrl: string | null }> {
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.logo.update: capsule has invalid identifier");
  }

  const canonicalLogoUrl = normalizeOptionalString(params.logoUrl ?? null);
  if (!canonicalLogoUrl) {
    throw new CapsuleMembershipError("invalid", "A logo URL is required.", 400);
  }

  const resolvedLogoUrl = resolveCapsuleMediaUrl(canonicalLogoUrl, context.origin ?? null);
  if (!resolvedLogoUrl) {
    throw new CapsuleMembershipError("invalid", "A logo URL is required.", 400);
  }

  const updated = await updateCapsuleLogo({
    capsuleId: capsuleIdValue,
    ownerId: capsuleOwnerId,
    logoUrl: canonicalLogoUrl,
  });

  if (!updated) {
    throw new CapsuleMembershipError("invalid", "Failed to update capsule logo.", 400);
  }

  const capsuleName = normalizeOptionalString(capsule.name ?? null) ?? "your capsule";
  const originalName = normalizeOptionalString(params.originalName ?? null);

  const memoryTitle = originalName ? `${originalName} logo` : `Logo for ${capsuleName}`;

  const savedAtIso = new Date().toISOString();
  const baseDescription = `Custom logo saved for ${capsuleName} on ${savedAtIso}.`;
  const promptText = normalizeOptionalString(params.prompt ?? null);
  const description = promptText ? `${baseDescription} Prompt: ${promptText}` : baseDescription;

  const metadata: Record<string, string | number | boolean> = {
    capsule_id: capsuleIdValue,
    asset_variant: "logo",
    asset_ratio: "1:1",
  };

  if (params.storageKey) metadata.storage_key = params.storageKey;
  if (params.source) metadata.source_kind = params.source;
  const resolvedOriginalUrl = resolveCapsuleMediaUrl(
    normalizeOptionalString(params.originalUrl ?? null),
    context.origin ?? null,
  );
  if (resolvedOriginalUrl) metadata.original_url = resolvedOriginalUrl;
  if (promptText) metadata.prompt = promptText;
  if (params.width) metadata.width = params.width;
  if (params.height) metadata.height = params.height;
  if (params.originalName) metadata.original_name = params.originalName;
  if (params.mimeType) metadata.mime_type = params.mimeType;
  const normalizedMemoryId = normalizeOptionalString(params.memoryId ?? null);
  if (normalizedMemoryId) metadata.memory_id = normalizedMemoryId;
  if (params.crop) {
    if (Number.isFinite(params.crop.offsetX)) {
      metadata.crop_offset_x = Number(params.crop.offsetX.toFixed(4));
    }
    if (Number.isFinite(params.crop.offsetY)) {
      metadata.crop_offset_y = Number(params.crop.offsetY.toFixed(4));
    }
  }

  await indexMemory({
    ownerId: capsuleOwnerId,
    kind: "upload",
    mediaUrl: resolvedLogoUrl,
    mediaType: normalizeOptionalString(params.mimeType ?? null) ?? "image/jpeg",
    title: memoryTitle,
    description,
    postId: null,
    metadata: Object.keys(metadata).length ? metadata : null,
    rawText: description,
    source: "capsule_logo",
    tags: ["capsule", "logo", capsuleName],
    eventAt: savedAtIso,
  });

  return { logoUrl: resolvedLogoUrl };
}

export async function getCapsuleMembership(
  capsuleId: string,
  viewerId: string | null | undefined,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const { capsule, ownerId } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership: capsule has invalid identifier");
  }

  const normalizedViewerId = normalizeId(viewerId ?? null);
  const isOwner = normalizedViewerId === ownerId;

  let membershipRecord = null;
  if (normalizedViewerId && !isOwner) {
    membershipRecord = await getCapsuleMemberRecord(capsuleIdValue, normalizedViewerId);
  }

  let viewerRequest: CapsuleMemberRequestSummary | null = null;
  if (normalizedViewerId && !isOwner && !membershipRecord) {
    viewerRequest = await getCapsuleMemberRequest(capsuleIdValue, normalizedViewerId);
  }

  const members = await listCapsuleMembers(capsuleIdValue, ownerId);
  const requests = isOwner ? await listCapsuleMemberRequests(capsuleIdValue, "pending") : [];

  const pendingCount = isOwner ? requests.length : viewerRequest?.status === "pending" ? 1 : 0;

  const viewer: CapsuleMembershipViewer = {
    userId: normalizedViewerId,
    isOwner,
    isMember: isOwner || Boolean(membershipRecord),
    canManage: isOwner,
    canRequest:
      Boolean(normalizedViewerId) &&
      !isOwner &&
      !membershipRecord &&
      viewerRequest?.status !== "pending",
    role: resolveViewerUiRole(membershipRecord?.role ?? null, isOwner),
    memberSince: membershipRecord?.joined_at ?? null,
    requestStatus: viewerRequest?.status ?? "none",
    requestId: viewerRequest?.id ?? null,
  };

  return {
    capsule: {
      id: capsuleIdValue,
      name: normalizeOptionalString(capsule.name ?? null),
      slug: normalizeOptionalString(capsule.slug ?? null),
      ownerId,
      bannerUrl: resolveCapsuleMediaUrl(capsule.banner_url ?? null, options.origin ?? null),
      storeBannerUrl: resolveCapsuleMediaUrl(capsule.store_banner_url ?? null, options.origin ?? null),
      promoTileUrl: resolveCapsuleMediaUrl(capsule.promo_tile_url ?? null, options.origin ?? null),
      logoUrl: resolveCapsuleMediaUrl(capsule.logo_url ?? null, options.origin ?? null),
    },
    viewer,
    counts: {
      members: members.length,
      pendingRequests: pendingCount,
    },
    members,
    requests,
    viewerRequest,
  };
}

export async function requestCapsuleMembership(
  userId: string,
  capsuleId: string,
  params: { message?: string } = {},
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }

  const { capsule, ownerId } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.request: capsule has invalid identifier");
  }

  if (ownerId === normalizedUserId) {
    throw new CapsuleMembershipError("conflict", "You already own this capsule.", 409);
  }

  const membership = await getCapsuleMemberRecord(capsuleIdValue, normalizedUserId);
  if (membership) {
    throw new CapsuleMembershipError("conflict", "You are already a member of this capsule.", 409);
  }

  const message = normalizeRequestMessage(params.message ?? null);
  await upsertCapsuleMemberRequest(capsuleIdValue, normalizedUserId, { message });

  return getCapsuleMembership(capsuleIdValue, normalizedUserId, options);
}

export async function approveCapsuleMemberRequest(
  ownerId: string,
  capsuleId: string,
  requestId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedRequestId = normalizeId(requestId);
  if (!normalizedRequestId) {
    throw new CapsuleMembershipError("invalid", "A valid request id is required.", 400);
  }

  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.approve: capsule has invalid identifier");
  }

  const updated = await setCapsuleMemberRequestStatus({
    capsuleId: capsuleIdValue,
    requestId: normalizedRequestId,
    status: "approved",
    responderId: capsuleOwnerId,
  });

  if (!updated) {
    throw new CapsuleMembershipError(
      "not_found",
      "Pending membership request not found or already processed.",
      404,
    );
  }

  const uiRole: CapsuleMemberUiRole =
    updated.role && isCapsuleMemberUiRole(updated.role) ? updated.role : "member";
  const dbRole = uiRoleToDbRole(uiRole);

  await upsertCapsuleMember({
    capsuleId: capsuleIdValue,
    userId: updated.requesterId,
    role: dbRole,
  });

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
}

export async function declineCapsuleMemberRequest(
  ownerId: string,
  capsuleId: string,
  requestId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedRequestId = normalizeId(requestId);
  if (!normalizedRequestId) {
    throw new CapsuleMembershipError("invalid", "A valid request id is required.", 400);
  }

  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.decline: capsule has invalid identifier");
  }

  const updated = await setCapsuleMemberRequestStatus({
    capsuleId: capsuleIdValue,
    requestId: normalizedRequestId,
    status: "declined",
    responderId: capsuleOwnerId,
  });

  if (!updated) {
    throw new CapsuleMembershipError(
      "not_found",
      "Pending membership request not found or already processed.",
      404,
    );
  }

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
}

export async function removeCapsuleMember(
  ownerId: string,
  capsuleId: string,
  memberId: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedMemberId = normalizeId(memberId);
  if (!normalizedMemberId) {
    throw new CapsuleMembershipError("invalid", "A valid member id is required.", 400);
  }

  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.remove: capsule has invalid identifier");
  }

  if (normalizedMemberId === capsuleOwnerId) {
    throw new CapsuleMembershipError("conflict", "You cannot remove the capsule owner.", 409);
  }

  const removed = await deleteCapsuleMemberRecord(capsuleIdValue, normalizedMemberId);
  if (!removed) {
    throw new CapsuleMembershipError("not_found", "Member not found in this capsule.", 404);
  }

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
}

export async function setCapsuleMemberRole(
  ownerId: string,
  capsuleId: string,
  memberId: string,
  role: string,
  options: { origin?: string | null } = {},
): Promise<CapsuleMembershipState> {
  const normalizedMemberId = normalizeId(memberId);
  if (!normalizedMemberId) {
    throw new CapsuleMembershipError("invalid", "A valid member id is required.", 400);
  }

  const normalizedRole = normalizeMemberRole(role);

  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.membership.role: capsule has invalid identifier");
  }

  if (normalizedMemberId === capsuleOwnerId && normalizedRole !== "founder") {
    throw new CapsuleMembershipError("conflict", "The capsule owner must remain a founder.", 409);
  }

  const updated = await updateCapsuleMemberRole({
    capsuleId: capsuleIdValue,
    memberId: normalizedMemberId,
    role: uiRoleToDbRole(normalizedRole),
  });

  if (!updated) {
    throw new CapsuleMembershipError("not_found", "Member not found in this capsule.", 404);
  }

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId, options);
}

type CapsuleHistoryPostRow = {
  id: string | number | null;
  kind: string | null;
  content: string | null;
  media_url: string | null;
  media_prompt: string | null;
  user_name: string | null;
  created_at: string | null;
};

type CapsuleHistoryPost = {
  id: string;
  kind: string | null;
  content: string;
  createdAt: string | null;
  user: string | null;
  hasMedia: boolean;
};

type CapsuleHistoryTimeframe = {
  period: CapsuleHistoryPeriod;
  label: string;
  start: string | null;
  end: string | null;
  posts: CapsuleHistoryPost[];
};

type HistoryModelSection = {
  period?: unknown;
  title?: unknown;
  summary?: unknown;
  highlights?: unknown;
  articles?: unknown;
  next_focus?: unknown;
  timeline?: unknown;
  empty?: unknown;
};

type HistoryModelTimelineEntry = {
  label?: unknown;
  detail?: unknown;
  timestamp?: unknown;
  post_id?: unknown;
};

type HistoryModelArticle = {
  title?: unknown;
  summary?: unknown;
  paragraphs?: unknown;
  sources?: unknown;
  primary_source_id?: unknown;
};

type HistoryModelArticleSource = {
  label?: unknown;
  post_id?: unknown;
  url?: unknown;
};

type StoredHistorySection = {
  period: CapsuleHistoryPeriod;
  title: string;
  timeframe: { start: string | null; end: string | null };
  postCount: number;
  isEmpty: boolean;
  content: CapsuleHistorySectionContent;
};

type StoredHistorySnapshot = {
  capsuleId: string;
  capsuleName: string | null;
  generatedAt: string;
  sections: StoredHistorySection[];
  sources: Record<string, CapsuleHistorySource>;
};

type CoverageMetaMap = Record<CapsuleHistoryPeriod, CapsuleHistoryCoverage>;

const DEFAULT_PROMPT_MEMORY: CapsuleHistoryPromptMemory = {
  guidelines: [],
  tone: null,
  mustInclude: [],
  autoLinkTopics: [],
};

const DEFAULT_HISTORY_TEMPLATE_PRESETS: CapsuleHistoryTemplatePreset[] = [
  {
    id: "press-release",
    label: "Press Release",
    description: "Structured, third-person recap suited for announcements.",
    tone: "formal",
  },
  {
    id: "community-recap",
    label: "Community Recap",
    description: "Conversational highlights focused on community activity.",
    tone: "warm",
  },
  {
    id: "investor-brief",
    label: "Investor Brief",
    description: "Bullet-first summary emphasizing outcomes and next steps.",
    tone: "concise",
  },
];

const HISTORY_CONTENT_LIMIT = 320;
const HISTORY_SUMMARY_LIMIT = 420;
const HISTORY_LINE_LIMIT = 200;

const CAPSULE_HISTORY_RESPONSE_SCHEMA = {
  name: "CapsuleHistory",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["generated_at", "sections"],
    properties: {
      generated_at: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["period", "summary", "highlights", "articles", "timeline", "next_focus"],
          properties: {
            period: { type: "string", enum: ["weekly", "monthly", "all_time"] },
            title: { type: "string" },
            summary: { type: "string" },
            highlights: { type: "array", items: { type: "string" } },
            articles: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "paragraphs"],
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  paragraphs: { type: "array", items: { type: "string" } },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["label"],
                      properties: {
                        label: { type: "string" },
                        post_id: { type: ["string", "null"] },
                        url: { type: ["string", "null"] },
                      },
                    },
                  },
                  primary_source_id: { type: ["string", "null"] },
                },
              },
            },
            timeline: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "detail"],
                properties: {
                  label: { type: "string" },
                  detail: { type: "string" },
                  timestamp: { type: ["string", "null"] },
                  post_id: { type: ["string", "null"] },
                },
              },
            },
            next_focus: { type: "array", items: { type: "string" } },
            empty: { type: "boolean" },
          },
        },
      },
    },
  },
} as const;

function sanitizeHistoryContent(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed.length) return "";
  return trimmed.length > HISTORY_CONTENT_LIMIT ? trimmed.slice(0, HISTORY_CONTENT_LIMIT) : trimmed;
}

function sanitizeHistoryString(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed.length) return null;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

function sanitizeHistoryArray(
  value: unknown,
  limit: number,
  itemLimit = HISTORY_LINE_LIMIT,
): string[] {
  if (!Array.isArray(value)) return [];
  const entries: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.replace(/\s+/g, " ").trim();
    if (!trimmed.length) continue;
    entries.push(trimmed.length > itemLimit ? trimmed.slice(0, itemLimit) : trimmed);
    if (entries.length >= limit) break;
  }
  return entries;
}

function buildHistoryContentId(...parts: Array<string | number | null | undefined>): string {
  const hash = createHash("sha1");
  parts.forEach((part) => {
    hash.update(String(part ?? "-"));
    hash.update("|");
  });
  return hash.digest("hex").slice(0, 16);
}

function makeContentBlock(params: {
  period: CapsuleHistoryPeriod;
  kind: string;
  index: number;
  text: string;
  seed?: string;
  sourceIds?: string[];
  metadata?: Record<string, unknown> | null;
}): CapsuleHistoryContentBlock {
  const { period, kind, index, text } = params;
  const id = buildHistoryContentId(period, kind, index, params.seed ?? text);
  const uniqueSourceIds = Array.from(new Set(params.sourceIds ?? [])).filter((value) => value);
  return {
    id,
    text,
    sourceIds: uniqueSourceIds,
    pinned: false,
    pinId: null,
    note: null,
    metadata: params.metadata ?? null,
  };
}

function makeTimelineEntry(params: {
  period: CapsuleHistoryPeriod;
  index: number;
  label: string;
  detail: string;
  timestamp: string | null;
  postId?: string | null;
  permalink?: string | null;
  sourceIds?: string[];
}): CapsuleHistoryTimelineEntry {
  const metadata: Record<string, unknown> | null = params.postId
    ? { postId: params.postId }
    : null;
  const base = makeContentBlock({
    period: params.period,
    kind: "timeline",
    index: params.index,
    text: params.detail,
    seed: params.label,
    ...(Array.isArray(params.sourceIds) ? { sourceIds: params.sourceIds } : {}),
    metadata,
  });
  return {
    ...base,
    label: params.label,
    detail: params.detail,
    timestamp: params.timestamp ?? null,
    postId: params.postId ?? null,
    permalink: params.permalink ?? null,
  };
}

function buildEmptyCoverage(): CapsuleHistoryCoverage {
  return {
    completeness: 0,
    authors: [],
    themes: [],
    timeSpans: [],
  };
}

function ensurePostSource(
  sources: Record<string, CapsuleHistorySource>,
  capsuleId: string,
  post: CapsuleHistoryPost,
): string {
  const postId = post.id;
  const sourceId = `post:${postId}`;
  if (!sources[sourceId]) {
    const label = post.content ? post.content.slice(0, 140) : `Update from ${post.user ?? "member"}`;
    sources[sourceId] = {
      id: sourceId,
      type: "post",
      label,
      description: post.content ?? null,
      url: buildCapsulePostPermalink(capsuleId, postId),
      postId,
      topicPageId: null,
      quoteId: null,
      authorName: post.user ?? null,
      authorAvatarUrl: null,
      occurredAt: post.createdAt,
      metrics: {
        reactions: null,
        comments: null,
        shares: null,
      },
    };
  }
  return sourceId;
}

function coerceTimelineEntries(
  value: unknown,
  capsuleId: string,
  period: CapsuleHistoryPeriod,
  sources: Record<string, CapsuleHistorySource>,
  postLookup: Map<string, CapsuleHistoryPost>,
): CapsuleHistoryTimelineEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: CapsuleHistoryTimelineEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as HistoryModelTimelineEntry;
    const label = sanitizeHistoryString(record.label, 120);
    const detail = sanitizeHistoryString(record.detail, HISTORY_LINE_LIMIT);
    const timestamp =
      typeof record.timestamp === "string" && record.timestamp.trim().length
        ? record.timestamp.trim()
        : null;
    if (!label || !detail) continue;
    const postIdRaw = record.post_id;
    let postId: string | null = null;
    if (typeof postIdRaw === "string") {
      postId = normalizeOptionalString(postIdRaw);
    } else if (typeof postIdRaw === "number" && Number.isFinite(postIdRaw)) {
      postId = normalizeOptionalString(String(postIdRaw));
    }
    let sourceIds: string[] = [];
    if (postId) {
      const post = postLookup.get(postId) ?? null;
      if (post) {
        sourceIds = [ensurePostSource(sources, capsuleId, post)];
      } else {
        const fallbackSourceId = `post:${postId}`;
        if (!sources[fallbackSourceId]) {
          sources[fallbackSourceId] = {
            id: fallbackSourceId,
            type: "post",
            label: `Post ${postId}`,
            description: null,
            url: buildCapsulePostPermalink(capsuleId, postId),
            postId,
            topicPageId: null,
            quoteId: null,
            authorName: null,
            authorAvatarUrl: null,
            occurredAt: null,
            metrics: {
              reactions: null,
              comments: null,
              shares: null,
            },
          };
        }
        sourceIds = [fallbackSourceId];
      }
    }
    entries.push(
      makeTimelineEntry({
        period,
        index: entries.length,
        label,
        detail,
        timestamp,
        postId,
        permalink: postId ? buildCapsulePostPermalink(capsuleId, postId) : null,
        sourceIds,
      }),
    );
    if (entries.length >= HISTORY_TIMELINE_LIMIT) break;
  }
  return entries;
}

function coerceArticleLinks(
  value: unknown,
  capsuleId: string,
  sources: Record<string, CapsuleHistorySource>,
  postLookup: Map<string, CapsuleHistoryPost>,
): { links: CapsuleHistoryArticleLink[]; sourceIds: string[] } {
  if (!Array.isArray(value)) {
    return { links: [], sourceIds: [] };
  }

  const links: CapsuleHistoryArticleLink[] = [];
  const sourceIds: string[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as HistoryModelArticleSource;
    const rawPostId =
      typeof record.post_id === "string" && record.post_id.trim().length
        ? record.post_id.trim()
        : null;
    let resolvedSourceId: string | null = null;
    if (rawPostId && postLookup.has(rawPostId)) {
      resolvedSourceId = ensurePostSource(sources, capsuleId, postLookup.get(rawPostId)!);
    }
    let label =
      sanitizeHistoryString(record.label, 140) ??
      (resolvedSourceId && sources[resolvedSourceId]?.label
        ? sanitizeHistoryString(sources[resolvedSourceId]?.label ?? null, 140)
        : null) ??
      (rawPostId && postLookup.has(rawPostId)
        ? sanitizeHistoryString(postLookup.get(rawPostId)!.content, 140)
        : null);

    let url =
      typeof record.url === "string" && record.url.trim().length ? record.url.trim() : null;
    if (!url && resolvedSourceId) {
      url = sources[resolvedSourceId]?.url ?? null;
    }

    const safeLabel = label ?? "Capsule post";
    links.push({
      label: safeLabel,
      url,
      sourceId: resolvedSourceId,
    });

    if (resolvedSourceId) {
      sourceIds.push(resolvedSourceId);
    }

    if (links.length >= HISTORY_ARTICLE_LINK_LIMIT) break;
  }

  return {
    links,
    sourceIds: Array.from(new Set(sourceIds)),
  };
}

function coerceHistoryArticles(
  capsuleId: string,
  period: CapsuleHistoryPeriod,
  timeframe: CapsuleHistoryTimeframe,
  value: unknown,
  sources: Record<string, CapsuleHistorySource>,
  postLookup: Map<string, CapsuleHistoryPost>,
): CapsuleHistoryArticle[] {
  if (!Array.isArray(value)) return [];
  const articles: CapsuleHistoryArticle[] = [];
  const entries = (value as HistoryModelArticle[]).slice(0, HISTORY_ARTICLE_LIMIT);

  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;

    const titleCandidate = sanitizeHistoryString(entry.title, HISTORY_ARTICLE_TITLE_LIMIT);
    const summaryCandidate = sanitizeHistoryContent(entry.summary);
    let paragraphs = sanitizeHistoryArray(
      entry.paragraphs,
      HISTORY_ARTICLE_PARAGRAPH_LIMIT,
      HISTORY_ARTICLE_PARAGRAPH_LENGTH,
    );

    if (!paragraphs.length && summaryCandidate.length) {
      paragraphs = [summaryCandidate];
    }
    if (!paragraphs.length) {
      paragraphs = [titleCandidate ?? `${timeframe.label} highlights`];
    }

    const primarySourcePostId =
      typeof entry.primary_source_id === "string" && entry.primary_source_id.trim().length
        ? entry.primary_source_id.trim()
        : null;

    const { links, sourceIds } = coerceArticleLinks(entry.sources, capsuleId, sources, postLookup);

    if (primarySourcePostId && postLookup.has(primarySourcePostId)) {
      const primarySourceId = ensurePostSource(
        sources,
        capsuleId,
        postLookup.get(primarySourcePostId)!,
      );
      if (!sourceIds.includes(primarySourceId)) {
        sourceIds.unshift(primarySourceId);
      }
      const existingIndex = links.findIndex((link) => link.sourceId === primarySourceId);
      if (existingIndex >= 0) {
        const [primary] = links.splice(existingIndex, 1);
        if (primary) {
          links.unshift(primary);
        }
      } else {
        const source = sources[primarySourceId] ?? null;
        links.unshift({
          label: sanitizeHistoryString(source?.label, 140) ?? "Capsule post",
          url: source?.url ?? null,
          sourceId: primarySourceId,
        });
      }
    }

    if (links.length > HISTORY_ARTICLE_LINK_LIMIT) {
      links.length = HISTORY_ARTICLE_LINK_LIMIT;
    }

    const metadata: CapsuleHistoryArticleMetadata = {
      title: titleCandidate ?? `${timeframe.label} highlights`,
      paragraphs,
      links,
    };
    const text = paragraphs[0] ?? metadata.title;
    if (!text) return;
    const block = makeContentBlock({
      period,
      kind: "article",
      index,
      text,
      seed: `${period}-article-${index}`,
      sourceIds: Array.from(new Set(sourceIds)),
      metadata,
    }) as CapsuleHistoryArticle;
    articles.push(block);
  });

  return articles;
}

function buildFallbackArticles(
  capsuleId: string,
  timeframe: CapsuleHistoryTimeframe,
  summaryText: string,
  highlightTexts: string[],
  sources: Record<string, CapsuleHistorySource>,
): CapsuleHistoryArticle[] {
  const period = timeframe.period;
  const fallbackParagraphs: string[] = [];
  const summaryParagraph = sanitizeHistoryString(summaryText, HISTORY_ARTICLE_PARAGRAPH_LENGTH);
  if (summaryParagraph) {
    fallbackParagraphs.push(summaryParagraph);
  }

  if (fallbackParagraphs.length < HISTORY_ARTICLE_PARAGRAPH_LIMIT) {
    const highlightParagraph = highlightTexts
      .map((item) => sanitizeHistoryString(item, HISTORY_ARTICLE_PARAGRAPH_LENGTH))
      .find((item): item is string => Boolean(item));
    if (highlightParagraph) {
      fallbackParagraphs.push(highlightParagraph);
    }
  }

  if (!fallbackParagraphs.length) {
    const message =
      timeframe.posts.length === 0
        ? `Capsule AI didn't find new activity for ${timeframe.label.toLowerCase()}. Share an update to get this wiki started.`
        : `${timeframe.posts.length} update${timeframe.posts.length === 1 ? "" : "s"} were shared. Capture the highlights to keep your team aligned.`;
    fallbackParagraphs.push(message);
  }

  const links: CapsuleHistoryArticleLink[] = [];
  const sourceIds: string[] = [];
  timeframe.posts.slice(0, HISTORY_ARTICLE_LINK_LIMIT).forEach((post) => {
    const sourceId = ensurePostSource(sources, capsuleId, post);
    const source = sources[sourceId] ?? null;
    const label =
      sanitizeHistoryString(source?.label, 140) ??
      sanitizeHistoryString(post.content, 140) ??
      `Post from ${post.user ?? "member"}`;
    links.push({
      label: label ?? "Capsule post",
      url: source?.url ?? null,
      sourceId,
    });
    sourceIds.push(sourceId);
  });

  const metadata: CapsuleHistoryArticleMetadata = {
    title: `${timeframe.label} recap`,
    paragraphs: fallbackParagraphs.slice(0, HISTORY_ARTICLE_PARAGRAPH_LIMIT),
    links,
  };
  if (!metadata.paragraphs.length) {
    metadata.paragraphs = [`Capsule AI is still gathering updates for ${timeframe.label.toLowerCase()}.`];
  }
  const articleText = metadata.paragraphs[0] ?? `${timeframe.label} recap`;

  const block = makeContentBlock({
    period,
    kind: "article",
    index: 0,
    text: articleText,
    seed: `${period}-article-fallback`,
    sourceIds: Array.from(new Set(sourceIds)),
    metadata,
  }) as CapsuleHistoryArticle;

  return [block];
}

function normalizeHistoryPeriod(value: unknown): CapsuleHistoryPeriod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "weekly" || normalized === "monthly" || normalized === "all_time") {
    return normalized;
  }
  return null;
}

function isOnOrAfterTimestamp(value: string | null, boundary: Date): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() >= boundary.getTime();
}

function resolveEarliestTimestamp(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  const candidateDate = new Date(candidate);
  if (Number.isNaN(candidateDate.getTime())) return current;
  if (!current) return candidate;
  const currentDate = new Date(current);
  if (Number.isNaN(currentDate.getTime())) return candidate;
  return candidateDate.getTime() < currentDate.getTime() ? candidate : current;
}

function mapHistoryPostRow(row: CapsuleHistoryPostRow): CapsuleHistoryPost | null {
  const idSource = row.id;
  let id: string | null = null;
  if (typeof idSource === "string") {
    id = idSource.trim();
  } else if (typeof idSource === "number") {
    id = String(idSource);
  }
  if (!id) return null;
  const createdAt =
    typeof row.created_at === "string" && row.created_at.trim().length
      ? row.created_at.trim()
      : null;
  const kind = sanitizeHistoryString(row.kind, 48);
  const hasMedia = typeof row.media_url === "string" && row.media_url.trim().length > 0;
  const contentPrimary = sanitizeHistoryContent(row.content);
  const contentFallback = sanitizeHistoryContent(row.media_prompt);
  const user =
    typeof row.user_name === "string" && row.user_name.trim().length
      ? row.user_name.trim().slice(0, 80)
      : null;
  const content =
    contentPrimary ||
    contentFallback ||
    (hasMedia ? "Shared new media." : "Shared an update.");
  return {
    id,
    kind,
    content,
    createdAt,
    user,
    hasMedia,
  };
}

async function loadCapsuleHistoryPosts(
  capsuleId: string,
  limit = HISTORY_POST_LIMIT,
): Promise<CapsuleHistoryPost[]> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("posts_view")
    .select<CapsuleHistoryPostRow>(
      "id, kind, content, media_url, media_prompt, user_name, created_at",
    )
    .eq("capsule_id", capsuleId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .fetch();
  if (result.error) {
    throw new Error(`capsules.history.posts: ${result.error.message}`);
  }
  const rows = result.data ?? [];
  return rows
    .map(mapHistoryPostRow)
    .filter((post): post is CapsuleHistoryPost => post !== null);
}

function buildHistoryTimeframes(
  posts: CapsuleHistoryPost[],
  now: Date,
): CapsuleHistoryTimeframe[] {
  const nowIso = now.toISOString();
  const weeklyBoundary = new Date(now.getTime() - WEEK_MS);
  const monthlyBoundary = new Date(now.getTime() - MONTH_MS);
  const weeklyPosts = posts.filter((post) => isOnOrAfterTimestamp(post.createdAt, weeklyBoundary));
  const monthlyPosts = posts.filter((post) => isOnOrAfterTimestamp(post.createdAt, monthlyBoundary));
  const earliest = posts.reduce<string | null>(
    (acc, post) => resolveEarliestTimestamp(acc, post.createdAt),
    null,
  );
  return [
    {
      period: "weekly",
      label: "This Week",
      start: weeklyBoundary.toISOString(),
      end: nowIso,
      posts: weeklyPosts,
    },
    {
      period: "monthly",
      label: "This Month",
      start: monthlyBoundary.toISOString(),
      end: nowIso,
      posts: monthlyPosts,
    },
    {
      period: "all_time",
      label: "All Time",
      start: earliest,
      end: nowIso,
      posts,
    },
  ];
}

function collectAuthorStats(posts: CapsuleHistoryPost[]): Map<string, number> {
  const stats = new Map<string, number>();
  posts.forEach((post) => {
    const name = post.user?.trim();
    if (!name) return;
    stats.set(name, (stats.get(name) ?? 0) + 1);
  });
  return stats;
}

function getTopAuthorName(stats: Map<string, number>): string | null {
  let topName: string | null = null;
  let topCount = 0;
  for (const [name, count] of stats.entries()) {
    if (count > topCount) {
      topName = name;
      topCount = count;
    }
  }
  return topName;
}

function buildFallbackSummary(timeframe: CapsuleHistoryTimeframe): string {
  if (!timeframe.posts.length) {
    if (timeframe.period === "all_time") {
      return "No posts have been shared in this capsule yet.";
    }
    return `No activity recorded for ${timeframe.label.toLowerCase()}.`;
  }
  const stats = collectAuthorStats(timeframe.posts);
  const contributorCount = stats.size || (timeframe.posts[0]?.user ? 1 : 0);
  const latestAuthor = timeframe.posts.find((post) => post.user)?.user ?? "a member";
  if (contributorCount > 1) {
    return `${timeframe.posts.length} posts from ${contributorCount} contributors. Latest update from ${latestAuthor}.`;
  }
  return `${timeframe.posts.length} ${timeframe.posts.length === 1 ? "post" : "posts"} from ${latestAuthor}.`;
}

function buildFallbackHighlights(timeframe: CapsuleHistoryTimeframe): string[] {
  if (!timeframe.posts.length) return [];
  const stats = collectAuthorStats(timeframe.posts);
  const topAuthor = getTopAuthorName(stats);
  const highlights: string[] = [];
  const latest = timeframe.posts[0] ?? null;
  if (latest?.content) {
    highlights.push(latest.content);
  } else if (topAuthor) {
    highlights.push(`${topAuthor} shared an update.`);
  } else {
    highlights.push("Recent member update recorded.");
  }
  if (stats.size > 1) {
    highlights.push(`${stats.size} members contributed updates.`);
  } else if (stats.size === 1 && timeframe.posts.length > 1 && topAuthor) {
    highlights.push(`${topAuthor} posted multiple updates.`);
  }
  return highlights;
}

function buildFallbackNextFocus(timeframe: CapsuleHistoryTimeframe): string[] {
  if (!timeframe.posts.length) {
    return [
      "Post a kickoff recap to start the capsule wiki.",
      "Invite members to share their wins for this period.",
    ];
  }
  return [
    "Pin a short recap highlighting the latest wins.",
    "Ask members to add media or documents that support these updates.",
  ];
}

function buildFallbackTimelineEntries(
  capsuleId: string,
  timeframe: CapsuleHistoryTimeframe,
  sources: Record<string, CapsuleHistorySource>,
): CapsuleHistoryTimelineEntry[] {
  if (!timeframe.posts.length) return [];
  return timeframe.posts.slice(0, HISTORY_TIMELINE_LIMIT).map((post, index) => {
    const label =
      sanitizeHistoryString(
        post.user ? `Update from ${post.user}` : "New update",
        120,
      ) ?? "New update";
    const detail =
      sanitizeHistoryString(
        post.content || (post.hasMedia ? "Shared new media." : "Shared an update."),
        HISTORY_LINE_LIMIT,
      ) ?? "Shared an update.";
    ensurePostSource(sources, capsuleId, post);
    return makeTimelineEntry({
      period: timeframe.period,
      index,
      label,
      detail,
      timestamp: post.createdAt,
      postId: post.id,
      permalink: buildCapsulePostPermalink(capsuleId, post.id),
      sourceIds: [`post:${post.id}`],
    });
  });
}

function computeCoverageMetrics(
  timeframe: CapsuleHistoryTimeframe,
  content: CapsuleHistorySectionContent,
): CapsuleHistoryCoverage {
  if (!timeframe.posts.length) {
    return buildEmptyCoverage();
  }

  const totalPosts = timeframe.posts.length;
  const timelinePostIds = new Set(
    content.timeline
      .map((entry) => entry.postId)
      .filter((postId): postId is string => typeof postId === "string" && postId.length > 0),
  );
  const postAuthorMap = new Map<string, string | null>();
  timeframe.posts.forEach((post) => {
    postAuthorMap.set(post.id, post.user ?? null);
  });

  const summaryWeight = content.summary.text ? 1 : 0;
  const coverageScore =
    (summaryWeight + content.highlights.length + content.timeline.length) /
    Math.max(1, totalPosts);

  const authorStats = collectAuthorStats(timeframe.posts);
  const authors = Array.from(authorStats.entries()).map(([name, count]) => {
    let covered = false;
    timelinePostIds.forEach((postId) => {
      if (postAuthorMap.get(postId) === name) {
        covered = true;
      }
    });
    return {
      id: `author:${name}`,
      label: name,
      covered,
      weight: count,
    };
  });

  const themeCounts = new Map<string, number>();
  timeframe.posts.forEach((post) => {
    const kind = typeof post.kind === "string" ? post.kind.trim() : "";
    if (!kind) return;
    themeCounts.set(kind, (themeCounts.get(kind) ?? 0) + 1);
  });
  const themes = Array.from(themeCounts.entries()).map(([kind, count]) => ({
    id: `theme:${kind}`,
    label: kind.replace(/_/g, " "),
    covered: count > 0,
    weight: count,
  }));

  const segmentCount = 3;
  const segmentSize = Math.max(1, Math.ceil(totalPosts / segmentCount));
  const timeSpans: CapsuleHistoryCoverage["timeSpans"] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const start = index * segmentSize;
    const segmentPosts = timeframe.posts.slice(start, start + segmentSize);
    const covered = segmentPosts.some((post) => timelinePostIds.has(post.id));
    timeSpans.push({
      id: `span:${index}`,
      label: index === 0 ? "Early" : index === 1 ? "Mid-period" : "Recent",
      covered,
      weight: segmentPosts.length,
    });
  }

  return {
    completeness: Math.min(1, Number.isFinite(coverageScore) ? coverageScore : 0),
    authors,
    themes,
    timeSpans,
  };
}

function cloneContentBlock(block: CapsuleHistoryContentBlock): CapsuleHistoryContentBlock {
  return {
    ...block,
    sourceIds: Array.isArray(block.sourceIds) ? [...block.sourceIds] : [],
    metadata:
      block.metadata && typeof block.metadata === "object"
        ? { ...(block.metadata as Record<string, unknown>) }
        : null,
    pinned: Boolean(block.pinned),
    pinId: block.pinId ?? null,
    note: block.note ?? null,
  };
}

function normalizeArticleBlock(block: CapsuleHistoryArticle): CapsuleHistoryArticle {
  const metadataRaw =
    block.metadata && typeof block.metadata === "object"
      ? (block.metadata as Record<string, unknown>)
      : null;
  const title =
    metadataRaw && typeof metadataRaw.title === "string"
      ? sanitizeHistoryString(metadataRaw.title, HISTORY_ARTICLE_TITLE_LIMIT)
      : null;
  const paragraphs = metadataRaw && Array.isArray(metadataRaw.paragraphs)
    ? (metadataRaw.paragraphs as unknown[])
        .map((paragraph) => sanitizeHistoryString(paragraph, HISTORY_ARTICLE_PARAGRAPH_LENGTH))
        .filter((paragraph): paragraph is string => Boolean(paragraph))
        .slice(0, HISTORY_ARTICLE_PARAGRAPH_LIMIT)
    : [];
  const links = metadataRaw && Array.isArray(metadataRaw.links)
    ? (metadataRaw.links as unknown[])
        .map((link) => {
          if (!link || typeof link !== "object") return null;
          const record = link as Record<string, unknown>;
          const label = sanitizeHistoryString(record.label, 140);
          const url =
            typeof record.url === "string" && record.url.trim().length
              ? record.url.trim()
              : null;
          const sourceId =
            typeof record.sourceId === "string" && record.sourceId.trim().length
              ? record.sourceId.trim()
              : null;
          return {
            label: label ?? "Capsule post",
            url,
            sourceId,
          };
        })
        .filter((link): link is CapsuleHistoryArticleLink => Boolean(link))
        .slice(0, HISTORY_ARTICLE_LINK_LIMIT)
    : [];

  return {
    ...block,
    metadata: {
      title: title ?? (paragraphs[0] ?? block.text ?? null),
      paragraphs: paragraphs.length
        ? paragraphs
        : block.text
          ? [block.text]
          : [],
      links,
    },
  };
}

function cloneTimelineEntry(entry: CapsuleHistoryTimelineEntry): CapsuleHistoryTimelineEntry {
  return {
    ...cloneContentBlock(entry),
    label: entry.label,
    detail: entry.detail,
    timestamp: entry.timestamp ?? null,
    postId: entry.postId ?? null,
    permalink: entry.permalink ?? null,
  };
}

function cloneSectionContent(content: CapsuleHistorySectionContent): CapsuleHistorySectionContent {
  return {
    summary: cloneContentBlock(content.summary),
    highlights: content.highlights.map((item) => cloneContentBlock(item)),
    articles: content.articles.map((item) =>
      normalizeArticleBlock(cloneContentBlock(item) as CapsuleHistoryArticle),
    ),
    timeline: content.timeline.map((item) => cloneTimelineEntry(item)),
    nextFocus: content.nextFocus.map((item) => cloneContentBlock(item)),
  };
}

function normalizePinType(value: string | null | undefined): CapsuleHistoryPinnedItemType {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "summary" || normalized === "highlight" || normalized === "timeline") {
    return normalized;
  }
  if (normalized === "next_focus" || normalized === "next-focus") {
    return "next_focus";
  }
  return "highlight";
}

function decorateContentWithPins(
  content: CapsuleHistorySectionContent,
  pins: CapsuleHistoryPin[],
): CapsuleHistorySectionContent {
  if (!pins.length) {
    return cloneSectionContent(content);
  }

  const decorated = cloneSectionContent(content);

  const findHighlight = (pin: CapsuleHistoryPin) => {
    const needle = typeof pin.quote === "string" ? pin.quote.trim().toLowerCase() : "";
    if (!needle && pin.postId) {
      const postSourceId = `post:${pin.postId}`;
      return decorated.highlights.find((block) => block.sourceIds.includes(postSourceId)) ?? null;
    }
    return decorated.highlights.find((block) => block.text.trim().toLowerCase() === needle) ?? null;
  };

  const findNextFocus = (pin: CapsuleHistoryPin) => {
    const needle = typeof pin.quote === "string" ? pin.quote.trim().toLowerCase() : "";
    if (!needle) return null;
    return decorated.nextFocus.find((block) => block.text.trim().toLowerCase() === needle) ?? null;
  };

  const findTimeline = (pin: CapsuleHistoryPin) => {
    if (pin.postId) {
      const matched = decorated.timeline.find((entry) => entry.postId === pin.postId);
      if (matched) return matched;
    }
    const needle = typeof pin.quote === "string" ? pin.quote.trim() : "";
    if (!needle) return null;
    return decorated.timeline.find((entry) => entry.detail.includes(needle)) ?? null;
  };

  pins.forEach((pin) => {
    const type = normalizePinType(pin.type);
    if (type === "summary") {
      decorated.summary.pinned = true;
      decorated.summary.pinId = pin.id;
      return;
    }
    if (type === "highlight") {
      const highlight = findHighlight(pin);
      if (highlight) {
        highlight.pinned = true;
        highlight.pinId = pin.id;
      }
      return;
    }
    if (type === "next_focus") {
      const next = findNextFocus(pin);
      if (next) {
        next.pinned = true;
        next.pinId = pin.id;
      }
      return;
    }
    if (type === "timeline") {
      const timelineEntry = findTimeline(pin);
      if (timelineEntry) {
        timelineEntry.pinned = true;
        timelineEntry.pinId = pin.id;
      }
    }
  });

  return decorated;
}

function convertPinToPinnedItem(pin: CapsuleHistoryPin): CapsuleHistoryPinnedItem {
  const type = normalizePinType(pin.type);
  const sourceRecord =
    pin.source && typeof pin.source === "object" ? (pin.source as Record<string, unknown>) : null;
  const sourceIdValue =
    sourceRecord && typeof sourceRecord.source_id === "string" ? sourceRecord.source_id : null;
  const fallbackSourceId = pin.postId ? `post:${pin.postId}` : null;
  return {
    id: pin.id,
    type,
    period: pin.period,
    postId: pin.postId ?? null,
    quote: typeof pin.quote === "string" ? pin.quote : null,
    rank: Number.isFinite(pin.rank) ? Number(pin.rank) : 0,
    sourceId: sourceIdValue ?? fallbackSourceId,
    createdAt: pin.createdAt ?? null,
    createdBy: pin.createdBy ?? null,
  };
}

function buildSectionCandidates(
  content: CapsuleHistorySectionContent,
  sources: Record<string, CapsuleHistorySource>,
): CapsuleHistoryCandidate[] {
  const seen = new Set<string>();
  const candidates: CapsuleHistoryCandidate[] = [];

  content.timeline.forEach((entry) => {
    const sourceId = entry.sourceIds[0] ?? (entry.postId ? `post:${entry.postId}` : null);
    const source = sourceId ? sources[sourceId] ?? null : null;
    const id = sourceId ?? entry.id;
    if (seen.has(id)) return;
    seen.add(id);
    candidates.push({
      id,
      kind: "post",
      postId: source?.postId ?? entry.postId ?? null,
      quoteId: source?.quoteId ?? null,
      title: source?.label ?? entry.label,
      excerpt: entry.detail ?? entry.text,
      sourceIds: sourceId ? [sourceId] : [],
      createdAt: source?.occurredAt ?? entry.timestamp ?? null,
      authorName: source?.authorName ?? null,
      authorAvatarUrl: source?.authorAvatarUrl ?? null,
      metrics: {
        reactions: Number(source?.metrics.reactions ?? 0) || 0,
        comments: Number(source?.metrics.comments ?? 0) || 0,
        shares: Number(source?.metrics.shares ?? 0) || 0,
      },
      tags: [],
    });
  });

  content.highlights.forEach((block) => {
    if (!block.text || block.text.length < 8) return;
    const candidateId = `highlight:${block.id}`;
    if (seen.has(candidateId)) return;
    seen.add(candidateId);
    const sourceId = block.sourceIds[0] ?? null;
    const source = sourceId ? sources[sourceId] ?? null : null;
    candidates.push({
      id: candidateId,
      kind: "quote",
      postId: source?.postId ?? null,
      quoteId: source?.quoteId ?? null,
      title: source?.label ?? "Highlight",
      excerpt: block.text,
      sourceIds: sourceId ? [sourceId] : [],
      createdAt: source?.occurredAt ?? null,
      authorName: source?.authorName ?? null,
      authorAvatarUrl: source?.authorAvatarUrl ?? null,
      metrics: {
        reactions: Number(source?.metrics.reactions ?? 0) || 0,
        comments: Number(source?.metrics.comments ?? 0) || 0,
        shares: Number(source?.metrics.shares ?? 0) || 0,
      },
      tags: [],
    });
  });

  return candidates;
}

function coercePromptMemory(value: unknown): CapsuleHistoryPromptMemory {
  if (!value || typeof value !== "object") {
    return DEFAULT_PROMPT_MEMORY;
  }
  const record = value as Record<string, unknown>;
  const guidelines = Array.isArray(record.guidelines)
    ? record.guidelines.filter((entry): entry is string => typeof entry === "string")
    : [];
  const mustInclude = Array.isArray(record.mustInclude)
    ? record.mustInclude.filter((entry): entry is string => typeof entry === "string")
    : [];
  const autoLinkTopics = Array.isArray(record.autoLinkTopics)
    ? record.autoLinkTopics.filter((entry): entry is string => typeof entry === "string")
    : [];
  const tone = typeof record.tone === "string" ? record.tone : null;
  return {
    guidelines,
    mustInclude,
    autoLinkTopics,
    tone,
  };
}

function coerceTemplatePresets(value: unknown): CapsuleHistoryTemplatePreset[] {
  if (!Array.isArray(value)) {
    return DEFAULT_HISTORY_TEMPLATE_PRESETS;
  }
  const presets: CapsuleHistoryTemplatePreset[] = [];
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const label = typeof record.label === "string" ? record.label : null;
    if (!id || !label) return;
    presets.push({
      id,
      label,
      description: typeof record.description === "string" ? record.description : null,
      tone: typeof record.tone === "string" ? record.tone : null,
    });
  });
  return presets.length ? presets : DEFAULT_HISTORY_TEMPLATE_PRESETS;
}

function coerceCoverageMeta(value: Record<string, unknown>): CoverageMetaMap {
  const base: CoverageMetaMap = {
    weekly: buildEmptyCoverage(),
    monthly: buildEmptyCoverage(),
    all_time: buildEmptyCoverage(),
  };
  (Object.keys(base) as CapsuleHistoryPeriod[]).forEach((period) => {
    const raw = value?.[period];
    if (!raw || typeof raw !== "object") return;
    const record = raw as Record<string, unknown>;
    const completeness = typeof record.completeness === "number" ? record.completeness : 0;
    const authors = Array.isArray(record.authors)
      ? record.authors
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const data = entry as Record<string, unknown>;
            const id = typeof data.id === "string" ? data.id : null;
            const label = typeof data.label === "string" ? data.label : null;
            if (!id || !label) return null;
            return {
              id,
              label,
              covered: Boolean(data.covered),
              weight: Number(data.weight ?? 0) || 0,
            };
          })
          .filter((item): item is CapsuleHistoryCoverageMetric => item !== null)
      : [];
    const themes = Array.isArray(record.themes)
      ? record.themes
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const data = entry as Record<string, unknown>;
            const id = typeof data.id === "string" ? data.id : null;
            const label = typeof data.label === "string" ? data.label : null;
            if (!id || !label) return null;
            return {
              id,
              label,
              covered: Boolean(data.covered),
              weight: Number(data.weight ?? 0) || 0,
            };
          })
          .filter((item): item is CapsuleHistoryCoverageMetric => item !== null)
      : [];
    const timeSpans = Array.isArray(record.timeSpans)
      ? record.timeSpans
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const data = entry as Record<string, unknown>;
            const id = typeof data.id === "string" ? data.id : null;
            const label = typeof data.label === "string" ? data.label : null;
            if (!id || !label) return null;
            return {
              id,
              label,
              covered: Boolean(data.covered),
              weight: Number(data.weight ?? 0) || 0,
            };
          })
          .filter((item): item is CapsuleHistoryCoverageMetric => item !== null)
      : [];
    base[period] = {
      completeness,
      authors,
      themes,
      timeSpans,
    };
  });
  return base;
}

function composeCapsuleHistorySnapshot(params: {
  capsuleId: string;
  capsuleName: string | null;
  suggested: StoredHistorySnapshot | null;
  published: StoredHistorySnapshot | null;
  coverage: CoverageMetaMap;
  promptMemory: CapsuleHistoryPromptMemory;
  templates: CapsuleHistoryTemplatePreset[];
  sectionSettings: CapsuleHistorySectionSettings[];
  pins: CapsuleHistoryPin[];
  exclusions: CapsuleHistoryExclusion[];
  edits: CapsuleHistoryEdit[];
  topicPages: CapsuleTopicPage[];
  backlinks: CapsuleTopicPageBacklink[];
}): CapsuleHistorySnapshot {
  const periods: CapsuleHistoryPeriod[] = ["weekly", "monthly", "all_time"];
  const sources: Record<string, CapsuleHistorySource> = {};

  const mergeSources = (origin: StoredHistorySnapshot | null) => {
    if (!origin || !origin.sources) return;
    Object.entries(origin.sources).forEach(([sourceId, source]) => {
      if (!sourceId || sources[sourceId]) return;
      sources[sourceId] = source;
    });
  };

  mergeSources(params.suggested);
  mergeSources(params.published);

  const sections: CapsuleHistorySection[] = periods.map((period) => {
    const suggestedSection =
      params.suggested?.sections.find((section) => section.period === period) ?? null;
    const publishedSection =
      params.published?.sections.find((section) => section.period === period) ?? null;
    const settings = params.sectionSettings.find((entry) => entry.period === period) ?? null;
    const pins = params.pins
      .filter((pin) => pin.period === period)
      .slice()
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          (a.createdAt ?? "").localeCompare(b.createdAt ?? "", undefined, { sensitivity: "base" }),
      );
    const exclusions = params.exclusions.filter((entry) => entry.period === period);
    const edits = params.edits.filter((entry) => entry.period === period);

    const decoratedSuggested = suggestedSection
      ? decorateContentWithPins(suggestedSection.content, pins)
      : decorateContentWithPins(
        {
          summary: makeContentBlock({
            period,
            kind: "summary",
            index: 0,
            text: "No updates captured for this period yet.",
            seed: `${period}-empty`,
          }),
          highlights: [],
          articles: [],
          timeline: [],
          nextFocus: [],
        },
        pins,
      );

    const decoratedPublished = publishedSection
      ? decorateContentWithPins(publishedSection.content, pins)
      : null;

    const pinnedItems = pins.map(convertPinToPinnedItem);
    const coverage = params.coverage[period] ?? buildEmptyCoverage();
    const editorNotes = settings?.editorNotes ?? null;
    const excludedPostIds = Array.from(
      new Set([
        ...(settings?.excludedPostIds ?? []),
        ...exclusions.map((entry) => entry.postId),
      ]),
    );
    const versions: CapsuleHistoryVersion[] = edits.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      editorId: entry.editorId,
      editorName: null,
      changeType: entry.changeType,
      reason: entry.reason,
    }));
    const lastEdited = edits[0] ?? null;
    const candidates = buildSectionCandidates(decoratedSuggested, sources);

    const postCount = suggestedSection?.postCount ?? publishedSection?.postCount ?? 0;
    const timeframe =
      suggestedSection?.timeframe ?? publishedSection?.timeframe ?? { start: null, end: null };
    const title = suggestedSection?.title ?? publishedSection?.title ?? period.toUpperCase();
    return {
      period,
      title,
      timeframe,
      postCount,
      suggested: decoratedSuggested,
      published: decoratedPublished,
      editorNotes,
      excludedPostIds,
      coverage,
      candidates,
      pinned: pinnedItems,
      versions,
      discussionThreadId: settings?.discussionThreadId ?? null,
      lastEditedAt: lastEdited?.createdAt ?? null,
      lastEditedBy: lastEdited?.editorId ?? null,
      templateId: settings?.templateId ?? null,
      toneRecipeId: settings?.toneRecipeId ?? null,
    };
  });

  return {
    capsuleId: params.capsuleId,
    capsuleName: params.capsuleName,
    suggestedGeneratedAt: params.suggested?.generatedAt ?? new Date().toISOString(),
    publishedGeneratedAt: params.published?.generatedAt ?? null,
    sections,
    sources,
    promptMemory: params.promptMemory,
    templates: params.templates,
  };
}

function coerceStoredSnapshot(value: Record<string, unknown> | null): StoredHistorySnapshot | null {
  if (!value) return null;
  const record = value as Record<string, unknown>;
  const sectionsRaw = Array.isArray(record.sections) ? record.sections : [];
  const sections: StoredHistorySection[] = [];

  sectionsRaw.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const period = normalizeHistoryPeriod(raw.period);
    if (!period) return;
    const title = typeof raw.title === "string" ? raw.title : period.toUpperCase();
    const timeframeRaw = raw.timeframe;
    const timeframe =
      timeframeRaw && typeof timeframeRaw === "object"
        ? {
            start:
              typeof (timeframeRaw as Record<string, unknown>).start === "string"
                ? ((timeframeRaw as Record<string, unknown>).start as string)
                : null,
            end:
              typeof (timeframeRaw as Record<string, unknown>).end === "string"
                ? ((timeframeRaw as Record<string, unknown>).end as string)
                : null,
          }
        : { start: null, end: null };
    const postCount = Number(raw.postCount ?? 0) || 0;
    const isEmpty = Boolean(raw.isEmpty);
    const contentRaw = raw.content;

    const coerceBlock = (blockValue: unknown): CapsuleHistoryContentBlock => {
      if (!blockValue || typeof blockValue !== "object") {
        return makeContentBlock({
          period,
          kind: "summary",
          index: 0,
          text: "",
          seed: `${period}-missing`,
        });
      }
      return cloneContentBlock(blockValue as CapsuleHistoryContentBlock);
    };

    const coerceBlockArray = (value: unknown[]): CapsuleHistoryContentBlock[] =>
      value.map((item) => cloneContentBlock(item as CapsuleHistoryContentBlock));

    const coerceArticleArray = (value: unknown[]): CapsuleHistoryArticle[] =>
      value.map((item) =>
        normalizeArticleBlock(cloneContentBlock(item as CapsuleHistoryContentBlock) as CapsuleHistoryArticle),
      );

    const coerceTimelineArray = (value: unknown[]): CapsuleHistoryTimelineEntry[] =>
      value.map((item) => cloneTimelineEntry(item as CapsuleHistoryTimelineEntry));

    const content: CapsuleHistorySectionContent =
      contentRaw && typeof contentRaw === "object"
        ? {
            summary: coerceBlock((contentRaw as Record<string, unknown>).summary),
            highlights: Array.isArray((contentRaw as Record<string, unknown>).highlights)
              ? coerceBlockArray((contentRaw as Record<string, unknown>).highlights as unknown[])
              : [],
            articles: Array.isArray((contentRaw as Record<string, unknown>).articles)
              ? coerceArticleArray((contentRaw as Record<string, unknown>).articles as unknown[])
              : [],
            timeline: Array.isArray((contentRaw as Record<string, unknown>).timeline)
              ? coerceTimelineArray((contentRaw as Record<string, unknown>).timeline as unknown[])
              : [],
            nextFocus: Array.isArray((contentRaw as Record<string, unknown>).nextFocus)
              ? coerceBlockArray((contentRaw as Record<string, unknown>).nextFocus as unknown[])
              : [],
          }
        : {
            summary: makeContentBlock({
              period,
              kind: "summary",
              index: 0,
              text: "",
              seed: `${period}-empty`,
            }),
            highlights: [],
            articles: [],
            timeline: [],
            nextFocus: [],
          };

    sections.push({
      period,
      title,
      timeframe,
      postCount,
      isEmpty,
      content,
    });
  });

  if (!sections.length) return null;
  const generatedAt =
    typeof record.generatedAt === "string"
      ? (record.generatedAt as string)
      : typeof record.generated_at === "string"
        ? (record.generated_at as string)
        : new Date().toISOString();
  const capsuleId = typeof record.capsuleId === "string" ? (record.capsuleId as string) : "";
  const capsuleName =
    typeof record.capsuleName === "string" ? (record.capsuleName as string) : null;
  const sources =
    record.sources && typeof record.sources === "object"
      ? (record.sources as Record<string, CapsuleHistorySource>)
      : {};

  return {
    capsuleId,
    capsuleName,
    generatedAt,
    sections,
    sources,
  };
}

export async function publishCapsuleHistorySection(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod;
  content: CapsuleHistorySectionContent;
  title?: string;
  timeframe?: { start: string | null; end: string | null };
  postCount?: number;
  notes?: string | null;
  templateId?: string | null;
  toneRecipeId?: string | null;
  reason?: string | null;
  promptOverrides?: Record<string, unknown> | null;
  coverage?: CapsuleHistoryCoverage | null;
}): Promise<CapsuleHistorySnapshot> {
  const { capsule, ownerId } = await requireCapsuleOwnership(params.capsuleId, params.editorId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.history.publish: capsule has invalid identifier");
  }

  const persisted = await getCapsuleHistorySnapshotRecord(capsuleIdValue);
  const promptMemoryRecord = persisted
    ? coercePromptMemory(persisted.promptMemory)
    : DEFAULT_PROMPT_MEMORY;
  const templateRecord = persisted
    ? coerceTemplatePresets(persisted.templatePresets)
    : DEFAULT_HISTORY_TEMPLATE_PRESETS;
  let coverageMeta = persisted
    ? coerceCoverageMeta(persisted.coverageMeta ?? {})
    : {
        weekly: buildEmptyCoverage(),
        monthly: buildEmptyCoverage(),
        all_time: buildEmptyCoverage(),
      };

  const suggestedStored = persisted ? coerceStoredSnapshot(persisted.suggestedSnapshot) : null;
  let publishedStored = persisted ? coerceStoredSnapshot(persisted.publishedSnapshot ?? null) : null;

  const capsuleName = normalizeOptionalString(capsule.name ?? null);
  if (!publishedStored) {
    const baseSections = suggestedStored
      ? suggestedStored.sections.map((section) => ({
          ...section,
          content: cloneSectionContent(section.content),
        }))
      : [];
    publishedStored = {
      capsuleId: capsuleIdValue,
      capsuleName,
      generatedAt: new Date().toISOString(),
      sections: baseSections,
      sources: suggestedStored?.sources ?? {},
    };
  }

  const suggestedSection = suggestedStored?.sections.find(
    (section) => section.period === params.period,
  );
  const title = params.title ?? suggestedSection?.title ?? params.period.toUpperCase();
  const timeframe = params.timeframe ?? suggestedSection?.timeframe ?? { start: null, end: null };
  const postCount =
    typeof params.postCount === "number"
      ? params.postCount
      : suggestedSection?.postCount ?? 0;
  const sectionContent = cloneSectionContent(params.content);
  const sectionData: StoredHistorySection = {
    period: params.period,
    title,
    timeframe,
    postCount,
    isEmpty: sectionContent.timeline.length === 0 && sectionContent.highlights.length === 0,
    content: sectionContent,
  };

  const sectionIndex = publishedStored.sections.findIndex(
    (section) => section.period === params.period,
  );
  if (sectionIndex >= 0) {
    publishedStored.sections[sectionIndex] = sectionData;
  } else {
    publishedStored.sections.push(sectionData);
  }
  publishedStored.generatedAt = new Date().toISOString();

  const updatedCoverage = params.coverage ?? coverageMeta[params.period] ?? buildEmptyCoverage();
  coverageMeta = {
    ...coverageMeta,
    [params.period]: updatedCoverage,
  } as CoverageMetaMap;

  const publishedPeriodHashes = Object.fromEntries(
    publishedStored.sections.map((section) => [
      section.period,
      computeSectionContentHash(section.content),
    ]),
  );
  const publishedLatestTimelineAt = extractLatestTimelineTimestampFromStored(publishedStored);

  await updateCapsuleHistoryPublishedSnapshotRecord({
    capsuleId: capsuleIdValue,
    publishedSnapshot: publishedStored as unknown as Record<string, unknown>,
    publishedGeneratedAt: publishedStored.generatedAt,
    publishedLatestPostAt: publishedLatestTimelineAt ?? persisted?.publishedLatestPostAt ?? null,
    publishedPeriodHashes,
    editorId: params.editorId,
    editorReason: params.reason ?? null,
  });

  const existingSettings = await listCapsuleHistorySectionSettings(capsuleIdValue);
  const currentSettings =
    existingSettings.find((entry) => entry.period === params.period) ?? null;
  await upsertCapsuleHistorySectionSettingsRecord({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorNotes: params.notes ?? currentSettings?.editorNotes ?? null,
    excludedPostIds: currentSettings?.excludedPostIds ?? [],
    templateId: params.templateId ?? currentSettings?.templateId ?? null,
    toneRecipeId: params.toneRecipeId ?? currentSettings?.toneRecipeId ?? null,
    promptOverrides: params.promptOverrides ?? currentSettings?.promptOverrides ?? {},
    coverageSnapshot: updatedCoverage as unknown as Record<string, unknown>,
    discussionThreadId: currentSettings?.discussionThreadId ?? null,
    metadata: {
      ...(currentSettings?.metadata ?? {}),
      lastPublishedAt: new Date().toISOString(),
    },
    updatedBy: params.editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorId: params.editorId,
    changeType: "publish_section",
    reason: params.reason ?? null,
    payload: {
      title,
      timeframe,
      postCount,
    },
    snapshot: JSON.parse(JSON.stringify(sectionData)) as Record<string, unknown>,
  });

  await updateCapsuleHistoryPromptMemory({
    capsuleId: capsuleIdValue,
    promptMemory: promptMemoryRecord as unknown as Record<string, unknown>,
    templates: templateRecord as unknown as Array<Record<string, unknown>>,
    coverageMeta: coverageMeta as unknown as Record<string, unknown>,
  });

  invalidateCapsuleHistoryCache(capsuleIdValue);
  return getCapsuleHistory(params.capsuleId, ownerId, { forceRefresh: false });
}

export async function addCapsuleHistoryPin(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod;
  type: string;
  postId?: string | null;
  quote?: string | null;
  source?: Record<string, unknown> | null;
  rank?: number | null;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const { ownerId } = await requireCapsuleOwnership(params.capsuleId, params.editorId);
  const capsuleIdValue = normalizeId(params.capsuleId);
  if (!capsuleIdValue) {
    throw new Error("capsules.history.pins.add: invalid capsule identifier");
  }

  const insertedPin = await insertCapsuleHistoryPin({
    capsuleId: capsuleIdValue,
    period: params.period,
    type: normalizePinType(params.type),
    postId: params.postId ?? null,
    quote: params.quote ?? null,
    source: params.source ?? {},
    rank: params.rank ?? null,
    createdBy: params.editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorId: params.editorId,
    changeType: "pin_add",
    reason: params.reason ?? null,
    payload: {
      pinId: insertedPin.id,
      type: insertedPin.type,
      postId: insertedPin.postId,
      quote: insertedPin.quote,
      rank: insertedPin.rank,
    },
  });

  invalidateCapsuleHistoryCache(capsuleIdValue);
  return getCapsuleHistory(params.capsuleId, ownerId, { forceRefresh: false });
}

export async function removeCapsuleHistoryPin(params: {
  capsuleId: string;
  editorId: string;
  pinId: string;
  reason?: string | null;
  period?: CapsuleHistoryPeriod;
}): Promise<CapsuleHistorySnapshot> {
  const { ownerId } = await requireCapsuleOwnership(params.capsuleId, params.editorId);
  const capsuleIdValue = normalizeId(params.capsuleId);
  if (!capsuleIdValue) {
    throw new Error("capsules.history.pins.remove: invalid capsule identifier");
  }

  const removed = await deleteCapsuleHistoryPin({
    capsuleId: capsuleIdValue,
    pinId: params.pinId,
  });
  if (!removed) {
    throw new CapsuleMembershipError("not_found", "Pin not found.", 404);
  }

  await insertCapsuleHistoryEdit({
    capsuleId: capsuleIdValue,
    period: params.period ?? "weekly",
    editorId: params.editorId,
    changeType: "pin_remove",
    reason: params.reason ?? null,
    payload: {
      pinId: params.pinId,
    },
  });

  invalidateCapsuleHistoryCache(capsuleIdValue);
  return getCapsuleHistory(params.capsuleId, ownerId, { forceRefresh: false });
}

export async function addCapsuleHistoryExclusion(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod;
  postId: string;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const { ownerId } = await requireCapsuleOwnership(params.capsuleId, params.editorId);
  const capsuleIdValue = normalizeId(params.capsuleId);
  const postId = normalizeId(params.postId) ?? params.postId;
  if (!capsuleIdValue || !postId) {
    throw new Error("capsules.history.exclusions.add: invalid parameters");
  }

  await insertCapsuleHistoryExclusion({
    capsuleId: capsuleIdValue,
    period: params.period,
    postId,
    createdBy: params.editorId,
  });

  const settings = await listCapsuleHistorySectionSettings(capsuleIdValue);
  const current = settings.find((entry) => entry.period === params.period);
  const excluded = Array.from(new Set([...(current?.excludedPostIds ?? []), postId]));

  await upsertCapsuleHistorySectionSettingsRecord({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorNotes: current?.editorNotes ?? null,
    excludedPostIds: excluded,
    templateId: current?.templateId ?? null,
    toneRecipeId: current?.toneRecipeId ?? null,
    promptOverrides: current?.promptOverrides ?? {},
    coverageSnapshot: current?.coverageSnapshot ?? {},
    discussionThreadId: current?.discussionThreadId ?? null,
    metadata: current?.metadata ?? {},
    updatedBy: params.editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorId: params.editorId,
    changeType: "exclusion_add",
    reason: params.reason ?? null,
    payload: {
      postId,
    },
  });

  invalidateCapsuleHistoryCache(capsuleIdValue);
  return getCapsuleHistory(params.capsuleId, ownerId, { forceRefresh: false });
}

export async function removeCapsuleHistoryExclusion(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod;
  postId: string;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const { ownerId } = await requireCapsuleOwnership(params.capsuleId, params.editorId);
  const capsuleIdValue = normalizeId(params.capsuleId);
  const postId = normalizeId(params.postId) ?? params.postId;
  if (!capsuleIdValue || !postId) {
    throw new Error("capsules.history.exclusions.remove: invalid parameters");
  }

  await deleteCapsuleHistoryExclusion({
    capsuleId: capsuleIdValue,
    period: params.period,
    postId,
  });

  const settings = await listCapsuleHistorySectionSettings(capsuleIdValue);
  const current = settings.find((entry) => entry.period === params.period);
  const remaining = (current?.excludedPostIds ?? []).filter((value) => value !== postId);

  await upsertCapsuleHistorySectionSettingsRecord({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorNotes: current?.editorNotes ?? null,
    excludedPostIds: remaining,
    templateId: current?.templateId ?? null,
    toneRecipeId: current?.toneRecipeId ?? null,
    promptOverrides: current?.promptOverrides ?? {},
    coverageSnapshot: current?.coverageSnapshot ?? {},
    discussionThreadId: current?.discussionThreadId ?? null,
    metadata: current?.metadata ?? {},
    updatedBy: params.editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorId: params.editorId,
    changeType: "exclusion_remove",
    reason: params.reason ?? null,
    payload: {
      postId,
    },
  });

  invalidateCapsuleHistoryCache(capsuleIdValue);
  return getCapsuleHistory(params.capsuleId, ownerId, { forceRefresh: false });
}

export async function updateCapsuleHistorySectionSettings(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod;
  notes?: string | null;
  templateId?: string | null;
  toneRecipeId?: string | null;
  promptOverrides?: Record<string, unknown> | null;
  discussionThreadId?: string | null;
  coverage?: CapsuleHistoryCoverage | null;
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const { ownerId } = await requireCapsuleOwnership(params.capsuleId, params.editorId);
  const capsuleIdValue = normalizeId(params.capsuleId);
  if (!capsuleIdValue) {
    throw new Error("capsules.history.settings.update: invalid capsule identifier");
  }

  const settings = await listCapsuleHistorySectionSettings(capsuleIdValue);
  const current = settings.find((entry) => entry.period === params.period) ?? null;

  await upsertCapsuleHistorySectionSettingsRecord({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorNotes: params.notes ?? current?.editorNotes ?? null,
    excludedPostIds: current?.excludedPostIds ?? [],
    templateId: params.templateId ?? current?.templateId ?? null,
    toneRecipeId: params.toneRecipeId ?? current?.toneRecipeId ?? null,
    promptOverrides: params.promptOverrides ?? current?.promptOverrides ?? {},
    coverageSnapshot: params.coverage
      ? (params.coverage as unknown as Record<string, unknown>)
      : current?.coverageSnapshot ?? {},
    discussionThreadId: params.discussionThreadId ?? current?.discussionThreadId ?? null,
    metadata: current?.metadata ?? {},
    updatedBy: params.editorId,
  });

  await insertCapsuleHistoryEdit({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorId: params.editorId,
    changeType: "settings_update",
    reason: params.reason ?? null,
    payload: {
      notes: params.notes ?? null,
      templateId: params.templateId ?? null,
      toneRecipeId: params.toneRecipeId ?? null,
    },
  });

  if (params.coverage) {
    const persisted = await getCapsuleHistorySnapshotRecord(capsuleIdValue);
    const promptMemoryRecord = persisted
      ? coercePromptMemory(persisted.promptMemory)
      : DEFAULT_PROMPT_MEMORY;
    const templateRecord = persisted
      ? coerceTemplatePresets(persisted.templatePresets)
      : DEFAULT_HISTORY_TEMPLATE_PRESETS;
    const coverageMeta = persisted
      ? coerceCoverageMeta(persisted.coverageMeta ?? {})
      : {
          weekly: buildEmptyCoverage(),
          monthly: buildEmptyCoverage(),
          all_time: buildEmptyCoverage(),
        };
    coverageMeta[params.period] = params.coverage;
    await updateCapsuleHistoryPromptMemory({
      capsuleId: capsuleIdValue,
      promptMemory: promptMemoryRecord as unknown as Record<string, unknown>,
      templates: templateRecord as unknown as Array<Record<string, unknown>>,
      coverageMeta: coverageMeta as unknown as Record<string, unknown>,
    });
  }

  invalidateCapsuleHistoryCache(capsuleIdValue);
  return getCapsuleHistory(params.capsuleId, ownerId, { forceRefresh: false });
}

export async function updateCapsuleHistoryPromptSettings(params: {
  capsuleId: string;
  editorId: string;
  promptMemory: CapsuleHistoryPromptMemory;
  templates?: CapsuleHistoryTemplatePreset[];
  reason?: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const { ownerId } = await requireCapsuleOwnership(params.capsuleId, params.editorId);
  const capsuleIdValue = normalizeId(params.capsuleId);
  if (!capsuleIdValue) {
    throw new Error("capsules.history.prompt.update: invalid capsule identifier");
  }

  const persisted = await getCapsuleHistorySnapshotRecord(capsuleIdValue);
  const coverageMeta = persisted
    ? coerceCoverageMeta(persisted.coverageMeta ?? {})
    : {
        weekly: buildEmptyCoverage(),
        monthly: buildEmptyCoverage(),
        all_time: buildEmptyCoverage(),
      };

  await updateCapsuleHistoryPromptMemory({
    capsuleId: capsuleIdValue,
    promptMemory: params.promptMemory as unknown as Record<string, unknown>,
    templates: params.templates
      ? (params.templates as unknown as Array<Record<string, unknown>>)
      : persisted?.templatePresets ?? DEFAULT_HISTORY_TEMPLATE_PRESETS,
    coverageMeta: coverageMeta as unknown as Record<string, unknown>,
  });

  await insertCapsuleHistoryEdit({
    capsuleId: capsuleIdValue,
    period: "weekly",
    editorId: params.editorId,
    changeType: "prompt_update",
    reason: params.reason ?? null,
    payload: {
      promptMemory: params.promptMemory,
    },
  });

  invalidateCapsuleHistoryCache(capsuleIdValue);
  return getCapsuleHistory(params.capsuleId, ownerId, { forceRefresh: false });
}

export async function refineCapsuleHistorySection(params: {
  capsuleId: string;
  editorId: string;
  period: CapsuleHistoryPeriod;
  instructions?: string | null;
}): Promise<{ section: CapsuleHistorySectionContent | null; snapshot: CapsuleHistorySnapshot }> {
  const { ownerId } = await requireCapsuleOwnership(params.capsuleId, params.editorId);
  const capsuleIdValue = normalizeId(params.capsuleId);
  if (!capsuleIdValue) {
    throw new Error("capsules.history.refine: invalid capsule identifier");
  }

  const snapshot = await getCapsuleHistory(params.capsuleId, ownerId, { forceRefresh: true });
  const section =
    snapshot.sections.find((item) => item.period === params.period)?.suggested ?? null;

  await insertCapsuleHistoryEdit({
    capsuleId: capsuleIdValue,
    period: params.period,
    editorId: params.editorId,
    changeType: "refine_section",
    reason: params.instructions ?? null,
    payload: {},
  });

  return { section, snapshot };
}
function computeTimeframeHash(timeframe: CapsuleHistoryTimeframe): string {
  const hasher = createHash("sha256");
  hasher.update(timeframe.period);
  hasher.update(timeframe.start ?? "");
  hasher.update(timeframe.end ?? "");
  timeframe.posts.forEach((post) => {
    hasher.update(post.id);
    hasher.update(post.createdAt ?? "");
    hasher.update(post.user ?? "");
    hasher.update(post.content);
  });
  return hasher.digest("hex");
}

function buildPeriodHashMap(timeframes: CapsuleHistoryTimeframe[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  timeframes.forEach((timeframe) => {
    hashes[timeframe.period] = computeTimeframeHash(timeframe);
  });
  return hashes;
}

function computeSectionContentHash(content: CapsuleHistorySectionContent): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

async function generateCapsuleHistoryFromModel(input: {
  capsuleId: string;
  capsuleName: string | null;
  timeframes: CapsuleHistoryTimeframe[];
  posts: CapsuleHistoryPost[];
  nowIso: string;
}): Promise<{ generatedAt: string | null; sections: HistoryModelSection[] }> {
  const weekly = input.timeframes.find((tf) => tf.period === "weekly") ?? null;
  const monthly = input.timeframes.find((tf) => tf.period === "monthly") ?? null;
  const weeklyIds = new Set((weekly?.posts ?? []).map((post) => post.id));
  const monthlyIds = new Set((monthly?.posts ?? []).map((post) => post.id));
  const postsForModel = input.posts.slice(0, HISTORY_MODEL_POST_LIMIT).map((post) => ({
    id: post.id,
    created_at: post.createdAt,
    author: post.user,
    kind: post.kind,
    has_media: post.hasMedia,
    summary: post.content,
    in_weekly: weeklyIds.has(post.id),
    in_monthly: monthlyIds.has(post.id),
  }));

  const payload = {
    capsule: {
      id: input.capsuleId,
      name: input.capsuleName,
    },
    generated_at: input.nowIso,
    boundaries: input.timeframes.reduce<
      Record<string, { start: string | null; end: string | null; post_count: number }>
    >((acc, timeframe) => {
      acc[timeframe.period] = {
        start: timeframe.start,
        end: timeframe.end,
        post_count: timeframe.posts.length,
      };
      return acc;
    }, {}),
    posts: postsForModel,
  };

  const systemMessage = {
    role: "system",
    content:
      "You are Capsules AI, maintaining a capsule history wiki. For each timeframe (weekly, monthly, all_time) produce concise factual recaps based only on the provided posts and return JSON that matches the schema. Summaries may be up to three sentences. Highlights must be short bullet-style points (<=140 chars) referencing actual activity. Articles should read like short features with 1-2 paragraphs, cite real posts, and include a sources list that prefers provided post_id values (fallback to explicit URLs only when necessary). Timeline entries should mention specific updates and include the related post_id when the post exists in the provided list. Provide 1-3 actionable next_focus suggestions when there is activity. If a timeframe has zero posts, set empty=true, give a summary such as 'No new activity this period.', craft a single article that encourages future participation, and provide one suggestion encouraging participation. Never invent names or events and do not include editing instructions.",
  };

  const userMessage = {
    role: "user",
    content: JSON.stringify(payload),
  };

  const { content } = await callOpenAIChat(
    [systemMessage, userMessage],
    CAPSULE_HISTORY_RESPONSE_SCHEMA,
    { temperature: 0.4 },
  );

  const parsed = extractJSON<Record<string, unknown>>(content) ?? {};
  const sectionsRaw = Array.isArray(parsed.sections)
    ? (parsed.sections as HistoryModelSection[])
    : [];
  const generatedAt =
    typeof parsed.generated_at === "string" && parsed.generated_at.trim().length
      ? parsed.generated_at.trim()
      : null;
  const sanitized = sectionsRaw.filter(
    (entry): entry is HistoryModelSection => entry && typeof entry === "object",
  );
  return {
    generatedAt,
    sections: sanitized,
  };
}

function buildHistorySections(
  capsuleId: string,
  timeframes: CapsuleHistoryTimeframe[],
  modelSections: HistoryModelSection[] | null,
  sources: Record<string, CapsuleHistorySource>,
): { sections: StoredHistorySection[]; coverage: CoverageMetaMap } {
  const coverage: CoverageMetaMap = {
    weekly: buildEmptyCoverage(),
    monthly: buildEmptyCoverage(),
    all_time: buildEmptyCoverage(),
  };

  const sections = timeframes.map((timeframe) => {
    const period = timeframe.period;
    const posts = timeframe.posts;
    const postLookup = new Map<string, CapsuleHistoryPost>();
    posts.forEach((post) => {
      postLookup.set(post.id, post);
      ensurePostSource(sources, capsuleId, post);
    });

    const match =
      modelSections?.find(
        (section) => normalizeHistoryPeriod(section.period) === timeframe.period,
      ) ?? null;

    const title = sanitizeHistoryString(match?.title, 80) ?? timeframe.label;
    const summaryText =
      sanitizeHistoryString(match?.summary, HISTORY_SUMMARY_LIMIT) ??
      buildFallbackSummary(timeframe);

    const summaryBlock = makeContentBlock({
      period,
      kind: "summary",
      index: 0,
      text: summaryText,
      seed: `${period}-summary`,
    });

    const modelHighlights = sanitizeHistoryArray(match?.highlights, HISTORY_HIGHLIGHT_LIMIT);
    const resolvedHighlights = modelHighlights.length
      ? modelHighlights
      : sanitizeHistoryArray(buildFallbackHighlights(timeframe), HISTORY_HIGHLIGHT_LIMIT);
    const highlightBlocks = resolvedHighlights.map((text, index) =>
      makeContentBlock({
        period,
        kind: "highlight",
        index,
        text,
        seed: `${period}-highlight-${index}`,
      }),
    );

    const modelArticles = coerceHistoryArticles(
      capsuleId,
      period,
      timeframe,
      match?.articles,
      sources,
      postLookup,
    );
    const resolvedArticles = modelArticles.length
      ? modelArticles
      : buildFallbackArticles(capsuleId, timeframe, summaryText, resolvedHighlights, sources);

    const modelNextFocus = sanitizeHistoryArray(match?.next_focus, HISTORY_NEXT_FOCUS_LIMIT, 160);
    const resolvedNextFocus = modelNextFocus.length
      ? modelNextFocus
      : sanitizeHistoryArray(buildFallbackNextFocus(timeframe), HISTORY_NEXT_FOCUS_LIMIT, 160);
    const nextFocusBlocks = resolvedNextFocus.map((text, index) =>
      makeContentBlock({
        period,
        kind: "next",
        index,
        text,
        seed: `${period}-next-${index}`,
      }),
    );

    const modelTimeline = coerceTimelineEntries(
      match?.timeline,
      capsuleId,
      period,
      sources,
      postLookup,
    );
    const resolvedTimeline = modelTimeline.length
      ? modelTimeline
      : buildFallbackTimelineEntries(capsuleId, timeframe, sources);

    const isEmpty = Boolean(match?.empty) || timeframe.posts.length === 0;

    const summarySourceSet = new Set<string>(summaryBlock.sourceIds);
    resolvedTimeline.forEach((entry) => {
      entry.sourceIds.forEach((sourceId) => {
        if (sourceId) summarySourceSet.add(sourceId);
      });
    });
    posts.slice(0, HISTORY_ARTICLE_LINK_LIMIT).forEach((post) => {
      const sourceId = ensurePostSource(sources, capsuleId, post);
      summarySourceSet.add(sourceId);
    });
    summaryBlock.sourceIds = Array.from(summarySourceSet);

    const content: CapsuleHistorySectionContent = {
      summary: summaryBlock,
      highlights: highlightBlocks,
      articles: resolvedArticles,
      timeline: resolvedTimeline,
      nextFocus: nextFocusBlocks,
    };

    const section: StoredHistorySection = {
      period,
      title,
      timeframe: { start: timeframe.start, end: timeframe.end },
      postCount: posts.length,
      isEmpty,
      content,
    };

    coverage[period] = computeCoverageMetrics(timeframe, content);
    return section;
  });

  return { sections, coverage };
}

async function buildCapsuleHistorySnapshot({
  capsuleId,
  capsuleName,
}: {
  capsuleId: string;
  capsuleName: string | null;
}): Promise<{
  suggestedSnapshot: StoredHistorySnapshot;
  suggestedPeriodHashes: Record<string, string>;
  coverage: CoverageMetaMap;
  latestTimelineAt: string | null;
}> {
  const posts = await loadCapsuleHistoryPosts(capsuleId, HISTORY_POST_LIMIT);
  const now = new Date();
  const nowIso = now.toISOString();
  const timeframes = buildHistoryTimeframes(posts, now);
  const periodHashes = buildPeriodHashMap(timeframes);
  const sources: Record<string, CapsuleHistorySource> = {};

  if (!posts.length) {
    const sections = timeframes.map<StoredHistorySection>((timeframe) => {
      const summaryText = buildFallbackSummary(timeframe);
      const summaryBlock = makeContentBlock({
        period: timeframe.period,
        kind: "summary",
        index: 0,
        text: summaryText,
        seed: `${timeframe.period}-summary`,
      });
      const fallbackHighlights = sanitizeHistoryArray(
        buildFallbackHighlights(timeframe),
        HISTORY_HIGHLIGHT_LIMIT,
      );
      const highlightBlocks = fallbackHighlights.map((text, index) =>
        makeContentBlock({
          period: timeframe.period,
          kind: "highlight",
          index,
          text,
          seed: `${timeframe.period}-highlight-${index}`,
        }),
      );
      const articleBlocks = buildFallbackArticles(
        capsuleId,
        timeframe,
        summaryText,
        fallbackHighlights,
        sources,
      );
      const summarySourceIds = new Set<string>();
      timeframe.posts.slice(0, HISTORY_ARTICLE_LINK_LIMIT).forEach((post) => {
        const sourceId = ensurePostSource(sources, capsuleId, post);
        summarySourceIds.add(sourceId);
      });
      summaryBlock.sourceIds = Array.from(summarySourceIds);
      const nextFocusBlocks = sanitizeHistoryArray(
        buildFallbackNextFocus(timeframe),
        HISTORY_NEXT_FOCUS_LIMIT,
        160,
      ).map((text, index) =>
        makeContentBlock({
          period: timeframe.period,
          kind: "next",
          index,
          text,
          seed: `${timeframe.period}-next-${index}`,
        }),
      );
      return {
        period: timeframe.period,
        title: timeframe.label,
        timeframe: { start: timeframe.start, end: timeframe.end },
        postCount: 0,
        isEmpty: true,
        content: {
          summary: summaryBlock,
          highlights: highlightBlocks,
          articles: articleBlocks,
          timeline: [],
          nextFocus: nextFocusBlocks,
        },
      };
    });

    const coverage: CoverageMetaMap = {
      weekly: buildEmptyCoverage(),
      monthly: buildEmptyCoverage(),
      all_time: buildEmptyCoverage(),
    };

    return {
      suggestedSnapshot: {
        capsuleId,
        capsuleName,
        generatedAt: nowIso,
        sections,
        sources,
      },
      suggestedPeriodHashes: periodHashes,
      coverage,
      latestTimelineAt: null,
    };
  }

  let modelSections: HistoryModelSection[] | null = null;
  let generatedAt = nowIso;
  try {
    const model = await generateCapsuleHistoryFromModel({
      capsuleId,
      capsuleName,
      timeframes,
      posts,
      nowIso,
    });
    modelSections = model.sections;
    if (model.generatedAt) {
      generatedAt = model.generatedAt;
    }
  } catch (error) {
    if (error instanceof AIConfigError) {
      throw error;
    }
    console.error("capsules.history.generate", error);
  }

  const { sections, coverage } = buildHistorySections(
    capsuleId,
    timeframes,
    modelSections,
    sources,
  );
  const snapshot: StoredHistorySnapshot = {
    capsuleId,
    capsuleName,
    generatedAt,
    sections,
    sources,
  };
  return {
    suggestedSnapshot: snapshot,
    suggestedPeriodHashes: periodHashes,
    coverage,
    latestTimelineAt: extractLatestTimelineTimestampFromStored(snapshot),
  };
}

export async function getCapsuleHistory(
  capsuleId: string,
  _viewerId: string | null | undefined,
  options: { forceRefresh?: boolean } = {},
): Promise<CapsuleHistorySnapshot> {
  const { capsule } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.history: capsule has invalid identifier");
  }

  const activity = await getCapsuleHistoryActivity(capsuleIdValue);

  if (!options.forceRefresh) {
    const cachedEntry = getCachedCapsuleHistory(capsuleIdValue);
    if (
      cachedEntry &&
      !historySnapshotIsStale({
        suggestedGeneratedAtMs: cachedEntry.suggestedGeneratedAtMs,
        storedLatestPostAt: cachedEntry.latestPostAt,
        activityLatestPostAt: activity.latestPostAt,
      })
    ) {
      return cachedEntry.snapshot;
    }
  }

  let persisted = await getCapsuleHistorySnapshotRecord(capsuleIdValue);
  let promptMemory = coercePromptMemory(persisted?.promptMemory ?? DEFAULT_PROMPT_MEMORY);
  let templates = coerceTemplatePresets(
    persisted?.templatePresets ?? DEFAULT_HISTORY_TEMPLATE_PRESETS,
  );
  let coverageMeta = persisted
    ? coerceCoverageMeta(persisted.coverageMeta ?? {})
    : {
        weekly: buildEmptyCoverage(),
        monthly: buildEmptyCoverage(),
        all_time: buildEmptyCoverage(),
      };
  let suggestedSnapshot = persisted ? coerceStoredSnapshot(persisted.suggestedSnapshot) : null;
  let publishedSnapshot = persisted ? coerceStoredSnapshot(persisted.publishedSnapshot ?? null) : null;
  let suggestedPeriodHashes = persisted?.suggestedPeriodHashes ?? {};
  let latestTimelineAt = persisted?.suggestedLatestPostAt ?? null;

  let shouldRefresh = Boolean(options.forceRefresh || !persisted || !suggestedSnapshot);
  if (!shouldRefresh && persisted) {
    shouldRefresh = historySnapshotIsStale({
      suggestedGeneratedAtMs: toTimestamp(persisted.suggestedGeneratedAt) ?? Date.now(),
      storedLatestPostAt: persisted.suggestedLatestPostAt,
      activityLatestPostAt: activity.latestPostAt,
    });
  }

  if (shouldRefresh) {
    const generated = await buildCapsuleHistorySnapshot({
      capsuleId: capsuleIdValue,
      capsuleName: normalizeOptionalString(capsule.name ?? null),
    });
    suggestedSnapshot = generated.suggestedSnapshot;
    suggestedPeriodHashes = generated.suggestedPeriodHashes;
    coverageMeta = generated.coverage;
    latestTimelineAt = generated.latestTimelineAt ?? activity.latestPostAt ?? null;

    await upsertCapsuleHistorySnapshotRecord({
      capsuleId: capsuleIdValue,
      suggestedSnapshot: generated.suggestedSnapshot as unknown as Record<string, unknown>,
      suggestedGeneratedAt: generated.suggestedSnapshot.generatedAt,
      suggestedLatestPostAt: latestTimelineAt,
      postCount: activity.postCount,
      suggestedPeriodHashes,
      promptMemory,
      templatePresets: templates,
      coverageMeta,
    });

    persisted = await getCapsuleHistorySnapshotRecord(capsuleIdValue);
    if (persisted) {
      promptMemory = coercePromptMemory(persisted.promptMemory ?? promptMemory);
      templates = coerceTemplatePresets(persisted.templatePresets ?? templates);
      coverageMeta = coerceCoverageMeta(persisted.coverageMeta ?? coverageMeta);
      suggestedPeriodHashes = persisted.suggestedPeriodHashes ?? suggestedPeriodHashes;
      latestTimelineAt = persisted.suggestedLatestPostAt ?? latestTimelineAt;
      suggestedSnapshot = coerceStoredSnapshot(persisted.suggestedSnapshot) ?? suggestedSnapshot;
      publishedSnapshot = coerceStoredSnapshot(persisted.publishedSnapshot ?? null);
    }
  }

  const sectionSettings = await listCapsuleHistorySectionSettings(capsuleIdValue);
  const pins = await listCapsuleHistoryPins(capsuleIdValue);
  const exclusions = await listCapsuleHistoryExclusions(capsuleIdValue);
  const edits = await listCapsuleHistoryEdits(capsuleIdValue, { limit: 200 });
  const topicPages = await listCapsuleTopicPages(capsuleIdValue);
  const backlinks = await listCapsuleTopicPageBacklinks(capsuleIdValue);

  const response = composeCapsuleHistorySnapshot({
    capsuleId: capsuleIdValue,
    capsuleName: normalizeOptionalString(capsule.name ?? null),
    suggested: suggestedSnapshot,
    published: publishedSnapshot,
    coverage: coverageMeta,
    promptMemory,
    templates,
    sectionSettings,
    pins,
    exclusions,
    edits,
    topicPages,
    backlinks,
  });

  setCachedCapsuleHistory(capsuleIdValue, response, {
    latestPostAt: activity.latestPostAt ?? latestTimelineAt ?? null,
    suggestedPeriodHashes,
  });

  return response;
}

export async function refreshStaleCapsuleHistories(params: {
  limit?: number;
  staleAfterMinutes?: number;
} = {}): Promise<{
  refreshed: number;
  candidates: number;
  errors: Array<{ capsuleId: string; error: string }>;
}> {
  const limit = Math.max(1, Math.trunc(params.limit ?? 12));
  const staleAfterMinutes = Math.max(5, Math.trunc(params.staleAfterMinutes ?? 360));
  const candidates = await listCapsuleHistoryRefreshCandidates({
    limit,
    staleAfterMinutes,
  });
  let refreshed = 0;
  const errors: Array<{ capsuleId: string; error: string }> = [];

  for (const candidate of candidates) {
    try {
      await getCapsuleHistory(candidate.capsuleId, candidate.ownerId, { forceRefresh: true });
      refreshed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ capsuleId: candidate.capsuleId, error: message });
    }
  }

  return {
    refreshed,
    candidates: candidates.length,
    errors,
  };
}

function resolveAssetMimeType(
  row: CapsuleAssetRow,
  meta: Record<string, unknown> | null,
): string | null {
  const direct = normalizeOptionalString(row.media_type ?? null);
  if (direct) return direct;
  if (!meta) return null;
  const mimeKeys = ["mime_type", "content_type", "mimeType", "contentType"];
  for (const key of mimeKeys) {
    const value = normalizeOptionalString((meta as Record<string, unknown>)[key] ?? null);
    if (value) return value;
  }
  return null;
}

function resolveAssetThumbnail(
  meta: Record<string, unknown> | null,
  origin: string | null | undefined,
): string | null {
  if (!meta) return null;
  const thumbKeys = ["thumbnail_url", "thumbnailUrl", "thumb", "preview_url", "previewUrl"];
  for (const key of thumbKeys) {
    const value = normalizeOptionalString((meta as Record<string, unknown>)[key] ?? null);
    if (value) {
      return resolveCapsuleMediaUrl(value, origin ?? null);
    }
  }
  return null;
}

function determineAssetCategory(
  mimeType: string | null,
  meta: Record<string, unknown> | null,
): "media" | "file" {
  const primary = meta
    ? normalizeOptionalString(
        ((meta as Record<string, unknown>).mime_primary ??
          (meta as Record<string, unknown>).category ??
          null) as string | null,
      )
    : null;
  if (primary && ["image", "video", "audio"].includes(primary)) {
    return "media";
  }
  if (!mimeType) return "file";
  const lowered = mimeType.toLowerCase();
  if (lowered.startsWith("image/") || lowered.startsWith("video/") || lowered.startsWith("audio/")) {
    return "media";
  }
  return "file";
}

function cloneMeta(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return { ...(meta as Record<string, unknown>) };
}

function mapCapsuleAsset(
  row: CapsuleAssetRow,
  origin: string | null | undefined,
): { item: CapsuleLibraryItem; category: "media" | "file" } | null {
  const id = normalizeOptionalString(row.id ?? null);
  const mediaUrl = resolveCapsuleMediaUrl(row.media_url ?? null, origin ?? null);
  if (!id || !mediaUrl) return null;

  const meta = cloneMeta(row.meta ?? null);
  const mimeType = resolveAssetMimeType(row, meta);
  const category = determineAssetCategory(mimeType, meta);
  const thumbnailUrl = resolveAssetThumbnail(meta, origin);
  const createdAt = row.created_at ?? null;
  const uploadedBy = normalizeOptionalString(row.uploaded_by ?? null);
  const postId = normalizeOptionalString(row.post_id ?? null);
  const storageKey =
    meta && typeof meta.storage_key !== "undefined"
      ? normalizeOptionalString((meta as Record<string, unknown>).storage_key ?? null) ??
        normalizeOptionalString((meta as Record<string, unknown>).storageKey ?? null)
      : null;
  const viewCountRaw = row.view_count;
  const viewCount =
    typeof viewCountRaw === "number"
      ? viewCountRaw
      : typeof viewCountRaw === "string"
        ? Number(viewCountRaw) || null
        : null;

  const item: CapsuleLibraryItem = {
    id,
    url: mediaUrl,
    thumbnailUrl,
    mimeType,
    title: row.title ?? null,
    description: row.description ?? null,
    createdAt,
    meta,
    viewCount,
    uploadedBy,
    postId,
    storageKey,
  };

  return { item, category };
}

export async function getCapsuleLibrary(
  capsuleId: string,
  viewerId: string | null,
  options: { origin?: string | null; limit?: number } = {},
): Promise<CapsuleLibrary> {
  const summary = await getCapsuleSummaryForViewer(capsuleId, viewerId, {
    origin: options.origin ?? null,
  });
  if (!summary) {
    throw new CapsuleMembershipError("not_found", "Capsule not found.", 404);
  }

  const rows = await listCapsuleAssets({
    capsuleId,
    ...(typeof options.limit === "number" ? { limit: options.limit } : {}),
  });

  const media: CapsuleLibraryItem[] = [];
  const files: CapsuleLibraryItem[] = [];
  const origin = options.origin ?? null;

  rows.forEach((row) => {
    const mapped = mapCapsuleAsset(row, origin);
    if (!mapped) return;
    if (mapped.category === "media") {
      media.push(mapped.item);
    } else {
      files.push(mapped.item);
    }
  });

  return { media, files };
}
