import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

import { PARTY_INVITE_SELECT } from "./constants";
import type { RawInviteRow } from "./types";

function wrapError(context: string, error: DatabaseError): Error {
  const message = context ? `${context}: ${error.message}` : error.message;
  const wrapped = new Error(message);
  const extended = wrapped as Error & Record<string, unknown>;
  if (error.code) extended.code = error.code;
  if (error.details) extended.details = error.details;
  if (error.hint) extended.hint = error.hint;
  return wrapped;
}

function assertSuccess<T>(result: DatabaseResult<T>, context: string): T {
  if (result.error) {
    throw wrapError(context, result.error);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${context}: missing result data`);
  }
  return result.data;
}

function resultOrNull<T>(result: DatabaseResult<T | null>, context: string): T | null {
  if (result.error) {
    if (result.error.code === "PGRST116") return null;
    throw wrapError(context, result.error);
  }
  return result.data ?? null;
}

export async function upsertPendingInvite(
  payload: {
    partyId: string;
    senderId: string;
    recipientId: string;
    topic: string | null;
    message: string | null;
    metadata: Record<string, unknown> | null;
    expiresAt: string | null;
  },
): Promise<RawInviteRow> {
  const db = getDatabaseAdminClient();

  const existing = await db
    .from("party_invites")
    .select<RawInviteRow>(PARTY_INVITE_SELECT)
    .eq("party_id", payload.partyId)
    .eq("recipient_id", payload.recipientId)
    .eq("status", "pending")
    .maybeSingle();

  const pending = resultOrNull(existing, "party.invites.upsertPending.fetch");

  const record = {
    topic: payload.topic,
    message: payload.message,
    metadata: payload.metadata,
    expires_at: payload.expiresAt,
    status: "pending",
    responded_at: null,
    accepted_at: null,
    declined_at: null,
    cancelled_at: null,
  } as Record<string, unknown>;

  if (pending?.id) {
    const updated = await db
      .from("party_invites")
      .update(record)
      .eq("id", pending.id as string)
      .select<RawInviteRow>(PARTY_INVITE_SELECT)
      .single();
    return assertSuccess(updated, "party.invites.upsertPending.update");
  }

  const inserted = await db
    .from("party_invites")
    .insert([
      {
        party_id: payload.partyId,
        sender_id: payload.senderId,
        recipient_id: payload.recipientId,
        topic: payload.topic,
        message: payload.message,
        metadata: payload.metadata,
        expires_at: payload.expiresAt,
      },
    ])
    .select<RawInviteRow>(PARTY_INVITE_SELECT)
    .single();

  return assertSuccess(inserted, "party.invites.upsertPending.insert");
}

export async function fetchPendingInvites(
  recipientId: string,
  nowIso: string,
): Promise<RawInviteRow[]> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("party_invites")
    .select<RawInviteRow>(PARTY_INVITE_SELECT)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: true })
    .fetch();
  return assertSuccess(result, "party.invites.fetchPending");
}

export async function fetchSentPendingInvites(
  senderId: string,
  nowIso: string,
): Promise<RawInviteRow[]> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("party_invites")
    .select<RawInviteRow>(PARTY_INVITE_SELECT)
    .eq("sender_id", senderId)
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: true })
    .fetch();
  return assertSuccess(result, "party.invites.fetchSentPending");
}

export async function expirePendingInvites(
  userId: string,
  nowIso: string,
): Promise<number> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("party_invites")
    .update({
      status: "expired",
      responded_at: nowIso,
    })
    .eq("recipient_id", userId)
    .eq("status", "pending")
    .lte("expires_at", nowIso)
    .select<Pick<RawInviteRow, "id">>("id")
    .fetch();
  const rows = assertSuccess(result, "party.invites.expirePending");
  return Array.isArray(rows) ? rows.length : 0;
}

export async function getInviteById(inviteId: string): Promise<RawInviteRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("party_invites")
    .select<RawInviteRow>(PARTY_INVITE_SELECT)
    .eq("id", inviteId)
    .maybeSingle();
  return resultOrNull(result, "party.invites.getById");
}

export async function updateInviteStatus(
  inviteId: string,
  updates: Record<string, unknown>,
): Promise<RawInviteRow | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("party_invites")
    .update(updates)
    .eq("id", inviteId)
    .select<RawInviteRow>(PARTY_INVITE_SELECT)
    .maybeSingle();
  return resultOrNull(result, "party.invites.updateStatus");
}
