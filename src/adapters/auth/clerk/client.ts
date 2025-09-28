"use client";

import { useUser } from "@clerk/nextjs";

import type { AuthClientAdapter, AuthClientState } from "@/ports/auth-client";

const adapter: AuthClientAdapter = {
  useCurrentUser(): AuthClientState {
    const { user, isLoaded } = useUser();
    if (!isLoaded) {
      return { user: null, isLoaded: false };
    }
    if (!user) {
      return { user: null, isLoaded: true };
    }
    const name =
      (user.fullName && user.fullName.trim()) ||
      (user.username && user.username.trim()) ||
      (user.firstName && user.firstName.trim()) ||
      (user.lastName && user.lastName.trim()) ||
      user.primaryEmailAddress?.emailAddress ||
      null;

    return {
      user: {
        id: user.id,
        key: user.username ? `clerk:${user.username}` : `clerk:${user.id}`,
        name,
        email: user.primaryEmailAddress?.emailAddress ?? null,
        avatarUrl: user.imageUrl ?? null,
        provider: "clerk",
      },
      isLoaded: true,
    };
  },
};

export function getClerkAuthClientAdapter(): AuthClientAdapter {
  return adapter;
}
