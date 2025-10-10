"use client";

import * as React from "react";
import type { Room } from "livekit-client";

import type { PartyTokenResponse } from "@/server/validation/schemas/party";

type PartyStatus = "idle" | "loading" | "connecting" | "connected";
type PartyAction = "create" | "join" | "leave" | "close" | null;

export type PartySession = {
  partyId: string;
  token: string;
  livekitUrl: string;
  metadata: PartyTokenResponse["metadata"];
  expiresAt: string;
  isOwner: boolean;
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
  handleRoomConnected(room: Room): void;
  handleRoomDisconnected(): void;
};

const PartyContext = React.createContext<PartyContextValue | null>(null);

const PARTY_STORAGE_KEY = "capsule:party:last-session";

type StoredSession = {
  partyId: string;
  isOwner: boolean;
  metadata: PartySession["metadata"];
  expiresAt: string;
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
    };
    window.localStorage.setItem(PARTY_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage errors
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

export function PartyProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<PartyStatus>("idle");
  const [action, setAction] = React.useState<PartyAction>(null);
  const [session, setSession] = React.useState<PartySession | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const roomRef = React.useRef<Room | null>(null);
  const inviteUrl = React.useMemo(() => getInviteUrl(session), [session]);

  React.useEffect(() => {
    if (session) {
      saveSessionSnapshot(session);
    } else if (typeof window !== "undefined") {
      saveSessionSnapshot(null);
    }
  }, [session]);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleRoomConnected = React.useCallback((room: Room) => {
    roomRef.current = room;
    setStatus("connected");
    setAction(null);
  }, []);

  const handleRoomDisconnected = React.useCallback(() => {
    roomRef.current = null;
    setStatus("idle");
    setSession(null);
    setAction(null);
  }, []);

  const createParty = React.useCallback(
    async (options: CreatePartyOptions) => {
      setAction("create");
      setStatus("loading");
      setError(null);
      try {
        const payload = await postJson<PartyTokenResponse>("/api/party", {
          displayName: options.displayName ?? undefined,
          topic: options.topic ?? undefined,
        });
        const nextSession: PartySession = {
          partyId: payload.partyId,
          token: payload.token,
          livekitUrl: payload.livekitUrl,
          metadata: payload.metadata,
          expiresAt: payload.expiresAt,
          isOwner: payload.isOwner,
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
    },
    [],
  );

  const joinParty = React.useCallback(
    async (partyId: string, options: JoinPartyOptions) => {
      const normalizedId = partyId.trim().toLowerCase();
      setAction("join");
      setStatus("loading");
      setError(null);
      try {
        const payload = await postJson<PartyTokenResponse>("/api/party/token", {
          partyId: normalizedId,
          displayName: options.displayName ?? undefined,
        });
        const nextSession: PartySession = {
          partyId: payload.partyId,
          token: payload.token,
          livekitUrl: payload.livekitUrl,
          metadata: payload.metadata,
          expiresAt: payload.expiresAt,
          isOwner: payload.isOwner,
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
    },
    [],
  );

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
