import { canManageLadders, resolveCapsuleActor } from "@/server/capsules/permissions";
import { findCapsuleById } from "@/server/capsules/repository";
import type { LadderStatus, LadderVisibility } from "@/types/ladders";

import { CapsuleLadderAccessError } from "./errors";
import { normalizeId } from "./sanitizers";

export const MANAGER_ROLES = new Set(["owner", "admin", "moderator"]);

export type CapsuleManagerContext = {
  capsuleId: string;
  ownerId: string;
  actorId: string;
  role: string;
};

export async function requireCapsuleManager(
  capsuleId: string,
  actorId: string,
): Promise<CapsuleManagerContext> {
  const actor = await resolveCapsuleActor(capsuleId, actorId);
  if (!canManageLadders(actor)) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You must be a capsule founder, admin, or leader to manage ladders.",
      403,
    );
  }
  return {
    capsuleId: actor.capsuleId,
    ownerId: actor.ownerId,
    actorId: actor.actorId,
    role: actor.role ?? "member",
  };
}

export type CapsuleViewerContext = {
  capsuleId: string;
  viewerId: string | null;
  role: string | null;
  isOwner: boolean;
  isMember: boolean;
};

export async function resolveCapsuleViewer(
  capsuleId: string,
  viewerId: string | null | undefined,
): Promise<CapsuleViewerContext> {
  const normalizedViewerId = normalizeId(viewerId ?? null);
  const actor = normalizedViewerId
    ? await resolveCapsuleActor(capsuleId, normalizedViewerId)
    : await (async () => {
        const normalizedCapsuleId = normalizeId(capsuleId);
        if (!normalizedCapsuleId) {
          throw new CapsuleLadderAccessError("invalid", "A valid capsule identifier is required.", 400);
        }
        const capsule = await findCapsuleById(normalizedCapsuleId);
        if (!capsule?.id) {
          throw new CapsuleLadderAccessError("not_found", "Capsule not found.", 404);
        }
        const ownerId = normalizeId(capsule.created_by_id);
        if (!ownerId) {
          throw new Error("capsule viewer context: capsule missing owner id");
        }
        return {
          capsuleId: normalizedCapsuleId,
          ownerId,
          actorId: "",
          role: null,
          isOwner: false,
          capsule,
        };
      })();

  return {
    capsuleId: actor.capsuleId,
    viewerId: normalizedViewerId,
    role: actor.role ?? null,
    isOwner: actor.isOwner,
    isMember: actor.isOwner || Boolean(actor.role),
  };
}

export function canViewerAccessLadder(
  ladder: { visibility: LadderVisibility; status: LadderStatus; createdById: string },
  context: CapsuleViewerContext,
  includeDrafts: boolean,
): boolean {
  if (context.isOwner || (context.role && MANAGER_ROLES.has(context.role))) {
    return true;
  }

  if (ladder.visibility === "public") {
    return ladder.status !== "draft" || includeDrafts;
  }

  if (ladder.visibility === "capsule") {
    return (
      context.isMember &&
      (ladder.status === "active" || ladder.status === "archived" || includeDrafts)
    );
  }

  // private ladders are restricted to managers or the ladder creator
  if (ladder.visibility === "private") {
    return (
      ladder.createdById === context.viewerId ||
      (context.role !== null && MANAGER_ROLES.has(context.role))
    );
  }

  return false;
}
