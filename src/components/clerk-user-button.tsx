"use client";

import * as React from "react";
import { UserButton } from "@clerk/nextjs";
import { IdentificationBadge, ShoppingBagOpen } from "@phosphor-icons/react/dist/ssr";

import { buildUserButtonAppearance } from "@/lib/clerk/appearance";
import { buildProfileHref } from "@/lib/profile/routes";
import { useCurrentUser } from "@/services/auth/client";

type ClerkUserButtonProps = Omit<React.ComponentProps<typeof UserButton>, "appearance"> & {
  avatarBoxClassName?: string;
  profileHref?: string;
};

export function ClerkUserButton({
  avatarBoxClassName,
  profileHref,
  afterSignOutUrl,
  ...props
}: ClerkUserButtonProps) {
  const { user: _user } = useCurrentUser();

  const resolvedProfileHref = React.useMemo(() => {
    if (profileHref) return profileHref;
    // Prefer self alias to avoid invalid identifiers (e.g., Clerk ids that are not UUIDs)
    return buildProfileHref("me") ?? "/profile/me";
  }, [profileHref]);

  const appearance = React.useMemo(
    () => buildUserButtonAppearance({ avatarBoxClassName: avatarBoxClassName ?? "" }),
    [avatarBoxClassName],
  );

  return (
    <UserButton
      appearance={appearance}
      afterSignOutUrl={afterSignOutUrl ?? "/"}
      {...(props as Record<string, unknown>)}
    >
      <UserButton.MenuItems>
      <UserButton.Action label="manageAccount" />
      <UserButton.Link
        label="My orders"
        href="/create/mystore/orders"
        labelIcon={<ShoppingBagOpen size={18} weight="duotone" />}
      />
      <UserButton.Link
        label="Profile"
        href={resolvedProfileHref}
        labelIcon={<IdentificationBadge size={18} weight="duotone" />}
      />
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
  );
}
