"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import headerStyles from "./primary-header.module.css";

const SEARCH_EVENT_NAME = "capsules:search:open";

export function HeaderAuth() {
  const handleSearchClick = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(SEARCH_EVENT_NAME));
  };

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
        <div className={`${headerStyles.iconButton} ${headerStyles.avatarButton}`}>
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                /* Fill the 40px circle for stronger presence */
                avatarBox: "h-10 w-10",
              },
            }}
          />
        </div>
      </SignedIn>
    </div>
  );
}
