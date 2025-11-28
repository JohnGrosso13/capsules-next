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
  updateLivekitRoomMetadata,
  type LivekitRoomSnapshot,
} from "@/adapters/livekit/server";
import type {
  PartyMetadata,
  PartyPrivacy,
  PartyAssistantSettings,
  PartySummarySettings,
} from "@/server/validation/schemas/party";
import type { SummaryLengthHint } from "@/types/summary";

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

type BuildPartyMetadataParams = {
  partyId: string;
  ownerId: string;
  ownerDisplayName: string | null;
  topic: string | null;
  privacy: PartyPrivacy;
  assistant?: {
    desired?: boolean;
  } | null;
  summary?: {
    enabled?: boolean;
    verbosity?: SummaryLengthHint;
  } | null;
};

const SUMMARY_VERBOSITY_VALUES: SummaryLengthHint[] = ["brief", "medium", "detailed"];

function resolveSummarySettings(input: BuildPartyMetadataParams["summary"]): PartySummarySettings {
  const enabled = input?.enabled ?? false;
  const verbosity = input?.verbosity ?? "medium";
  return {
    enabled,
    verbosity,
  };
}

function resolveAssistantSettings(input: BuildPartyMetadataParams["assistant"]): PartyAssistantSettings {
  const desired = input?.desired ?? true;
  return {
    desired,
    lastRequestedAt: desired ? new Date().toISOString() : null,
    lastDismissedAt: desired ? null : new Date().toISOString(),
  };
}

function coerceSummarySettings(raw: unknown): PartySummarySettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return resolveSummarySettings(null);
  }
  const source = raw as Partial<PartySummarySettings & { verbosity?: unknown; enabled?: unknown }>;
  const enabled =
    typeof source.enabled === "boolean" ? source.enabled : Boolean((source as { enabled?: unknown }).enabled);
  const rawVerbosity = (source as { verbosity?: unknown }).verbosity;
  const verbosity = SUMMARY_VERBOSITY_VALUES.includes(rawVerbosity as SummaryLengthHint)
    ? (rawVerbosity as SummaryLengthHint)
    : "medium";

  const summary: PartySummarySettings = {
    enabled,
    verbosity,
  };

  if ("lastGeneratedAt" in source) {
    summary.lastGeneratedAt =
      typeof source.lastGeneratedAt === "string" || source.lastGeneratedAt === null
        ? source.lastGeneratedAt ?? null
        : undefined;
  }
  if ("memoryId" in source) {
    summary.memoryId =
      typeof source.memoryId === "string" || source.memoryId === null
        ? source.memoryId ?? null
        : undefined;
  }
  if ("lastGeneratedBy" in source) {
    summary.lastGeneratedBy =
      typeof source.lastGeneratedBy === "string" || source.lastGeneratedBy === null
        ? source.lastGeneratedBy ?? null
        : undefined;
  }

  return summary;
}

function mergeSummarySettings(
  base: PartySummarySettings,
  patch: Partial<PartySummarySettings> | null | undefined,
): PartySummarySettings {
  if (patch === null) {
    return resolveSummarySettings(null);
  }
  if (!patch) {
    return coerceSummarySettings(base);
  }

  const next: PartySummarySettings = {
    enabled:
      typeof patch.enabled === "boolean"
        ? patch.enabled
        : typeof base.enabled === "boolean"
          ? base.enabled
          : false,
    verbosity:
      patch.verbosity && SUMMARY_VERBOSITY_VALUES.includes(patch.verbosity)
        ? patch.verbosity
        : base.verbosity ?? "medium",
  };

  if ("lastGeneratedAt" in patch) {
    next.lastGeneratedAt =
      patch.lastGeneratedAt === null || typeof patch.lastGeneratedAt === "string"
        ? patch.lastGeneratedAt ?? null
        : base.lastGeneratedAt ?? null;
  } else if (base.lastGeneratedAt !== undefined) {
    next.lastGeneratedAt = base.lastGeneratedAt ?? null;
  }

  if ("memoryId" in patch) {
    next.memoryId =
      patch.memoryId === null || typeof patch.memoryId === "string"
        ? patch.memoryId ?? null
        : base.memoryId ?? null;
  } else if (base.memoryId !== undefined) {
    next.memoryId = base.memoryId ?? null;
  }

  if ("lastGeneratedBy" in patch) {
    next.lastGeneratedBy =
      patch.lastGeneratedBy === null || typeof patch.lastGeneratedBy === "string"
        ? patch.lastGeneratedBy ?? null
        : base.lastGeneratedBy ?? null;
  } else if (base.lastGeneratedBy !== undefined) {
    next.lastGeneratedBy = base.lastGeneratedBy ?? null;
  }

  return coerceSummarySettings(next);
}

function coerceAssistantSettings(raw: unknown): PartyAssistantSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return resolveAssistantSettings(null);
  }
  const source = raw as Partial<PartyAssistantSettings & { desired?: unknown }>;
  const desired =
    typeof source.desired === "boolean" ? source.desired : Boolean((source as { desired?: unknown }).desired);

  const settings: PartyAssistantSettings = {
    desired,
    lastRequestedAt:
      "lastRequestedAt" in source && typeof source.lastRequestedAt === "string"
        ? source.lastRequestedAt
        : null,
    lastDismissedAt:
      "lastDismissedAt" in source && typeof source.lastDismissedAt === "string"
        ? source.lastDismissedAt
        : null,
  };

  return settings;
}

function mergeAssistantSettings(
  base: PartyAssistantSettings,
  patch: Partial<PartyAssistantSettings> | null | undefined,
): PartyAssistantSettings {
  if (patch === null) {
    return resolveAssistantSettings(null);
  }
  if (!patch) {
    return coerceAssistantSettings(base);
  }

  const desired =
    typeof patch.desired === "boolean"
      ? patch.desired
      : typeof base.desired === "boolean"
        ? base.desired
        : true;

  const next: PartyAssistantSettings = {
    desired,
    lastRequestedAt: base.lastRequestedAt ?? null,
    lastDismissedAt: base.lastDismissedAt ?? null,
  };

  if ("lastRequestedAt" in patch) {
    next.lastRequestedAt =
      patch.lastRequestedAt === null || typeof patch.lastRequestedAt === "string"
        ? patch.lastRequestedAt ?? null
        : base.lastRequestedAt ?? null;
  } else if (desired && !base.lastRequestedAt) {
    next.lastRequestedAt = new Date().toISOString();
  }

  if ("lastDismissedAt" in patch) {
    next.lastDismissedAt =
      patch.lastDismissedAt === null || typeof patch.lastDismissedAt === "string"
        ? patch.lastDismissedAt ?? null
        : base.lastDismissedAt ?? null;
  } else if (!desired) {
    next.lastDismissedAt = new Date().toISOString();
  }

  return coerceAssistantSettings(next);
}

async function persistPartyMetadata(metadata: PartyMetadata): Promise<void> {
  await updateLivekitRoomMetadata(getPartyRoomName(metadata.partyId), metadata);
}

export function buildPartyMetadata(params: BuildPartyMetadataParams): PartyMetadata {
  return {
    partyId: params.partyId,
    ownerId: params.ownerId,
    ownerDisplayName: params.ownerDisplayName,
    topic: params.topic,
    privacy: params.privacy,
    createdAt: new Date().toISOString(),
    assistant: resolveAssistantSettings(params.assistant),
    summary: resolveSummarySettings(params.summary),
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
        privacy: parsed.privacy ?? "friends",
        createdAt: parsed.createdAt ?? new Date().toISOString(),
        assistant: coerceAssistantSettings((parsed as { assistant?: unknown }).assistant),
        summary: coerceSummarySettings((parsed as { summary?: unknown }).summary),
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

type PartyMetadataPatch = {
  ownerDisplayName?: string | null;
  topic?: string | null;
  privacy?: PartyPrivacy;
  summary?: Partial<PartySummarySettings> | null;
  assistant?: Partial<PartyAssistantSettings> | null;
};

export async function updatePartyMetadata(
  partyId: string,
  patch: PartyMetadataPatch,
): Promise<PartyMetadata | null> {
  const current = await fetchPartyMetadata(partyId);
  if (!current) return null;

  const baseSummary = coerceSummarySettings(current.summary);
  const baseAssistant = coerceAssistantSettings(current.assistant);
  const summaryPatch = patch.summary ?? undefined;
  const assistantPatch = patch.assistant ?? undefined;
  let nextSummary = baseSummary;
  let nextAssistant = baseAssistant;

  if (patch.summary === null) {
    nextSummary = resolveSummarySettings(null);
  } else if (summaryPatch) {
    nextSummary = mergeSummarySettings(baseSummary, summaryPatch);
  }

  if (patch.assistant === null) {
    nextAssistant = resolveAssistantSettings(null);
  } else if (assistantPatch) {
    nextAssistant = mergeAssistantSettings(baseAssistant, assistantPatch);
  }

  const { summary: _summary, ...restPatch } = patch;

  const nextMetadata: PartyMetadata = {
    ...current,
    ...restPatch,
    assistant: nextAssistant,
    summary: nextSummary,
    createdAt: current.createdAt ?? new Date().toISOString(),
  };

  await persistPartyMetadata(nextMetadata);
  return nextMetadata;
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
