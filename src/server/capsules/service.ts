import {
  createCapsuleForUser,
  deleteCapsuleOwnedByUser,
  listCapsulesForUser,
  listCapsulesByOwnerIds,
  listRecentPublicCapsules,
  getCapsuleSummaryForViewer as repoGetCapsuleSummaryForViewer,
  type CapsuleSummary,
  type DiscoverCapsuleSummary,
  type CapsuleAssetRow,
  updateCapsuleBanner,
  updateCapsuleStoreBanner,
  updateCapsulePromoTile,
  updateCapsuleLogo,
  listCapsuleAssets,
} from "./repository";
import {
  CapsuleMembershipError,
  normalizeId,
  normalizeOptionalString,
  resolveCapsuleMediaUrl,
} from "./domain/common";
import { canCustomizeCapsule, resolveCapsuleActor } from "./permissions";
import { indexMemory } from "@/server/memories/service";
import { enqueueCapsuleKnowledgeRefresh } from "./knowledge";
import { listFriendUserIds } from "@/server/friends/repository";
import { enforceSafeText } from "@/server/moderation/text";

export type { CapsuleSummary, DiscoverCapsuleSummary } from "./repository";
export type {
  CapsuleMemberSummary,
  CapsuleMemberRequestSummary,
  CapsuleMembershipViewer,
  CapsuleMembershipState,
} from "@/types/capsules";
export { CapsuleMembershipError, requireCapsuleOwnership } from "./domain/common";
export {
  getCapsuleMembership,
  requestCapsuleMembership,
  followCapsule,
  unfollowCapsule,
  leaveCapsule,
  inviteCapsuleMember,
  acceptCapsuleInvite,
  declineCapsuleInvite,
  approveCapsuleMemberRequest,
  declineCapsuleMemberRequest,
  removeCapsuleMember,
  setCapsuleMemberRole,
  setCapsuleMembershipPolicy,
} from "./domain/membership-service";
export {
  publishCapsuleHistorySection,
  addCapsuleHistoryPin,
  removeCapsuleHistoryPin,
  addCapsuleHistoryExclusion,
  removeCapsuleHistoryExclusion,
  updateCapsuleHistorySectionSettings,
  updateCapsuleHistoryPromptSettings,
  refineCapsuleHistorySection,
  getCapsuleHistory,
  refreshStaleCapsuleHistories,
} from "./history/service";

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

const SUPABASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeSupabaseId(value: string | null | undefined): string | null {
  const normalized = normalizeId(value ?? null);
  if (!normalized) return null;
  return SUPABASE_UUID_PATTERN.test(normalized) ? normalized : null;
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

export async function getFollowedCapsules(
  supabaseUserId: string | null | undefined,
  options: { origin?: string | null } = {},
): Promise<CapsuleSummary[]> {
  if (!supabaseUserId) return [];
  const origin = options.origin ?? null;
  const capsules = await listCapsulesForUser(supabaseUserId);
  return capsules
    .filter((capsule) => capsule.ownership === "follower")
    .map((capsule) => ({
      ...capsule,
      bannerUrl: resolveCapsuleMediaUrl(capsule.bannerUrl, origin),
      storeBannerUrl: resolveCapsuleMediaUrl(capsule.storeBannerUrl, origin),
      promoTileUrl: resolveCapsuleMediaUrl(capsule.promoTileUrl, origin),
      logoUrl: resolveCapsuleMediaUrl(capsule.logoUrl, origin),
    }));
}

export async function getFriendOwnedCapsules(
  supabaseUserId: string | null | undefined,
  options: { origin?: string | null; limit?: number } = {},
): Promise<CapsuleSummary[]> {
  const viewerId = normalizeSupabaseId(supabaseUserId);
  if (!viewerId) return [];

  let friendIds: string[] = [];
  try {
    friendIds = await listFriendUserIds(viewerId);
  } catch (error) {
    console.error("capsules.friendOwned.listFriendIds", error);
    return [];
  }

  const ownerIds = Array.from(
    new Set(
      friendIds
        .map((id) => normalizeSupabaseId(id))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (!ownerIds.length) return [];

  const repoOptions =
    typeof options.limit === "number" ? { limit: options.limit } : ({} as { limit?: number });
  const rawCapsules = await listCapsulesByOwnerIds(ownerIds, repoOptions);
  const origin = options.origin ?? null;

  return rawCapsules.map((capsule) => ({
    ...capsule,
    ownership: "follower",
    bannerUrl: resolveCapsuleMediaUrl(capsule.bannerUrl, origin),
    storeBannerUrl: resolveCapsuleMediaUrl(capsule.storeBannerUrl, origin),
    promoTileUrl: resolveCapsuleMediaUrl(capsule.promoTileUrl, origin),
    logoUrl: resolveCapsuleMediaUrl(capsule.logoUrl, origin),
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
  await enforceSafeText(params.name, { kind: "profile", maxChars: 80 });
  return createCapsuleForUser(ownerId, params);
}

export async function deleteCapsule(ownerId: string, capsuleId: string): Promise<boolean> {
  return deleteCapsuleOwnedByUser(ownerId, capsuleId);
}

type BannerCrop = {
  offsetX: number;
  offsetY: number;
};

async function requireCapsuleCustomizer(capsuleId: string, actorId: string) {
  const actor = await resolveCapsuleActor(capsuleId, actorId);
  if (!canCustomizeCapsule(actor)) {
    throw new CapsuleMembershipError(
      "forbidden",
      "You must be a capsule founder or admin to update capsule branding.",
      403,
    );
  }
  return actor;
}

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
  const actor = await requireCapsuleCustomizer(capsuleId, ownerId);
  const capsule = actor.capsule;
  if (!capsule) {
    throw new CapsuleMembershipError("not_found", "Capsule not found.", 404);
  }
  const capsuleIdValue = actor.capsuleId;
  const capsuleOwnerId = actor.ownerId;

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

  enqueueCapsuleKnowledgeRefresh(capsuleIdValue, normalizeOptionalString(capsule.name ?? null));

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
  const actor = await requireCapsuleCustomizer(capsuleId, ownerId);
  const capsule = actor.capsule;
  if (!capsule) {
    throw new CapsuleMembershipError("not_found", "Capsule not found.", 404);
  }
  const capsuleIdValue = actor.capsuleId;
  const capsuleOwnerId = actor.ownerId;

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

  enqueueCapsuleKnowledgeRefresh(capsuleIdValue, normalizeOptionalString(capsule.name ?? null));

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
  const actor = await requireCapsuleCustomizer(capsuleId, ownerId);
  const capsule = actor.capsule;
  if (!capsule) {
    throw new CapsuleMembershipError("not_found", "Capsule not found.", 404);
  }
  const capsuleIdValue = actor.capsuleId;
  const capsuleOwnerId = actor.ownerId;

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

  enqueueCapsuleKnowledgeRefresh(capsuleIdValue, normalizeOptionalString(capsule.name ?? null));

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
  const actor = await requireCapsuleCustomizer(capsuleId, ownerId);
  const capsule = actor.capsule;
  if (!capsule) {
    throw new CapsuleMembershipError("not_found", "Capsule not found.", 404);
  }
  const capsuleIdValue = actor.capsuleId;
  const capsuleOwnerId = actor.ownerId;

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

  enqueueCapsuleKnowledgeRefresh(capsuleIdValue, normalizeOptionalString(capsule.name ?? null));

  return { logoUrl: resolvedLogoUrl };
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
