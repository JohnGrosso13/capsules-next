"use client";

import * as React from "react";
import type { Room } from "livekit-client";

import type { PartyTokenResponse } from "@/server/validation/schemas/party";
import { useCurrentUser } from "@/services/auth/client";

type PartyStatus = "idle" | "loading" | "connecting" | "connected";
type PartyAction = "create" | "join" | "leave" | "close" | "resume" | null;

export type PartySession = {
  partyId: string;
  token: string;
  livekitUrl: string;
  metadata: PartyTokenResponse["metadata"];
  expiresAt: string;
  isOwner: boolean;
  displayName: string | null;
};

type CreatePartyOptions = {
  displayName?: string | null;
  topic?: string | null;
};

type JoinPartyOptions = {
  displayName?: string | null;
};

type PartyContextValue = {
  status: PartyStatus;
  action: PartyAction;
  session: PartySession | null;
  error: string | null;
  inviteUrl: string | null;
  createParty(options: CreatePartyOptions): Promise<void>;
  joinParty(partyId: string, options: JoinPartyOptions): Promise<void>;
  leaveParty(): Promise<void>;
  closeParty(): Promise<void>;
  resetError(): void;
  handleRoomReconnecting(): void;
  handleRoomConnected(room: Room): void;
  handleRoomDisconnected(): void;
};

const PartyContext = React.createContext<PartyContextValue | null>(null);

const PARTY_STORAGE_KEY = "capsule:party:last-session";
const PARTY_RESUME_MAX_AGE_MS = 10 * 60 * 1000;

type StoredSession = {
  partyId: string;
  isOwner: boolean;
  metadata: PartySession["metadata"];
  expiresAt: string;
  displayName: string | null;
  lastSeenAt: string;
};

function saveSessionSnapshot(session: PartySession | null) {
  try {
    if (!session) {
      window.localStorage.removeItem(PARTY_STORAGE_KEY);
      return;
    }
    const snapshot: StoredSession = {
      partyId: session.partyId,
      isOwner: session.isOwner,
      metadata: session.metadata,
      expiresAt: session.expiresAt,
      displayName: session.displayName,
      lastSeenAt: new Date().toISOString(),
    };
    window.localStorage.setItem(PARTY_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage errors
  }
}

function loadSessionSnapshot(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PARTY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed || typeof parsed.partyId !== "string") {
      return null;
    }
    if (!parsed.metadata || typeof parsed.metadata !== "object") {
      return null;
    }
    return {
      partyId: parsed.partyId,
      isOwner: Boolean(parsed.isOwner),
      metadata: parsed.metadata as PartySession["metadata"],
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : "",
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
      lastSeenAt:
        typeof parsed.lastSeenAt === "string" ? parsed.lastSeenAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function getInviteUrl(session: PartySession | null): string | null {
  if (!session) return null;
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("party", session.partyId);
    return url.toString();
  } catch {
    return null;
  }
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function deleteJson(url: string): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
  });
  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}

function resolveDisplayName(
  provided: string | null | undefined,
  fallback: string | null,
): string | null {
  if (typeof provided === "string") {
    const trimmed = provided.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  return fallback ?? null;
}

export function PartyProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<PartyStatus>("idle");
  const [action, setAction] = React.useState<PartyAction>(null);
  const [session, setSession] = React.useState<PartySession | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const roomRef = React.useRef<Room | null>(null);
  const resumeAttemptRef = React.useRef(false);
  const inviteUrl = React.useMemo(() => getInviteUrl(session), [session]);
  const { user } = useCurrentUser();
  const fallbackDisplayName = React.useMemo(() => {
    const base = user?.name;
    if (!base) return null;
    const trimmed = base.trim();
    return trimmed.length ? trimmed : null;
  }, [user?.name]);
  const fallbackDisplayNameRef = React.useRef<string | null>(fallbackDisplayName);
  React.useEffect(() => {
    fallbackDisplayNameRef.current = fallbackDisplayName;
  }, [fallbackDisplayName]);

  React.useEffect(() => {
    if (!session) return;
    saveSessionSnapshot(session);
  }, [session, status]);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  React.useEffect(() => {
    if (session || status !== "idle" || resumeAttemptRef.current) {
      return;
    }
    const snapshot = loadSessionSnapshot();
    if (!snapshot) {
      return;
    }
    const lastSeen = Date.parse(snapshot.lastSeenAt);
    if (!Number.isNaN(lastSeen) && Date.now() - lastSeen > PARTY_RESUME_MAX_AGE_MS) {
      saveSessionSnapshot(null);
      return;
    }
    resumeAttemptRef.current = true;
    setAction("resume");
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const resumeDisplayName = resolveDisplayName(
          snapshot.displayName,
          fallbackDisplayNameRef.current,
        );
        const payload = await postJson<PartyTokenResponse>("/api/party/token", {
          partyId: snapshot.partyId,
          displayName: resumeDisplayName ?? undefined,
        });
        const nextSession: PartySession = {
          partyId: payload.partyId,
          token: payload.token,
          livekitUrl: payload.livekitUrl,
          metadata: payload.metadata,
          expiresAt: payload.expiresAt,
          isOwner: payload.isOwner,
          displayName: resumeDisplayName,
        };
        setSession(nextSession);
        setStatus("connecting");
      } catch (resumeError) {
        console.error("Party resume error", resumeError);
        const message =
          resumeError instanceof Error ? resumeError.message : "Unable to reconnect to the party.";
        setError(message);
        setStatus("idle");
        setAction(null);
        saveSessionSnapshot(null);
      } finally {
        resumeAttemptRef.current = false;
      }
    })();
  }, [session, status]);

  const handleRoomConnected = React.useCallback((room: Room) => {
    roomRef.current = room;
    resumeAttemptRef.current = false;
    setStatus("connected");
    setAction(null);
  }, []);

  const handleRoomReconnecting = React.useCallback(() => {
    setStatus((current) => (current === "connected" ? "connecting" : current));
  }, []);

  const handleRoomDisconnected = React.useCallback(() => {
    roomRef.current = null;
    resumeAttemptRef.current = false;
    setStatus("idle");
    setSession(null);
    setAction(null);
  }, []);

  const createParty = React.useCallback(async (options: CreatePartyOptions) => {
    setAction("create");
    setStatus("loading");
    setError(null);
    const resolvedDisplayName = resolveDisplayName(
      options.displayName ?? null,
      fallbackDisplayNameRef.current,
    );
    const topic = options.topic?.trim() || null;
    try {
      const payload = await postJson<PartyTokenResponse>("/api/party", {
        displayName: resolvedDisplayName ?? undefined,
        topic: topic ?? undefined,
      });
      const nextSession: PartySession = {
        partyId: payload.partyId,
        token: payload.token,
        livekitUrl: payload.livekitUrl,
        metadata: payload.metadata,
        expiresAt: payload.expiresAt,
        isOwner: payload.isOwner,
        displayName: resolvedDisplayName,
      };
      setSession(nextSession);
      setStatus("connecting");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to start a party.";
      setError(message);
      setStatus("idle");
      setAction(null);
      setSession(null);
    }
  }, []);

  const joinParty = React.useCallback(async (partyId: string, options: JoinPartyOptions) => {
    const normalizedId = partyId.trim().toLowerCase();
    const resolvedDisplayName = resolveDisplayName(
      options.displayName ?? null,
      fallbackDisplayNameRef.current,
    );
    setAction("join");
    setStatus("loading");
    setError(null);
    try {
      const payload = await postJson<PartyTokenResponse>("/api/party/token", {
        partyId: normalizedId,
        displayName: resolvedDisplayName ?? undefined,
      });
      const nextSession: PartySession = {
        partyId: payload.partyId,
        token: payload.token,
        livekitUrl: payload.livekitUrl,
        metadata: payload.metadata,
        expiresAt: payload.expiresAt,
        isOwner: payload.isOwner,
        displayName: resolvedDisplayName,
      };
      setSession(nextSession);
      setStatus("connecting");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to join the party.";
      setError(message);
      setStatus("idle");
      setAction(null);
      setSession(null);
    }
  }, []);

  const leaveParty = React.useCallback(async () => {
    setAction("leave");
    setStatus("loading");
    try {
      const room = roomRef.current;
      if (room) {
        await room.disconnect(true);
        roomRef.current = null;
      }
    } finally {
      resumeAttemptRef.current = false;
      saveSessionSnapshot(null);
      setSession(null);
      setStatus("idle");
      setAction(null);
    }
  }, []);

  const closeParty = React.useCallback(async () => {
    if (!session) return;
    setAction("close");
    setStatus("loading");
    try {
      await deleteJson(`/api/party/${session.partyId}`);
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Unable to close the party.";
      setError(message);
    } finally {
      const room = roomRef.current;
      if (room) {
        await room.disconnect(true);
      }
      roomRef.current = null;
      resumeAttemptRef.current = false;
      saveSessionSnapshot(null);
      setSession(null);
      setStatus("idle");
      setAction(null);
    }
  }, [session]);

  const value = React.useMemo<PartyContextValue>(
    () => ({
      status,
      action,
      session,
      error,
      inviteUrl,
      createParty,
      joinParty,
      leaveParty,
      closeParty,
      resetError,
      handleRoomReconnecting,
      handleRoomConnected,
      handleRoomDisconnected,
    }),
    [
      status,
      action,
      session,
      error,
      inviteUrl,
      createParty,
      joinParty,
      leaveParty,
      closeParty,
      resetError,
      handleRoomReconnecting,
      handleRoomConnected,
      handleRoomDisconnected,
    ],
  );

  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
}

export function usePartyContext(): PartyContextValue {
  const context = React.useContext(PartyContext);
  if (!context) {
    throw new Error("usePartyContext must be used within a PartyProvider");
  }
  return context;
}
