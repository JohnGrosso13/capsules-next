"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import headerStyles from "./primary-header.module.css";

export function HeaderAuth() {
  return (
    <div className="flex items-center gap-4">
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
