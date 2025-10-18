import "server-only";

import { randomUUID } from "node:crypto";

import {
  DEFAULT_LIVEKIT_TOKEN_TTL_SECONDS,
  ensureLivekitRoom,
  fetchLivekitRoom,
  deleteLivekitRoom,
  issueLivekitAccessToken,
  getLivekitErrorCode,
  listLivekitRoomParticipants,
  type LivekitRoomSnapshot,
} from "@/adapters/livekit/server";
import type { PartyMetadata } from "@/server/validation/schemas/party";

type IssueTokenOptions = {
  identity: string;
  partyId: string;
  displayName?: string | null;
  metadata: PartyMetadata;
  isOwner: boolean;
  ttlSeconds?: number;
};

const PARTY_ROOM_PREFIX = "party-";
const DEFAULT_TTL_SECONDS = DEFAULT_LIVEKIT_TOKEN_TTL_SECONDS; // 2 hours
const MAX_PARTY_CAPACITY = 12;

export function createPartyId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export function getPartyRoomName(partyId: string): string {
  return `${PARTY_ROOM_PREFIX}${partyId}`.toLowerCase();
}

export function buildPartyMetadata(params: {
  partyId: string;
  ownerId: string;
  ownerDisplayName: string | null;
  topic: string | null;
}): PartyMetadata {
  return {
    partyId: params.partyId,
    ownerId: params.ownerId,
    ownerDisplayName: params.ownerDisplayName,
    topic: params.topic,
    createdAt: new Date().toISOString(),
  };
}

export async function ensurePartyRoom(metadata: PartyMetadata): Promise<void> {
  const roomName = getPartyRoomName(metadata.partyId);
  try {
    await ensureLivekitRoom({
      name: roomName,
      metadata,
      maxParticipants: MAX_PARTY_CAPACITY,
      emptyTimeout: 60,
      departureTimeout: 20,
    });
  } catch (error) {
    const code = getLivekitErrorCode(error);
    if (code === "already_exists" || code === "resource_exhausted") {
      return;
    }
    throw error;
  }
}

function coerceMetadata(room: LivekitRoomSnapshot | null): PartyMetadata | null {
  if (!room?.metadata) return null;
  try {
    const parsed = JSON.parse(room.metadata) as PartyMetadata;
    if (parsed && typeof parsed.partyId === "string" && typeof parsed.ownerId === "string") {
      return {
        partyId: parsed.partyId,
        ownerId: parsed.ownerId,
        ownerDisplayName: parsed.ownerDisplayName ?? null,
        topic: parsed.topic ?? null,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
      };
    }
  } catch (error) {
    console.warn("Failed to parse party metadata", error);
  }
  return null;
}

export async function fetchPartyMetadata(partyId: string): Promise<PartyMetadata | null> {
  const roomName = getPartyRoomName(partyId);
  try {
    const room = await fetchLivekitRoom(roomName);
    return coerceMetadata(room);
  } catch (error) {
    const code = getLivekitErrorCode(error);
    if (code === "not_found") {
      return null;
    }
    throw error;
  }
}

export async function isUserInParty(partyId: string, userId: string): Promise<boolean> {
  const normalizedPartyId = partyId.trim().toLowerCase();
  const normalizedUserId = userId.trim();
  if (!normalizedPartyId || !normalizedUserId) {
    return false;
  }
  const roomName = getPartyRoomName(normalizedPartyId);
  try {
    const participants = await listLivekitRoomParticipants(roomName);
    return participants.some((participant) => participant.identity === normalizedUserId);
  } catch (error) {
    const code = getLivekitErrorCode(error);
    if (code === "not_found") {
      return false;
    }
    throw error;
  }
}

export async function deletePartyRoom(partyId: string): Promise<void> {
  const roomName = getPartyRoomName(partyId);
  try {
    await deleteLivekitRoom(roomName);
  } catch (error) {
    const code = getLivekitErrorCode(error);
    if (code === "not_found" || code === "failed_precondition") {
      return;
    }
    throw error;
  }
}

export async function issuePartyToken(options: IssueTokenOptions) {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const roomName = getPartyRoomName(options.partyId);
  const grant = {
    room: roomName,
    roomJoin: true,
    roomAdmin: options.isOwner,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };

  return issueLivekitAccessToken({
    identity: options.identity,
    roomName,
    ttlSeconds,
    displayName: options.displayName ?? null,
    metadata: {
      partyId: options.partyId,
      isOwner: options.isOwner,
      metadata: options.metadata,
    },
    grant,
  });
}
