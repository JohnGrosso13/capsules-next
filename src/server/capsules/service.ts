import { listCapsulesForUser, type CapsuleSummary } from "./repository";

export type { CapsuleSummary };

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
  const defaultCapsuleId = capsules.length === 1 ? capsules[0].id : null;

  return { capsules, defaultCapsuleId };
}

export async function getUserCapsules(
  supabaseUserId: string | null | undefined,
): Promise<CapsuleSummary[]> {
  if (!supabaseUserId) return [];
  return listCapsulesForUser(supabaseUserId);
}
