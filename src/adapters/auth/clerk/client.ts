"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";

import type { AuthClientAdapter, AuthClientState, AuthClientUser } from "@/ports/auth-client";

const adapter: AuthClientAdapter = {
  useCurrentUser(): AuthClientState {
    const { user, isLoaded } = useUser();

    const mappedUser = React.useMemo<AuthClientUser | null>(
      () => {
        if (!isLoaded || !user) {
          return null;
        }
        const name =
          (user.fullName && user.fullName.trim()) ||
          (user.username && user.username.trim()) ||
          (user.firstName && user.firstName.trim()) ||
          (user.lastName && user.lastName.trim()) ||
          user.primaryEmailAddress?.emailAddress ||
          null;

        return {
          id: user.id,
          key: user.username ? `clerk:${user.username}` : `clerk:${user.id}`,
          name,
          email: user.primaryEmailAddress?.emailAddress ?? null,
          avatarUrl: user.imageUrl ?? null,
          provider: "clerk",
        };
      },
      [isLoaded, user],
    );

    if (!isLoaded) {
      return { user: null, isLoaded: false };
    }

    return { user: mappedUser, isLoaded: true };
  },
};

export function getClerkAuthClientAdapter(): AuthClientAdapter {
  return adapter;
}
