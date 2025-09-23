"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignUpButton, SignInButton } from "@clerk/nextjs";

type Props = {
  className?: string;
  variant?: "signup" | "signin";
  hrefWhenSignedIn?: string;
  label?: string;
};

export function LaunchCta({ className, variant = "signup", hrefWhenSignedIn = "/capsule", label = "Launch Capsule" }: Props) {
  return (
    <>
      <SignedOut>
        {variant === "signup" ? (
          <SignUpButton mode="modal">
            <button type="button" className={className}>{label}</button>
          </SignUpButton>
        ) : (
          <SignInButton mode="modal">
            <button type="button" className={className}>{label}</button>
          </SignInButton>
        )}
      </SignedOut>
      <SignedIn>
        <Link href={hrefWhenSignedIn} className={className}>{label}</Link>
      </SignedIn>
    </>
  );
}

