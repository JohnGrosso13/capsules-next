import { getCapsuleMemberRecord, type CapsuleRow } from "./repository";
import { type CapsuleMemberDbRole } from "./roles";
import { normalizeId, CapsuleMembershipError, requireCapsule, normalizeOptionalString } from "./domain/common";

export type CapsuleActorContext = {
  capsuleId: string;
  ownerId: string;
  actorId: string;
  role: CapsuleMemberDbRole | null;
  isOwner: boolean;
  capsule: { id: string; name?: string | null } | null;
};

export type CapsuleViewerPermissions = {
  canManageMembers: boolean;
  canApproveRequests: boolean;
  canInviteMembers: boolean;
  canChangeRoles: boolean;
  canRemoveMembers: boolean;
  canCustomize: boolean;
  canManageLadders: boolean;
  canModerateContent: boolean;
};

function isAdmin(ctx: CapsuleActorContext | null): boolean {
  return Boolean(ctx?.isOwner || ctx?.role === "admin");
}

function isModerator(ctx: CapsuleActorContext | null): boolean {
  return Boolean(ctx?.isOwner || ctx?.role === "admin" || ctx?.role === "moderator");
}

export async function resolveCapsuleActor(
  capsuleId: string,
  actorId: string | null | undefined,
): Promise<CapsuleActorContext> {
  const normalizedActorId = normalizeId(actorId ?? null);
  if (!normalizedActorId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }

  const { capsule, ownerId } = await requireCapsule(capsuleId);
  const capsuleIdValue = normalizeId(capsule.id);
  if (!capsuleIdValue) {
    throw new Error("capsules.permissions: capsule has invalid identifier");
  }
  const capsuleInfo: { id: string; name?: string | null } = {
    id: capsuleIdValue,
    name: normalizeOptionalString((capsule as CapsuleRow | null)?.name ?? null),
  };

  const isOwner = normalizedActorId === ownerId;
  let role: CapsuleMemberDbRole | null = null;
  if (!isOwner) {
    const membership = await getCapsuleMemberRecord(capsuleIdValue, normalizedActorId);
    role = (membership?.role as CapsuleMemberDbRole | null) ?? null;
  }

  return {
    capsuleId: capsuleIdValue,
    ownerId,
    actorId: normalizedActorId,
    role,
    isOwner,
    capsule: capsuleInfo,
  };
}

export function buildCapsuleViewerPermissions(
  actor: { isOwner: boolean; role: CapsuleMemberDbRole | null; capsule?: { id: string; name?: string | null } | null } | null,
): CapsuleViewerPermissions {
  const ctx: CapsuleActorContext | null = actor
    ? {
        capsuleId: "",
        ownerId: "",
        actorId: "",
        role: actor.role,
        isOwner: actor.isOwner,
        capsule: actor.capsule ?? null,
      }
    : null;

  const canManageMembers = isAdmin(ctx);

  return {
    canManageMembers,
    canApproveRequests: canManageMembers,
    canInviteMembers: isModerator(ctx),
    canChangeRoles: canManageMembers,
    canRemoveMembers: canManageMembers,
    canCustomize: isAdmin(ctx),
    canManageLadders: isModerator(ctx),
    canModerateContent: isModerator(ctx),
  };
}

export function canApproveRequests(ctx: CapsuleActorContext): boolean {
  return isAdmin(ctx);
}

export function canInviteMembers(ctx: CapsuleActorContext): boolean {
  return isModerator(ctx);
}

export function canChangeRoles(ctx: CapsuleActorContext): boolean {
  return isAdmin(ctx);
}

export function canRemoveMembers(ctx: CapsuleActorContext): boolean {
  return isAdmin(ctx);
}

export function canCustomizeCapsule(ctx: CapsuleActorContext): boolean {
  return isAdmin(ctx);
}

export function canManageLadders(ctx: CapsuleActorContext): boolean {
  return isModerator(ctx);
}

export function canModerateContent(ctx: CapsuleActorContext): boolean {
  return isModerator(ctx);
}

export function canContributeContent(ctx: CapsuleActorContext): boolean {
  return ctx.isOwner || Boolean(ctx.role);
}

export async function requireCapsuleContentAccess(
  capsuleId: string,
  actorId: string,
): Promise<CapsuleActorContext> {
  const actor = await resolveCapsuleActor(capsuleId, actorId);
  if (!canContributeContent(actor)) {
    throw new CapsuleMembershipError(
      "forbidden",
      "You must join this capsule to contribute content.",
      403,
    );
  }
  return actor;
}

export function canChangeMemberRole(
  actor: CapsuleActorContext,
  target: { isOwner: boolean; role: CapsuleMemberDbRole | null },
  nextRole: CapsuleMemberDbRole,
): boolean {
  if (!canChangeRoles(actor)) return false;
  if (target.isOwner) return false;
  if (nextRole === "owner") return actor.isOwner;

  if (nextRole === "admin" || nextRole === "moderator") {
    return actor.isOwner || actor.role === "admin";
  }

  return true;
}

export function canRemoveMember(
  actor: CapsuleActorContext,
  target: { isOwner: boolean; role: CapsuleMemberDbRole | null },
): boolean {
  if (target.isOwner) return false;
  return canRemoveMembers(actor);
}
