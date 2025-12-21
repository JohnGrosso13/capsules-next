import { normalizeId } from "@/server/capsules/domain/common";
import { listCapsuleMembers } from "@/server/capsules/repository/membership";

const ADMIN_ROLES = new Set(["founder", "admin"]);

export async function getCapsuleAdminRecipients(
  capsuleId: string | null | undefined,
  ownerId?: string | null,
): Promise<string[]> {
  const normalizedCapsuleId = normalizeId(capsuleId ?? null);
  if (!normalizedCapsuleId) return [];
  const capsuleIdValue = normalizedCapsuleId as string;

  const recipients = new Set<string>();
  const normalizedOwner = normalizeId(ownerId ?? null);
  if (typeof normalizedOwner === "string" && normalizedOwner.length) {
    recipients.add(normalizedOwner);
  }

  try {
    const members = await listCapsuleMembers(capsuleIdValue, normalizedOwner ?? undefined);
    for (const member of members) {
      const id = normalizeId((member as { userId?: string | null }).userId ?? null);
      if (!id) continue;
      const ensuredId = id as string;
      const role = member.role ?? "";
      if (role && ADMIN_ROLES.has(role)) {
        recipients.add(ensuredId);
      }
    }
  } catch (error) {
    console.warn("notifications.capsule_admins.lookup_failed", { capsuleId: normalizedCapsuleId, error });
  }

  return Array.from(recipients);
}
