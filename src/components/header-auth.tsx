"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/services/auth/client";
import headerStyles from "./primary-header.module.css";

const SEARCH_EVENT_NAME = "capsules:search:open";

export function HeaderAuth() {
  const handleSearchClick = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(SEARCH_EVENT_NAME));
  };

  const { user } = useCurrentUser();
  const headerAvatarStyle = React.useMemo(() => {
    if (!user?.avatarUrl) return undefined;
    return {
      "--header-avatar-image": `url("${user.avatarUrl}")`,
    } as React.CSSProperties;
  }, [user?.avatarUrl]);

  const avatarBoxClass = user?.avatarUrl
    ? `h-10 w-10 ${headerStyles.clerkAvatarBox}`
    : "h-10 w-10";

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        className={headerStyles.iconButton}
        aria-label="Search"
        title="Search"
        onClick={handleSearchClick}
        data-intent="open_search"
      >
        <MagnifyingGlass className={headerStyles.iconSvg} weight="duotone" />
      </button>
      <SignedOut>
        <SignInButton mode="modal">
          <Button
            variant="gradient"
            size="md"
            className="inline-flex min-w-[150px] shadow-lg"
            type="button"
          >
            Sign in
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div
          className={`${headerStyles.iconButton} ${headerStyles.avatarButton} ${
            user?.avatarUrl ? headerStyles.avatarButtonCustom : ""
          }`.trim()}
          data-has-avatar={Boolean(user?.avatarUrl)}
          style={headerAvatarStyle}
        >
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                /* Fill the 40px circle for stronger presence, hide Clerk fallback when custom avatar exists */
                avatarBox: avatarBoxClass,
              },
            }}
          />
        </div>
      </SignedIn>
    </div>
  );
}
