"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

export function HeaderAuth() {
  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <SignInButton mode="modal">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-pill border-border/60 bg-surface-muted/70 hover:border-border hover:bg-surface-muted border px-4 backdrop-blur transition"
            type="button"
          >
            Sign in
          </Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div className="rounded-pill border-border/50 bg-surface-elevated/80 flex h-9 w-9 items-center justify-center overflow-hidden border p-1 shadow-xs backdrop-blur">
          <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
        </div>
      </SignedIn>
    </div>
  );
}
