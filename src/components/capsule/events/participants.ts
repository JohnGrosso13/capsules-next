import type { CapsuleLadderMember, LadderParticipantType } from "@/types/ladders";

export function extractMemberCapsuleId(member: CapsuleLadderMember | null | undefined): string | null {
  const metadata = member?.metadata as Record<string, unknown> | null;
  const capsuleId =
    metadata && typeof metadata.capsuleId === "string" ? metadata.capsuleId.trim() : null;
  return capsuleId && capsuleId.length ? capsuleId : null;
}

export function buildParticipantPayload(
  challengerId: string,
  opponentId: string,
  mode: string | null,
  lookup: (memberId: string) => CapsuleLadderMember | null,
): {
  participantType: LadderParticipantType;
  challengerCapsuleId?: string | null;
  opponentCapsuleId?: string | null;
} {
  const participantType: LadderParticipantType = mode === "capsule_vs_capsule" ? "capsule" : "member";
  if (participantType !== "capsule") return { participantType };
  const challengerCapsuleId = extractMemberCapsuleId(lookup(challengerId)) ?? null;
  const opponentCapsuleId = extractMemberCapsuleId(lookup(opponentId)) ?? null;
  return { participantType, challengerCapsuleId, opponentCapsuleId };
}
