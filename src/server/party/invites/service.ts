import { fetchPartyMetadata, isUserInParty } from "@/server/livekit/party";
import { publishFriendEvents } from "@/services/realtime/friends";

import {
  expirePendingInvites,
  fetchPendingInvites,
  fetchSentPendingInvites,
  getInviteById,
  updateInviteStatus,
  upsertPendingInvite,
} from "./repository";
import type { PartyInviteSummary, PartyInviteStatus, RawInviteRow } from "./types";
import { PartyInviteError } from "./types";

const DEFAULT_INVITE_TTL_MS: number | null = null; // null = no automatic expiry

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toUserSummary(raw: unknown): PartyInviteSummary["sender"] {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    key: asString(record.user_key),
    name: asString(record.full_name),
    avatarUrl: asString(record.avatar_url),
  };
}

function mapInviteRow(row: RawInviteRow): PartyInviteSummary {
  const id = asString(row.id);
  const partyId = asString(row.party_id);
  const senderId = asString(row.sender_id);
  const recipientId = asString(row.recipient_id);
  if (!id || !partyId || !senderId || !recipientId) {
    throw new Error("party.invites.mapInviteRow: invite row missing identifiers");
  }
  const status = asString(row.status) as PartyInviteStatus | null;
  const expiresAt = asString(row.expires_at);
  const computedStatus =
    status === "pending" && expiresAt && Date.parse(expiresAt) <= Date.now()
      ? "expired"
      : (status ?? "pending");
  return {
    id,
    partyId,
    senderId,
    recipientId,
    status: computedStatus,
    topic: asString(row.topic),
    message: asString(row.message),
    createdAt: asString(row.created_at),
    respondedAt: asString(row.responded_at),
    acceptedAt: asString(row.accepted_at),
    declinedAt: asString(row.declined_at),
    cancelledAt: asString(row.cancelled_at),
    expiresAt,
    sender: toUserSummary(row.sender),
  };
}

function computeExpiry(requestedExpiresAt?: string | null): string | null {
  if (requestedExpiresAt) {
    const parsed = Date.parse(requestedExpiresAt);
    if (!Number.isNaN(parsed) && parsed > Date.now()) {
      return new Date(parsed).toISOString();
    }
  }
  if (typeof DEFAULT_INVITE_TTL_MS === "number" && Number.isFinite(DEFAULT_INVITE_TTL_MS)) {
    return new Date(Date.now() + DEFAULT_INVITE_TTL_MS).toISOString();
  }
  return null;
}

export async function sendPartyInvite(params: {
  senderId: string;
  recipientId: string;
  partyId: string;
  message?: string | null;
}): Promise<PartyInviteSummary> {
  const senderId = params.senderId.trim();
  const recipientId = params.recipientId.trim();
  if (!senderId) {
    throw new PartyInviteError("invalid", "Invitation requires a sender.", 400);
  }
  if (!recipientId) {
    throw new PartyInviteError("invalid", "Choose someone to invite.", 400);
  }
  if (senderId === recipientId) {
    throw new PartyInviteError("invalid", "You cannot invite yourself.", 400);
  }
  const normalizedPartyId = params.partyId.trim().toLowerCase();
  if (!normalizedPartyId) {
    throw new PartyInviteError("invalid", "A valid party id is required.", 400);
  }

  const metadata = await fetchPartyMetadata(normalizedPartyId);
  if (!metadata) {
    throw new PartyInviteError("not_found", "That party is no longer active.", 404);
  }
  if (metadata.ownerId !== senderId) {
    const isParticipant = await isUserInParty(normalizedPartyId, senderId);
    if (!isParticipant) {
      throw new PartyInviteError("forbidden", "Only party members can send invitations.", 403);
    }
  }

  const inviteRow = await upsertPendingInvite({
    partyId: normalizedPartyId,
    senderId,
    recipientId,
    topic: metadata.topic ?? null,
    message: params.message ? params.message.trim().slice(0, 240) : null,
    metadata: {
      ownerDisplayName: metadata.ownerDisplayName ?? null,
      createdAt: metadata.createdAt ?? null,
    },
    expiresAt: computeExpiry(),
  });

  const summary = mapInviteRow(inviteRow);

  await publishFriendEvents([
    {
      userId: recipientId,
      event: {
        type: "party.invite.created",
        payload: { inviteId: summary.id, partyId: summary.partyId },
      },
    },
    {
      userId: senderId,
      event: {
        type: "party.invite.sent",
        payload: { inviteId: summary.id, partyId: summary.partyId },
      },
    },
  ]);

  return summary;
}

export async function listIncomingPartyInvites(userId: string): Promise<PartyInviteSummary[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return [];
  const nowIso = new Date().toISOString();
  await expirePendingInvites(normalizedUserId, nowIso);
  const rows = await fetchPendingInvites(normalizedUserId, nowIso);
  return rows.map((row) => mapInviteRow(row)).filter((invite) => invite.status === "pending");
}

export async function listSentPartyInvites(userId: string): Promise<PartyInviteSummary[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return [];
  const nowIso = new Date().toISOString();
  const rows = await fetchSentPendingInvites(normalizedUserId, nowIso);
  return rows.map((row) => mapInviteRow(row)).filter((invite) => invite.status === "pending");
}

async function requireInvite(inviteId: string): Promise<PartyInviteSummary> {
  const record = await getInviteById(inviteId);
  if (!record) {
    throw new PartyInviteError("not_found", "Invite not found.", 404);
  }
  return mapInviteRow(record);
}

function ensurePending(invite: PartyInviteSummary): void {
  if (invite.status !== "pending") {
    throw new PartyInviteError("conflict", "This invitation has already been handled.", 409);
  }
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now()) {
    throw new PartyInviteError("expired", "This invitation has expired.", 410);
  }
}

export async function acceptPartyInvite(
  userId: string,
  inviteId: string,
): Promise<PartyInviteSummary> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new PartyInviteError("invalid", "Authentication required.", 401);
  }
  const invite = await requireInvite(inviteId);
  if (invite.recipientId !== normalizedUserId) {
    throw new PartyInviteError("forbidden", "You are not the recipient of this invite.", 403);
  }
  ensurePending(invite);

  const nowIso = new Date().toISOString();
  const updated = await updateInviteStatus(inviteId, {
    status: "accepted",
    responded_at: nowIso,
    accepted_at: nowIso,
  });
  if (!updated) {
    throw new PartyInviteError("not_found", "We could not update that invite.", 404);
  }
  const summary = mapInviteRow(updated);

  await publishFriendEvents([
    {
      userId: summary.senderId,
      event: {
        type: "party.invite.accepted",
        payload: { inviteId: summary.id, partyId: summary.partyId },
      },
    },
    {
      userId: summary.recipientId,
      event: {
        type: "party.invite.accepted",
        payload: { inviteId: summary.id, partyId: summary.partyId },
      },
    },
  ]);

  return summary;
}

export async function declinePartyInvite(
  userId: string,
  inviteId: string,
): Promise<PartyInviteSummary> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new PartyInviteError("invalid", "Authentication required.", 401);
  }
  const invite = await requireInvite(inviteId);
  if (invite.recipientId !== normalizedUserId) {
    throw new PartyInviteError("forbidden", "You are not the recipient of this invite.", 403);
  }
  ensurePending(invite);

  const nowIso = new Date().toISOString();
  const updated = await updateInviteStatus(inviteId, {
    status: "declined",
    responded_at: nowIso,
    declined_at: nowIso,
  });
  if (!updated) {
    throw new PartyInviteError("not_found", "We could not update that invite.", 404);
  }
  const summary = mapInviteRow(updated);

  await publishFriendEvents([
    {
      userId: summary.senderId,
      event: {
        type: "party.invite.declined",
        payload: { inviteId: summary.id, partyId: summary.partyId },
      },
    },
  ]);

  return summary;
}

export async function cancelPartyInvite(
  userId: string,
  inviteId: string,
): Promise<PartyInviteSummary> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new PartyInviteError("invalid", "Authentication required.", 401);
  }
  const invite = await requireInvite(inviteId);
  if (invite.senderId !== normalizedUserId) {
    throw new PartyInviteError("forbidden", "Only the host can cancel this invite.", 403);
  }
  ensurePending(invite);

  const nowIso = new Date().toISOString();
  const updated = await updateInviteStatus(inviteId, {
    status: "cancelled",
    responded_at: nowIso,
    cancelled_at: nowIso,
  });
  if (!updated) {
    throw new PartyInviteError("not_found", "We could not update that invite.", 404);
  }
  const summary = mapInviteRow(updated);

  await publishFriendEvents([
    {
      userId: summary.recipientId,
      event: {
        type: "party.invite.cancelled",
        payload: { inviteId: summary.id, partyId: summary.partyId },
      },
    },
  ]);

  return summary;
}
