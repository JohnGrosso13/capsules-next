import { getDatabaseAdminClient } from "@/config/database";
import type {
  CapsuleFollowerSummary,
  CapsuleMemberProfile,
  CapsuleMemberRequestSummary,
  CapsuleMemberSummary,
  CapsuleHistoryPeriod,
} from "@/types/capsules";

import { dbRoleToUiRole, resolveMemberUiRole } from "../roles";
import type {
  CapsuleFollowerRow,
  CapsuleHistoryExclusionRow,
  CapsuleHistoryPinRow,
  CapsuleHistoryRefreshCandidateRow,
  CapsuleHistorySectionSettingsRow,
  CapsuleMemberDetailsRow,
  CapsuleMemberRequestRow,
  CapsuleRow,
  DiscoverCapsuleSummary,
  MemberProfileRow,
  CapsuleSummary,
} from "./types";

export const db = getDatabaseAdminClient();

export function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeHistoryPeriodValue(value: unknown): CapsuleHistoryPeriod | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  if (normalized === "weekly" || normalized === "monthly" || normalized === "all_time") {
    return normalized;
  }
  return null;
}

export function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  value.forEach((entry) => {
    if (typeof entry === "string") {
      const normalized = entry.trim();
      if (normalized.length) {
        result.push(normalized);
      }
    }
  });
  return result;
}

const NAME_LIMIT = 80;
const SLUG_LIMIT = 50;
export const SLUG_MAX_ATTEMPTS = 4;

export function normalizeName(value: unknown): string {
  const normalized = normalizeString(value);
  if (!normalized) return "Untitled Capsule";
  if (normalized.length <= NAME_LIMIT) return normalized;
  return normalized.slice(0, NAME_LIMIT).trim();
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildSlugCandidate(source: string, attempt: number): string | null {
  const base = slugify(source).slice(0, SLUG_LIMIT);
  if (!base) return null;
  if (attempt === 0) return base;
  const suffix =
    attempt === 1
      ? Math.random().toString(36).slice(-4)
      : `${attempt}-${Math.random().toString(36).slice(-3)}`;
  const candidate = `${base}-${suffix}`.slice(0, SLUG_LIMIT);
  return candidate.length ? candidate : null;
}

export function resolveOwnership(
  capsule: CapsuleRow,
  viewerId?: string | null,
): "owner" | "member" {
  const ownerId = normalizeString(capsule?.created_by_id ?? null);
  const normalizedViewer = normalizeString(viewerId ?? null);
  if (ownerId && normalizedViewer && ownerId === normalizedViewer) return "owner";
  return "member";
}

export function mapProfile(row: MemberProfileRow | null): CapsuleMemberProfile | null {
  if (!row) return null;
  const id = normalizeString(row.id);
  if (!id) return null;
  return {
    id,
    name: normalizeString(row.full_name),
    avatarUrl: normalizeString(row.avatar_url),
    userKey: normalizeString(row.user_key),
  };
}

export function mapMemberRow(
  row: CapsuleMemberDetailsRow,
  ownerId: string | null,
): CapsuleMemberSummary | null {
  const userId = normalizeString(row.user_id);
  if (!userId) return null;
  const profile = mapProfile(row.user);
  const baseRole = normalizeString(row.role);
  const isOwner = ownerId === userId || baseRole === "owner";
  return {
    userId,
    role: resolveMemberUiRole(baseRole, isOwner),
    joinedAt: normalizeString(row.joined_at),
    name: profile?.name ?? normalizeString(row.user?.full_name ?? null),
    avatarUrl: profile?.avatarUrl ?? normalizeString(row.user?.avatar_url ?? null),
    userKey: profile?.userKey ?? normalizeString(row.user?.user_key ?? null),
    isOwner,
  };
}

export function mapFollowerRow(row: CapsuleFollowerRow): CapsuleFollowerSummary | null {
  const userId = normalizeString(row.user_id);
  if (!userId) return null;
  const profile = mapProfile(row.user);
  return {
    userId,
    followedAt: normalizeString(row.created_at),
    name: profile?.name ?? normalizeString(row.user?.full_name ?? null),
    avatarUrl: profile?.avatarUrl ?? normalizeString(row.user?.avatar_url ?? null),
    userKey: profile?.userKey ?? normalizeString(row.user?.user_key ?? null),
  };
}

export function mapRequestRow(row: CapsuleMemberRequestRow): CapsuleMemberRequestSummary | null {
  const id = normalizeString(row.id);
  const capsuleId = normalizeString(row.capsule_id);
  const requesterId = normalizeString(row.requester_id);
  if (!id || !capsuleId || !requesterId) return null;
  const statusRaw = normalizeString(row.status);
  const status =
    statusRaw === "approved" ||
    statusRaw === "declined" ||
    statusRaw === "cancelled" ||
    statusRaw === "pending"
      ? statusRaw
      : "pending";
  const requesterProfile = mapProfile(row.requester);
  const initiatorProfile = mapProfile(row.initiator);
  const capsuleData = row.capsule ?? null;
  const originRaw = normalizeString(row.origin);
  const origin = originRaw === "owner_invite" ? "owner_invite" : "viewer_request";
  return {
    id,
    capsuleId,
    requesterId,
    responderId: normalizeString(row.responded_by),
    status,
    role: dbRoleToUiRole(row.role),
    message: normalizeString(row.message),
    createdAt: normalizeString(row.created_at),
    respondedAt: normalizeString(row.responded_at),
    approvedAt: normalizeString(row.approved_at),
    declinedAt: normalizeString(row.declined_at),
    cancelledAt: normalizeString(row.cancelled_at),
    requester: requesterProfile,
    initiatorId: normalizeString(row.initiator_id),
    initiator: initiatorProfile,
    origin,
    capsuleName: capsuleData ? normalizeName(capsuleData.name ?? null) : null,
    capsuleSlug: capsuleData ? normalizeString(capsuleData.slug ?? null) : null,
    capsuleLogoUrl: capsuleData ? normalizeString(capsuleData.logo_url ?? null) : null,
  };
}

export function upsertSummary(
  map: Map<string, CapsuleSummary>,
  order: string[],
  capsule: CapsuleRow,
  meta: { role?: string | null; ownership: CapsuleSummary["ownership"] },
): void {
  const rawId = capsule?.id;
  if (!rawId) return;
  const id = String(rawId);
  const existing = map.get(id) ?? null;
  const resolvedOwnership = (() => {
    if (meta.ownership === "owner" || existing?.ownership === "owner") return "owner";
    if (meta.ownership === "member" || existing?.ownership === "member") return "member";
    return "follower";
  })();
  const sourceRole = meta.role ?? existing?.role ?? null;
  const normalizedSourceRole = normalizeString(sourceRole);
  const resolvedRole =
    resolvedOwnership === "owner"
      ? "founder"
      : resolvedOwnership === "member" && normalizedSourceRole
        ? dbRoleToUiRole(normalizedSourceRole) ?? normalizedSourceRole
        : null;

  const baseSummary: CapsuleSummary = {
    id,
    name: normalizeName(capsule?.name ?? null),
    slug: normalizeString(capsule?.slug ?? null),
    bannerUrl: normalizeString(capsule?.banner_url ?? null),
    storeBannerUrl: normalizeString(capsule?.store_banner_url ?? null),
    promoTileUrl: normalizeString(capsule?.promo_tile_url ?? null),
    logoUrl: normalizeString(capsule?.logo_url ?? null),
    role: resolvedRole,
    ownership: resolvedOwnership,
    membershipPolicy: normalizeString(capsule?.membership_policy ?? null),
  };

  if (!existing) {
    map.set(id, baseSummary);
    order.push(id);
    return;
  }

  map.set(id, {
    ...existing,
    ...baseSummary,
    role: baseSummary.role ?? existing.role,
    ownership: baseSummary.ownership,
  });
}

export function mapRefreshCandidateRow(
  row: CapsuleHistoryRefreshCandidateRow,
): DiscoverCapsuleSummary | null {
  const id = normalizeString(row.capsule_id);
  if (!id) return null;
  return {
    id,
    name: "",
    slug: null,
    bannerUrl: null,
    storeBannerUrl: null,
    promoTileUrl: null,
    logoUrl: null,
    createdAt: null,
    membershipPolicy: null,
  };
}

export function mapSectionSettingsRow(
  row: CapsuleHistorySectionSettingsRow,
): CapsuleHistorySectionSettingsRow | null {
  const capsuleId = normalizeString(row.capsule_id);
  const period = normalizeHistoryPeriodValue(row.period);
  if (!capsuleId || !period) return null;
  return {
    ...row,
    capsule_id: capsuleId,
    period,
    editor_notes: normalizeString(row.editor_notes),
    excluded_post_ids: coerceStringArray(row.excluded_post_ids),
    template_id: normalizeString(row.template_id),
    tone_recipe_id: normalizeString(row.tone_recipe_id),
    discussion_thread_id: normalizeString(row.discussion_thread_id),
    updated_at: normalizeString(row.updated_at),
    updated_by: normalizeString(row.updated_by),
  };
}

export function mapHistoryExclusionRow(
  row: CapsuleHistoryExclusionRow,
): CapsuleHistoryExclusionRow | null {
  const capsuleId = normalizeString(row.capsule_id);
  const period = normalizeHistoryPeriodValue(row.period);
  const postId = normalizeString(row.post_id);
  if (!capsuleId || !period || !postId) return null;
  return {
    ...row,
    capsule_id: capsuleId,
    period,
    post_id: postId,
    created_at: normalizeString(row.created_at),
    created_by: normalizeString(row.created_by),
  };
}

export function mapHistoryPinRow(row: CapsuleHistoryPinRow): CapsuleHistoryPinRow | null {
  const capsuleId = normalizeString(row.capsule_id);
  const period = normalizeHistoryPeriodValue(row.period);
  if (!capsuleId || !period) return null;
  return {
    ...row,
    capsule_id: capsuleId,
    period,
    id: normalizeString(row.id),
    pin_type: normalizeString(row.pin_type),
    post_id: normalizeString(row.post_id),
    created_at: normalizeString(row.created_at),
    created_by: normalizeString(row.created_by),
    updated_at: normalizeString(row.updated_at),
  };
}
