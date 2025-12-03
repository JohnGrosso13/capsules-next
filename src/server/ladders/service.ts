import {
  deleteCapsuleLadderMemberRecord,
  deleteCapsuleLadderRecord,
  getCapsuleLadderBySlug,
  getCapsuleLadderMemberRecordById,
  getCapsuleLadderRecordById,
  insertCapsuleLadderMemberRecords,
  insertCapsuleLadderRecord,
  listCapsuleLadderMemberRecords,
  listCapsuleLaddersByCapsule,
  listLaddersByParticipant,
  replaceCapsuleLadderMemberRecords,
  updateCapsuleLadderMemberRecord,
  updateCapsuleLadderRecord,
  type InsertCapsuleLadderParams,
} from "./repository";
import type {
  CapsuleLadderDetail,
  CapsuleLadderMember,
  CapsuleLadderMemberInput,
  CapsuleLadderMemberUpdateInput,
  CapsuleLadderSummary,
  LadderAiPlan,
  LadderConfig,
  LadderGameConfig,
  LadderSections,
  LadderStatus,
  LadderVisibility,
} from "@/types/ladders";
import {
  findCapsuleById,
  listCapsulesForUser,
  type CapsuleRow,
} from "@/server/capsules/repository";
import { enqueueCapsuleKnowledgeRefresh } from "@/server/capsules/knowledge";
import { resolveCapsuleMediaUrl } from "@/server/capsules/domain/common";

import { MANAGER_ROLES, canViewerAccessLadder, requireCapsuleManager, resolveCapsuleViewer } from "./access";
import { CapsuleLadderAccessError } from "./errors";
import { normalizeId, normalizeName } from "./sanitizers";
import { randomSlugSuffix, slugify } from "./utils";

export type { LadderDraftResult, LadderDraftSeed } from "./ai-draft";
export { generateLadderDraftForCapsule } from "./ai-draft";
export { createLadderChallenge, listLadderChallengesForViewer, resolveLadderChallenge } from "./challenges";
export { CapsuleLadderAccessError };

export type CreateCapsuleLadderInput = {
  capsuleId: string;
  name: string;
  summary?: string | null;
  visibility?: LadderVisibility;
  status?: LadderStatus;
  game?: LadderGameConfig | null;
  config?: LadderConfig | null;
  sections?: LadderSections | null;
  aiPlan?: LadderAiPlan | null;
  members?: CapsuleLadderMemberInput[];
  meta?: Record<string, unknown> | null;
  publish?: boolean;
  slug?: string | null;
};

export type UpdateCapsuleLadderInput = {
  name?: string;
  summary?: string | null;
  visibility?: LadderVisibility;
  status?: LadderStatus;
  game?: LadderGameConfig | null;
  config?: LadderConfig | null;
  sections?: LadderSections | null;
  aiPlan?: LadderAiPlan | null;
  meta?: Record<string, unknown> | null;
  publish?: boolean;
  archive?: boolean;
  slug?: string | null;
  members?: CapsuleLadderMemberInput[] | null;
};

export type GetCapsuleLadderOptions = {
  includeMembers?: boolean;
};

export type ListCapsuleLaddersOptions = {
  includeDrafts?: boolean;
  includeArchived?: boolean;
};

export type DiscoverLadderSummary = CapsuleLadderSummary & {
  capsule: {
    id: string;
    name: string | null;
    slug: string | null;
    bannerUrl: string | null;
    logoUrl: string | null;
  } | null;
};

function mapCapsuleIdentity(
  capsule: CapsuleRow | null,
  origin: string | null,
): DiscoverLadderSummary["capsule"] {
  if (!capsule) return null;
  const capsuleId = normalizeId(capsule.id);
  if (!capsuleId) return null;
  return {
    id: capsuleId,
    name: typeof capsule.name === "string" ? capsule.name : null,
    slug: typeof capsule.slug === "string" ? capsule.slug : null,
    bannerUrl: resolveCapsuleMediaUrl(
      typeof capsule.banner_url === "string" ? capsule.banner_url : null,
      origin,
    ),
    logoUrl: resolveCapsuleMediaUrl(
      typeof capsule.logo_url === "string" ? capsule.logo_url : null,
      origin,
    ),
  };
}

async function generateUniqueLadderSlug(capsuleId: string, name: string): Promise<string | null> {
  const base = slugify(name).slice(0, 64);
  if (!base.length) return null;

  const candidates = [base];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    candidates.push(`${base}-${randomSlugSuffix()}`);
  }

  for (const candidate of candidates) {
    const existing = await getCapsuleLadderBySlug(capsuleId, candidate);
    if (!existing) {
      return candidate;
    }
  }

  return null;
}

function sanitizeMemberCreateInput(member: CapsuleLadderMemberInput): CapsuleLadderMemberInput {
  const displayName = member.displayName?.trim();
  if (!displayName) {
    throw new CapsuleLadderAccessError(
      "invalid",
      "Each member must include a display name.",
      400,
    );
  }

  const sanitized: CapsuleLadderMemberInput = {
    displayName,
  };
  if (member.userId !== undefined) {
    sanitized.userId = normalizeId(member.userId);
  }
  if (member.handle !== undefined) {
    const handle = member.handle?.trim();
    sanitized.handle = handle?.length ? handle : null;
  }
  if (member.seed !== undefined) sanitized.seed = member.seed;
  if (member.rank !== undefined) sanitized.rank = member.rank;
  if (member.rating !== undefined) sanitized.rating = member.rating;
  if (member.wins !== undefined) sanitized.wins = member.wins;
  if (member.losses !== undefined) sanitized.losses = member.losses;
  if (member.draws !== undefined) sanitized.draws = member.draws;
  if (member.streak !== undefined) sanitized.streak = member.streak;
  if (member.metadata !== undefined) sanitized.metadata = member.metadata ?? null;
  return sanitized;
}

function sanitizeMemberUpdateInput(
  patch: CapsuleLadderMemberUpdateInput,
): CapsuleLadderMemberUpdateInput {
  const sanitized: CapsuleLadderMemberUpdateInput = {};
  if (patch.userId !== undefined) {
    sanitized.userId = normalizeId(patch.userId);
  }
  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim();
    if (!name.length) {
      throw new CapsuleLadderAccessError(
        "invalid",
        "Display name cannot be empty.",
        400,
      );
    }
    sanitized.displayName = name;
  }
  if (patch.handle !== undefined) {
    const handle = patch.handle?.trim();
    sanitized.handle = handle?.length ? handle : null;
  }
  if (patch.seed !== undefined) sanitized.seed = patch.seed;
  if (patch.rank !== undefined) sanitized.rank = patch.rank;
  if (patch.rating !== undefined) sanitized.rating = patch.rating;
  if (patch.wins !== undefined) sanitized.wins = patch.wins;
  if (patch.losses !== undefined) sanitized.losses = patch.losses;
  if (patch.draws !== undefined) sanitized.draws = patch.draws;
  if (patch.streak !== undefined) sanitized.streak = patch.streak;
  if (patch.metadata !== undefined) sanitized.metadata = patch.metadata ?? null;
  return sanitized;
}

export async function createCapsuleLadder(
  actorId: string,
  input: CreateCapsuleLadderInput,
): Promise<{ ladder: CapsuleLadderDetail; members: CapsuleLadderMember[] }> {
  const context = await requireCapsuleManager(input.capsuleId, actorId);

  const slug =
    input.slug ?? (await generateUniqueLadderSlug(context.capsuleId, input.name || ""));

  const shouldPublish = Boolean(input.publish);
  const now = new Date().toISOString();
  const status: LadderStatus = shouldPublish ? "active" : input.status ?? "draft";
  const visibility: LadderVisibility = input.visibility ?? "capsule";

  const insertParams: InsertCapsuleLadderParams = {
    capsuleId: context.capsuleId,
    createdById: context.actorId,
    name: normalizeName(input.name),
    slug,
    summary: input.summary ?? null,
    status,
    visibility,
    game: input.game ?? null,
    config: input.config ?? null,
    sections: input.sections ?? null,
    aiPlan: input.aiPlan ?? null,
    meta: input.meta ?? null,
    publishedAt: shouldPublish ? now : null,
    publishedById: shouldPublish ? context.actorId : null,
  };

  const ladder = await insertCapsuleLadderRecord(insertParams);
  let members: CapsuleLadderMember[] = [];
  if (input.members?.length) {
    members = await replaceCapsuleLadderMemberRecords(ladder.id, input.members);
  }

  enqueueCapsuleKnowledgeRefresh(context.capsuleId, null);

  return { ladder, members };
}

export async function updateCapsuleLadder(
  actorId: string,
  ladderId: string,
  input: UpdateCapsuleLadderInput,
): Promise<{ ladder: CapsuleLadderDetail | null; members?: CapsuleLadderMember[] }> {
  const existing = await getCapsuleLadderRecordById(ladderId);
  if (!existing) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }

  await requireCapsuleManager(existing.capsuleId, actorId);

  const shouldPublish = Boolean(input.publish);
  const shouldArchive = Boolean(input.archive);
  const patch: UpdateCapsuleLadderInput & {
    publishedAt?: string | null;
    publishedById?: string | null;
  } = { ...input };

  if (shouldPublish) {
    patch.status = "active";
    patch.publishedAt = new Date().toISOString();
    patch.publishedById = actorId;
  } else if (shouldArchive) {
    patch.status = "archived";
    patch.publishedAt = existing.publishedAt;
    patch.publishedById = existing.publishedById;
  }

  if (patch.name) {
    patch.name = normalizeName(patch.name);
  }

  if (patch.slug === undefined && patch.name && !existing.slug) {
    patch.slug = await generateUniqueLadderSlug(existing.capsuleId, patch.name);
  } else if (patch.slug === "") {
    patch.slug = null;
  }

  const updated = await updateCapsuleLadderRecord(ladderId, patch);

  let members: CapsuleLadderMember[] | undefined;
  if (input.members !== undefined) {
    const nextMembers = input.members ?? [];
    members = await replaceCapsuleLadderMemberRecords(ladderId, nextMembers);
  }

  enqueueCapsuleKnowledgeRefresh(existing.capsuleId, null);

  return members !== undefined ? { ladder: updated, members } : { ladder: updated };
}

export async function deleteCapsuleLadder(actorId: string, ladderId: string): Promise<void> {
  const existing = await getCapsuleLadderRecordById(ladderId);
  if (!existing) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(existing.capsuleId, actorId);
  await deleteCapsuleLadderRecord(ladderId);
  enqueueCapsuleKnowledgeRefresh(existing.capsuleId, null);
}

export async function getCapsuleLadderForViewer(
  ladderId: string,
  viewerId: string | null | undefined,
  options: GetCapsuleLadderOptions = {},
): Promise<{ ladder: CapsuleLadderDetail; members?: CapsuleLadderMember[] }> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }

  const viewer = await resolveCapsuleViewer(ladder.capsuleId, viewerId);
  const canAccess = canViewerAccessLadder(ladder, viewer, false);
  if (!canAccess) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You do not have permission to view this ladder.",
      403,
    );
  }

  let members: CapsuleLadderMember[] | undefined;
  if (options.includeMembers) {
    members = await listCapsuleLadderMemberRecords(ladder.id);
  }

  return members !== undefined ? { ladder, members } : { ladder };
}

export async function listCapsuleLaddersForViewer(
  capsuleId: string,
  viewerId: string | null | undefined,
  options: ListCapsuleLaddersOptions = {},
): Promise<CapsuleLadderSummary[]> {
  const viewer = await resolveCapsuleViewer(capsuleId, viewerId);
  const ladders = await listCapsuleLaddersByCapsule(viewer.capsuleId);

  const includeDrafts =
    options.includeDrafts ?? (viewer.isOwner || MANAGER_ROLES.has(viewer.role ?? ""));
  const includeArchived =
    options.includeArchived ?? (viewer.isOwner || MANAGER_ROLES.has(viewer.role ?? ""));

  return ladders.filter((ladder) => {
    if (!includeArchived && ladder.status === "archived") {
      return false;
    }
    if (!includeDrafts && ladder.status === "draft") {
      return false;
    }
    return canViewerAccessLadder(ladder, viewer, includeDrafts);
  });
}

export async function getRecentLaddersForViewer(
  viewerId: string,
  options: { limit?: number; origin?: string | null } = {},
): Promise<DiscoverLadderSummary[]> {
  const normalizedViewer = normalizeId(viewerId);
  if (!normalizedViewer) return [];

  const origin = options.origin ?? null;
  const requestedLimit = typeof options.limit === "number" ? Math.floor(options.limit) : 12;
  const limit = Math.min(Math.max(requestedLimit, 1), 32);
  const fetchLimit = Math.max(limit * 2, limit + 8);

  const candidateLadders: CapsuleLadderSummary[] = [];

  const participation = await listLaddersByParticipant(normalizedViewer, { limit: fetchLimit });
  for (const entry of participation) {
    candidateLadders.push(entry.ladder);
  }

  const viewerCapsules = await listCapsulesForUser(normalizedViewer);
  for (const capsule of viewerCapsules) {
    // Skip follower-only capsules; we only need ladders from spaces the viewer belongs to or owns.
    if (capsule.ownership === "follower") continue;
    const laddersForCapsule = await listCapsuleLaddersForViewer(capsule.id, normalizedViewer, {
      includeArchived: false,
    });
    candidateLadders.push(...laddersForCapsule);
  }

  const sorted = candidateLadders
    .filter((ladder) => {
      const meta = (ladder.meta ?? null) as Record<string, unknown> | null;
      const variant = typeof meta?.variant === "string" ? meta.variant : null;
      if (variant && variant !== "ladder") {
        return false;
      }
      if (ladder.status === "archived") {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.publishedAt ?? a.createdAt) || 0;
      const bTime = Date.parse(b.publishedAt ?? b.createdAt) || 0;
      return bTime - aTime;
    });

  const seen = new Set<string>();
  const capsuleCache = new Map<string, DiscoverLadderSummary["capsule"]>();
  const ladders: DiscoverLadderSummary[] = [];

  for (const ladder of sorted) {
    if (seen.has(ladder.id)) continue;
    seen.add(ladder.id);

    let capsule = ladder.capsuleId ? capsuleCache.get(ladder.capsuleId) ?? null : null;
    if (ladder.capsuleId && !capsuleCache.has(ladder.capsuleId)) {
      const capsuleRow = await findCapsuleById(ladder.capsuleId);
      capsule = mapCapsuleIdentity(capsuleRow, origin);
      capsuleCache.set(ladder.capsuleId, capsule);
    }

    ladders.push({
      ...ladder,
      capsule: capsule ?? null,
    });

    if (ladders.length >= limit) {
      break;
    }
  }

  return ladders;
}

export async function replaceCapsuleLadderMembers(
  actorId: string,
  ladderId: string,
  members: CapsuleLadderMemberInput[],
): Promise<CapsuleLadderMember[]> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);
  return replaceCapsuleLadderMemberRecords(ladder.id, members);
}

export async function listCapsuleLadderMembers(
  actorId: string,
  ladderId: string,
): Promise<CapsuleLadderMember[]> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);
  return listCapsuleLadderMemberRecords(ladder.id);
}

export async function addCapsuleLadderMembers(
  actorId: string,
  ladderId: string,
  members: CapsuleLadderMemberInput[],
): Promise<CapsuleLadderMember[]> {
  if (!members.length) return listCapsuleLadderMembers(actorId, ladderId);
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);
  const sanitized = members.map(sanitizeMemberCreateInput);
  return insertCapsuleLadderMemberRecords(ladder.id, sanitized);
}

export async function updateCapsuleLadderMember(
  actorId: string,
  ladderId: string,
  memberId: string,
  patch: CapsuleLadderMemberUpdateInput,
): Promise<CapsuleLadderMember> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);

  const sanitized = sanitizeMemberUpdateInput(patch);
  const updated = await updateCapsuleLadderMemberRecord(ladder.id, memberId, sanitized);
  if (!updated) {
    throw new CapsuleLadderAccessError("not_found", "Member not found.", 404);
  }
  return updated;
}

export async function removeCapsuleLadderMember(
  actorId: string,
  ladderId: string,
  memberId: string,
): Promise<void> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);
  const existing = await getCapsuleLadderMemberRecordById(ladder.id, memberId);
  if (!existing) {
    throw new CapsuleLadderAccessError("not_found", "Member not found.", 404);
  }
  await deleteCapsuleLadderMemberRecord(ladder.id, memberId);
}
