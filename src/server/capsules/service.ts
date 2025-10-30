import type {
  CapsuleHistoryPeriod,
  CapsuleHistorySection,
  CapsuleHistorySnapshot,
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
  getCapsuleHistoryActivity,
  updateCapsuleMemberRole,
  updateCapsuleBanner,
  updateCapsuleStoreBanner,
  updateCapsulePromoTile,
  updateCapsuleLogo,
  listCapsuleAssets,
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
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_PERSIST_REFRESH_MS = WEEK_MS;

type CapsuleHistoryCacheEntry = {
  expiresAt: number;
  snapshot: CapsuleHistorySnapshot;
  latestPostAt: string | null;
  generatedAtMs: number;
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

function setCachedCapsuleHistory(
  capsuleId: string,
  snapshot: CapsuleHistorySnapshot,
  meta: { latestPostAt: string | null },
) {
  const generatedAtMs = Date.parse(snapshot.generatedAt);
  capsuleHistoryCache.set(capsuleId, {
    expiresAt: Date.now() + HISTORY_CACHE_TTL_MS,
    snapshot,
    latestPostAt: meta.latestPostAt ?? null,
    generatedAtMs: Number.isNaN(generatedAtMs) ? Date.now() : generatedAtMs,
  });
}

function historySnapshotIsStale(params: {
  generatedAtMs: number;
  storedLatestPostAt: string | null;
  activityLatestPostAt: string | null;
}): boolean {
  const { generatedAtMs, storedLatestPostAt, activityLatestPostAt } = params;
  const snapshotLatestMs = toTimestamp(storedLatestPostAt);
  const activityLatestMs = toTimestamp(activityLatestPostAt);

  if (activityLatestMs !== null) {
    if (snapshotLatestMs === null || activityLatestMs > snapshotLatestMs) {
      return true;
    }
  } else if (snapshotLatestMs !== null) {
    return true;
  }

  if (Date.now() - generatedAtMs > HISTORY_PERSIST_REFRESH_MS) {
    return true;
  }

  return false;
}

function extractLatestTimelineTimestamp(snapshot: CapsuleHistorySnapshot): string | null {
  let latestMs: number | null = null;
  let latestIso: string | null = null;
  snapshot.sections.forEach((section) => {
    section.timeline.forEach((entry) => {
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
          required: ["period", "summary", "highlights", "timeline", "next_focus"],
          properties: {
            period: { type: "string", enum: ["weekly", "monthly", "all_time"] },
            title: { type: "string" },
            summary: { type: "string" },
            highlights: { type: "array", items: { type: "string" } },
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

function coerceTimelineEntries(
  value: unknown,
  capsuleId: string,
): CapsuleHistorySection["timeline"] {
  if (!Array.isArray(value)) return [];
  const entries: CapsuleHistorySection["timeline"] = [];
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
    entries.push({
      label,
      detail,
      timestamp,
      ...(postId
        ? {
            postId,
            permalink: buildCapsulePostPermalink(capsuleId, postId),
          }
        : {}),
    });
    if (entries.length >= HISTORY_TIMELINE_LIMIT) break;
  }
  return entries;
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

function buildFallbackTimeline(
  capsuleId: string,
  timeframe: CapsuleHistoryTimeframe,
): CapsuleHistorySection["timeline"] {
  if (!timeframe.posts.length) return [];
  const timeline: CapsuleHistorySection["timeline"] = [];
  for (const post of timeframe.posts.slice(0, HISTORY_TIMELINE_LIMIT)) {
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
    const postId = normalizeOptionalString(post.id);
    timeline.push({
      label,
      detail,
      timestamp: post.createdAt,
      ...(postId
        ? {
            postId,
            permalink: buildCapsulePostPermalink(capsuleId, postId),
          }
        : {}),
    });
  }
  return timeline;
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
      "You are Capsules AI, maintaining a capsule history wiki. For each timeframe (weekly, monthly, all_time) produce concise factual recaps based only on the provided posts. Return JSON matching the schema. Summaries may be up to three sentences. Highlights should be short bullet-style points (<=140 chars) referencing actual activity. Timeline entries should mention specific updates with plain language and include the related post_id when the post exists in the provided list. Provide 1-3 actionable next_focus suggestions when there is activity. If a timeframe has zero posts, set empty=true, summary like 'No new activity this period.', and provide one suggestion encouraging participation. Never invent names or events.",
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
): CapsuleHistorySection[] {
  return timeframes.map((timeframe) => {
    const match =
      modelSections?.find(
        (section) => normalizeHistoryPeriod(section.period) === timeframe.period,
      ) ?? null;
    const title = sanitizeHistoryString(match?.title, 80) ?? timeframe.label;
    const summary =
      sanitizeHistoryString(match?.summary, HISTORY_SUMMARY_LIMIT) ??
      buildFallbackSummary(timeframe);
    const highlights = sanitizeHistoryArray(match?.highlights, HISTORY_HIGHLIGHT_LIMIT);
    const nextFocus = sanitizeHistoryArray(match?.next_focus, HISTORY_NEXT_FOCUS_LIMIT, 160);
    const timeline = coerceTimelineEntries(match?.timeline, capsuleId);

    const resolvedHighlights = highlights.length
      ? highlights
      : sanitizeHistoryArray(buildFallbackHighlights(timeframe), HISTORY_HIGHLIGHT_LIMIT);
    const resolvedNextFocus = nextFocus.length
      ? nextFocus
      : sanitizeHistoryArray(buildFallbackNextFocus(timeframe), HISTORY_NEXT_FOCUS_LIMIT, 160);
    const resolvedTimeline = timeline.length ? timeline : buildFallbackTimeline(capsuleId, timeframe);

    const isEmpty = Boolean(match?.empty) || timeframe.posts.length === 0;

    return {
      period: timeframe.period,
      title,
      summary,
      highlights: resolvedHighlights,
      nextFocus: resolvedNextFocus,
      timeline: resolvedTimeline,
      timeframe: { start: timeframe.start, end: timeframe.end },
      postCount: timeframe.posts.length,
      isEmpty,
    };
  });
}

async function buildCapsuleHistorySnapshot({
  capsuleId,
  capsuleName,
}: {
  capsuleId: string;
  capsuleName: string | null;
}): Promise<CapsuleHistorySnapshot> {
  const posts = await loadCapsuleHistoryPosts(capsuleId, HISTORY_POST_LIMIT);
  const now = new Date();
  const nowIso = now.toISOString();
  const timeframes = buildHistoryTimeframes(posts, now);

  if (!posts.length) {
    const sections = timeframes.map<CapsuleHistorySection>((timeframe) => ({
      period: timeframe.period,
      title: timeframe.label,
      summary: buildFallbackSummary(timeframe),
      highlights: sanitizeHistoryArray(
        buildFallbackHighlights(timeframe),
        HISTORY_HIGHLIGHT_LIMIT,
      ),
      nextFocus: sanitizeHistoryArray(
        buildFallbackNextFocus(timeframe),
        HISTORY_NEXT_FOCUS_LIMIT,
        160,
      ),
      timeline: buildFallbackTimeline(capsuleId, timeframe),
      timeframe: { start: timeframe.start, end: timeframe.end },
      postCount: 0,
      isEmpty: true,
    }));

    return {
      capsuleId,
      capsuleName,
      generatedAt: nowIso,
      sections,
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

  const sections = buildHistorySections(capsuleId, timeframes, modelSections);
  return {
    capsuleId,
    capsuleName,
    generatedAt,
    sections,
  };
}

export async function getCapsuleHistory(
  capsuleId: string,
  viewerId: string | null | undefined,
  options: { forceRefresh?: boolean } = {},
): Promise<CapsuleHistorySnapshot> {
  const normalizedViewerId = normalizeId(viewerId ?? null);
  if (!normalizedViewerId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }

  const { capsule, ownerId } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.history: capsule has invalid identifier");
  }

  if (normalizedViewerId !== ownerId) {
    const membership = await getCapsuleMemberRecord(capsuleIdValue, normalizedViewerId);
    if (!membership) {
      throw new CapsuleMembershipError(
        "forbidden",
        "Join this capsule to view its history.",
        403,
      );
    }
  }

  const activity = await getCapsuleHistoryActivity(capsuleIdValue);

  if (!options.forceRefresh) {
    const cachedEntry = getCachedCapsuleHistory(capsuleIdValue);
    if (
      cachedEntry &&
      !historySnapshotIsStale({
        generatedAtMs: cachedEntry.generatedAtMs,
        storedLatestPostAt: cachedEntry.latestPostAt,
        activityLatestPostAt: activity.latestPostAt,
      })
    ) {
      return cachedEntry.snapshot;
    }
  }

  if (!options.forceRefresh) {
    const persisted = await getCapsuleHistorySnapshotRecord(capsuleIdValue);
    if (persisted) {
      const generatedAtMs = toTimestamp(persisted.generatedAt) ?? Date.now();
      if (
        !historySnapshotIsStale({
          generatedAtMs,
          storedLatestPostAt: persisted.latestPostAt,
          activityLatestPostAt: activity.latestPostAt,
        })
      ) {
        setCachedCapsuleHistory(capsuleIdValue, persisted.snapshot, {
          latestPostAt: persisted.latestPostAt,
        });
        return persisted.snapshot;
      }
    }
  }

  const snapshot = await buildCapsuleHistorySnapshot({
    capsuleId: capsuleIdValue,
    capsuleName: normalizeOptionalString(capsule.name ?? null),
  });
  const latestFromSnapshot =
    activity.latestPostAt ?? extractLatestTimelineTimestamp(snapshot) ?? null;
  setCachedCapsuleHistory(capsuleIdValue, snapshot, { latestPostAt: latestFromSnapshot });

  try {
    await upsertCapsuleHistorySnapshotRecord({
      capsuleId: capsuleIdValue,
      snapshot,
      generatedAt: snapshot.generatedAt,
      latestPostAt: latestFromSnapshot,
      postCount: activity.postCount,
    });
  } catch (error) {
    console.warn("capsules.history snapshot persistence failed", error);
  }

  return snapshot;
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
