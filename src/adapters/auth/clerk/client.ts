"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";

import type { AuthClientAdapter, AuthClientState, AuthClientUser } from "@/ports/auth-client";

type CapsulesProfile = {
  id: string | null;
  name: string | null;
  avatarUrl: string | null;
};

const DEFAULT_PROFILE: CapsulesProfile = { id: null, name: null, avatarUrl: null };
const PROFILE_UPDATE_EVENTS = ["capsules:avatar-updated", "capsules:profile-updated"] as const;

let cachedProfile: CapsulesProfile | null = null;
let cachedProfileUserId: string | null = null;
let inflightProfilePromise: Promise<CapsulesProfile> | null = null;

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeProfileResponse(payload: unknown): CapsulesProfile {
  if (!payload || typeof payload !== "object") return DEFAULT_PROFILE;
  const record = payload as Record<string, unknown>;
  const avatar = normalizeString(record.avatarUrl);
  const name = normalizeString(record.name);
  const rawId = record.id;
  const id =
    typeof rawId === "string"
      ? normalizeString(rawId)
      : typeof rawId === "number"
        ? String(rawId)
        : null;
  return {
    id,
    name,
    avatarUrl: avatar,
  };
}

function mergeProfile(base: CapsulesProfile, updates: Partial<CapsulesProfile>): CapsulesProfile {
  return {
    id: updates.id === undefined ? base.id : updates.id ?? null,
    name: updates.name === undefined ? base.name : updates.name ?? null,
    avatarUrl:
      updates.avatarUrl === undefined ? base.avatarUrl : updates.avatarUrl ?? null,
  };
}

async function fetchCapsulesProfile(): Promise<CapsulesProfile> {
  if (cachedProfile && cachedProfileUserId) {
    return cachedProfile;
  }
  if (inflightProfilePromise) {
    return inflightProfilePromise;
  }
  inflightProfilePromise = (async () => {
    try {
      const response = await fetch("/api/account/profile", { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Profile request failed with status ${response.status}`);
      }
      const json = await response.json().catch(() => null);
      const profile = normalizeProfileResponse(json);
      cachedProfile = profile;
      return profile;
    } catch (error) {
      console.error("capsules auth: failed to load account profile", error);
      if (!cachedProfile) {
        cachedProfile = DEFAULT_PROFILE;
      }
      return cachedProfile;
    } finally {
      inflightProfilePromise = null;
    }
  })();
  return inflightProfilePromise;
}

function updateCachedProfile(updates: Partial<CapsulesProfile>) {
  const current = cachedProfile ?? DEFAULT_PROFILE;
  cachedProfile = mergeProfile(current, updates);
}

function useCapsulesProfile(enabled: boolean, clerkUserId: string | null): CapsulesProfile {
  const [profile, setProfile] = React.useState<CapsulesProfile>(() => cachedProfile ?? DEFAULT_PROFILE);

  React.useEffect(() => {
    if (!enabled || !clerkUserId) {
      if (!enabled) {
        cachedProfile = null;
        cachedProfileUserId = null;
      }
      setProfile(DEFAULT_PROFILE);
      return;
    }

    if (cachedProfileUserId !== clerkUserId) {
      cachedProfileUserId = clerkUserId;
      cachedProfile = null;
    }

    let active = true;
    void fetchCapsulesProfile().then((loadedProfile) => {
      if (!active) return;
      setProfile(loadedProfile);
    });

    return () => {
      active = false;
    };
  }, [enabled, clerkUserId]);

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail =
        (event as CustomEvent<{ avatarUrl?: unknown; name?: unknown }>).detail ?? {};
      const nextAvatar =
        "avatarUrl" in detail
          ? detail.avatarUrl === null
            ? null
            : normalizeString(detail.avatarUrl)
          : undefined;
      const nextName =
        "name" in detail ? normalizeString(detail.name) ?? null : undefined;

      if (nextAvatar === undefined && nextName === undefined) {
        return;
      }

      const updates: Partial<CapsulesProfile> = {};
      if (nextAvatar !== undefined) {
        updates.avatarUrl = nextAvatar;
      }
      if (nextName !== undefined) {
        updates.name = nextName;
      }

      if (clerkUserId) {
        cachedProfileUserId = clerkUserId;
      }

      updateCachedProfile(updates);
      setProfile((prev) => mergeProfile(prev, updates));
    };

    PROFILE_UPDATE_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handler as EventListener);
    });

    return () => {
      PROFILE_UPDATE_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handler as EventListener);
      });
    };
  }, [clerkUserId, enabled]);

  return profile;
}

const adapter: AuthClientAdapter = {
  useCurrentUser(): AuthClientState {
    const { user, isLoaded } = useUser();
    const capsulesProfile = useCapsulesProfile(isLoaded && Boolean(user), user?.id ?? null);

    const mappedUser = React.useMemo<AuthClientUser | null>(() => {
      if (!isLoaded || !user) {
        return null;
      }
      const baseName =
        (user.fullName && user.fullName.trim()) ||
        (user.username && user.username.trim()) ||
        (user.firstName && user.firstName.trim()) ||
        (user.lastName && user.lastName.trim()) ||
        user.primaryEmailAddress?.emailAddress ||
        null;

      const resolvedName = capsulesProfile.name ?? baseName;
      const resolvedAvatar = capsulesProfile.avatarUrl ?? user.imageUrl ?? null;

      return {
        id: user.id,
        key: user.username ? `clerk:${user.username}` : `clerk:${user.id}`,
        name: resolvedName,
        email: user.primaryEmailAddress?.emailAddress ?? null,
        avatarUrl: resolvedAvatar,
        provider: "clerk",
      };
    }, [capsulesProfile.avatarUrl, capsulesProfile.name, isLoaded, user]);

    if (!isLoaded) {
      return { user: null, isLoaded: false };
    }

    return { user: mappedUser, isLoaded: true };
  },
};

export function getClerkAuthClientAdapter(): AuthClientAdapter {
  return adapter;
}
