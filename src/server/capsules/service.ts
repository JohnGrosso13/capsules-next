import type {
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
  updateCapsuleMemberRole,
  updateCapsuleBanner,
  updateCapsuleStoreBanner,
  updateCapsulePromoTile,
  updateCapsuleLogo,
} from "./repository";
import { indexMemory } from "@/server/memories/service";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";

export type { CapsuleSummary, DiscoverCapsuleSummary } from "./repository";
export type {
  CapsuleMemberSummary,
  CapsuleMemberRequestSummary,
  CapsuleMembershipViewer,
  CapsuleMembershipState,
} from "@/types/capsules";

const REQUEST_MESSAGE_MAX_LENGTH = 500;
const CAPSULE_MEMBER_ROLES = new Set(["member", "leader", "admin", "founder"]);

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

function resolveCapsuleMediaUrl(value: string | null): string | null {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return null;
  return resolveToAbsoluteUrl(normalized, serverEnv.SITE_URL) ?? normalized;
}

function normalizeMemberRole(value: unknown): string {
  const normalized = normalizeOptionalString(value)?.toLowerCase() ?? null;
  if (!normalized || !CAPSULE_MEMBER_ROLES.has(normalized)) {
    throw new CapsuleMembershipError("invalid", "Invalid capsule role.", 400);
  }
  return normalized;
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

async function requireCapsuleOwnership(capsuleId: string, ownerId: string) {
  const normalizedOwnerId = normalizeId(ownerId);
  if (!normalizedOwnerId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsule(capsuleId);
  if (capsuleOwnerId !== normalizedOwnerId) {
    throw new CapsuleMembershipError("forbidden", "You do not have permission to manage this capsule.", 403);
  }
  return { capsule, ownerId: capsuleOwnerId };
}

export type CapsuleGatePayload = {
  capsules: CapsuleSummary[];
  defaultCapsuleId: string | null;
};

export async function resolveCapsuleGate(
  supabaseUserId: string | null | undefined,
): Promise<CapsuleGatePayload> {
  if (!supabaseUserId) {
    return { capsules: [], defaultCapsuleId: null };
  }

  const capsules = await listCapsulesForUser(supabaseUserId);
  const hydratedCapsules = capsules.map((capsule) => ({
    ...capsule,
    bannerUrl: resolveCapsuleMediaUrl(capsule.bannerUrl),
    storeBannerUrl: resolveCapsuleMediaUrl(capsule.storeBannerUrl),
    promoTileUrl: resolveCapsuleMediaUrl(capsule.promoTileUrl),
    logoUrl: resolveCapsuleMediaUrl(capsule.logoUrl),
  }));
  const defaultCapsuleId = hydratedCapsules.length === 1 ? hydratedCapsules[0]?.id ?? null : null;

  return { capsules: hydratedCapsules, defaultCapsuleId };
}

export async function getUserCapsules(
  supabaseUserId: string | null | undefined,
): Promise<CapsuleSummary[]> {
  if (!supabaseUserId) return [];
  const capsules = await listCapsulesForUser(supabaseUserId);
  return capsules.map((capsule) => ({
    ...capsule,
    bannerUrl: resolveCapsuleMediaUrl(capsule.bannerUrl),
    storeBannerUrl: resolveCapsuleMediaUrl(capsule.storeBannerUrl),
    promoTileUrl: resolveCapsuleMediaUrl(capsule.promoTileUrl),
    logoUrl: resolveCapsuleMediaUrl(capsule.logoUrl),
  }));
}

export async function getRecentCapsules(options: {
  viewerId?: string | null | undefined;
  limit?: number;
} = {}): Promise<DiscoverCapsuleSummary[]> {
  const normalizedViewer = normalizeId(options.viewerId ?? null);
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
    bannerUrl: resolveCapsuleMediaUrl(capsule.bannerUrl),
    storeBannerUrl: resolveCapsuleMediaUrl(capsule.storeBannerUrl),
    promoTileUrl: resolveCapsuleMediaUrl(capsule.promoTileUrl),
    logoUrl: resolveCapsuleMediaUrl(capsule.logoUrl),
  }));
}

export async function getCapsuleSummaryForViewer(
  capsuleId: string,
  viewerId?: string | null | undefined,
): Promise<CapsuleSummary | null> {
  const summary = await repoGetCapsuleSummaryForViewer(capsuleId, viewerId ?? null);
  if (!summary) return null;
  return {
    ...summary,
    bannerUrl: resolveCapsuleMediaUrl(summary.bannerUrl),
    storeBannerUrl: resolveCapsuleMediaUrl(summary.storeBannerUrl),
    promoTileUrl: resolveCapsuleMediaUrl(summary.promoTileUrl),
    logoUrl: resolveCapsuleMediaUrl(summary.logoUrl),
  };
}

export async function createCapsule(
  ownerId: string,
  params: { name: string },
): Promise<CapsuleSummary> {
  return createCapsuleForUser(ownerId, params);
}

export async function deleteCapsule(
  ownerId: string,
  capsuleId: string,
): Promise<boolean> {
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
): Promise<{ bannerUrl: string | null }> {
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.banner.update: capsule has invalid identifier");
  }

  const normalizedUrl = normalizeOptionalString(params.bannerUrl ?? null);
  if (!normalizedUrl) {
    throw new CapsuleMembershipError("invalid", "A banner URL is required.", 400);
  }

  const resolvedBannerUrl = resolveCapsuleMediaUrl(normalizedUrl);
  if (!resolvedBannerUrl) {
    throw new CapsuleMembershipError("invalid", "A banner URL is required.", 400);
  }

  const updated = await updateCapsuleBanner({
    capsuleId: capsuleIdValue,
    ownerId: capsuleOwnerId,
    bannerUrl: resolvedBannerUrl,
  });

  if (!updated) {
    throw new CapsuleMembershipError("invalid", "Failed to update capsule banner.", 400);
  }

  const capsuleName = normalizeOptionalString(capsule.name ?? null) ?? "your capsule";
  const originalName = normalizeOptionalString(params.originalName ?? null);

  const memoryTitle = originalName
    ? `${originalName} banner`
    : `Banner for ${capsuleName}`;

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
): Promise<{ storeBannerUrl: string | null }> {
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.storeBanner.update: capsule has invalid identifier");
  }

  const normalizedUrl = normalizeOptionalString(params.storeBannerUrl ?? null);
  if (!normalizedUrl) {
    throw new CapsuleMembershipError("invalid", "A store banner URL is required.", 400);
  }

  const resolvedStoreBannerUrl = resolveCapsuleMediaUrl(normalizedUrl);
  if (!resolvedStoreBannerUrl) {
    throw new CapsuleMembershipError("invalid", "A store banner URL is required.", 400);
  }

  const updated = await updateCapsuleStoreBanner({
    capsuleId: capsuleIdValue,
    ownerId: capsuleOwnerId,
    storeBannerUrl: resolvedStoreBannerUrl,
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
): Promise<{ tileUrl: string | null }> {
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.tile.update: capsule has invalid identifier");
  }

  const normalizedUrl = normalizeOptionalString(params.tileUrl ?? null);
  if (!normalizedUrl) {
    throw new CapsuleMembershipError("invalid", "A tile URL is required.", 400);
  }

  const resolvedTileUrl = resolveCapsuleMediaUrl(normalizedUrl);
  if (!resolvedTileUrl) {
    throw new CapsuleMembershipError("invalid", "A tile URL is required.", 400);
  }

  const updated = await updateCapsulePromoTile({
    capsuleId: capsuleIdValue,
    ownerId: capsuleOwnerId,
    promoTileUrl: resolvedTileUrl,
  });

  if (!updated) {
    throw new CapsuleMembershipError("invalid", "Failed to update capsule promo tile.", 400);
  }

  const capsuleName = normalizeOptionalString(capsule.name ?? null) ?? "your capsule";
  const originalName = normalizeOptionalString(params.originalName ?? null);

  const memoryTitle = originalName
    ? `${originalName} promo tile`
    : `Promo tile for ${capsuleName}`;

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
): Promise<{ logoUrl: string | null }> {
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsuleOwnership(capsuleId, ownerId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.logo.update: capsule has invalid identifier");
  }

  const normalizedUrl = normalizeOptionalString(params.logoUrl ?? null);
  if (!normalizedUrl) {
    throw new CapsuleMembershipError("invalid", "A logo URL is required.", 400);
  }

  const resolvedLogoUrl = resolveCapsuleMediaUrl(normalizedUrl);
  if (!resolvedLogoUrl) {
    throw new CapsuleMembershipError("invalid", "A logo URL is required.", 400);
  }

  const updated = await updateCapsuleLogo({
    capsuleId: capsuleIdValue,
    ownerId: capsuleOwnerId,
    logoUrl: resolvedLogoUrl,
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
  const requests = isOwner
    ? await listCapsuleMemberRequests(capsuleIdValue, "pending")
    : [];

  const pendingCount = isOwner
    ? requests.length
    : viewerRequest?.status === "pending"
      ? 1
      : 0;

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
    role: isOwner ? "owner" : normalizeOptionalString(membershipRecord?.role ?? null),
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
      bannerUrl: resolveCapsuleMediaUrl(capsule.banner_url ?? null),
      storeBannerUrl: resolveCapsuleMediaUrl(capsule.store_banner_url ?? null),
      promoTileUrl: resolveCapsuleMediaUrl(capsule.promo_tile_url ?? null),
      logoUrl: resolveCapsuleMediaUrl(capsule.logo_url ?? null),
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

  return getCapsuleMembership(capsuleIdValue, normalizedUserId);
}

export async function approveCapsuleMemberRequest(
  ownerId: string,
  capsuleId: string,
  requestId: string,
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

  await upsertCapsuleMember({
    capsuleId: capsuleIdValue,
    userId: updated.requesterId,
    role: updated.role ?? "member",
  });

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId);
}

export async function declineCapsuleMemberRequest(
  ownerId: string,
  capsuleId: string,
  requestId: string,
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

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId);
}

export async function removeCapsuleMember(
  ownerId: string,
  capsuleId: string,
  memberId: string,
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

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId);
}

export async function setCapsuleMemberRole(
  ownerId: string,
  capsuleId: string,
  memberId: string,
  role: string,
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
    throw new CapsuleMembershipError(
      "conflict",
      "The capsule owner must remain a founder.",
      409,
    );
  }

  const updated = await updateCapsuleMemberRole({
    capsuleId: capsuleIdValue,
    memberId: normalizedMemberId,
    role: normalizedRole,
  });

  if (!updated) {
    throw new CapsuleMembershipError("not_found", "Member not found in this capsule.", 404);
  }

  return getCapsuleMembership(capsuleIdValue, capsuleOwnerId);
}
