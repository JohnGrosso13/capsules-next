"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

type Props = {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  hrefWhenSignedIn?: string;
  label?: string;
  signedOutMode?: "signup" | "signin";
};

export function LaunchCta({
  className,
  variant = "primary",
  size = "lg",
  hrefWhenSignedIn = "/capsule",
  label = "Launch Capsule",
  signedOutMode = "signup",
}: Props) {
  const router = useRouter();
  const launchStyles: CSSProperties = {
    background: "var(--cta-button-gradient, var(--cta-chip-gradient, var(--cta-gradient)))",
  };

  return (
    <>
      <SignedOut>
        {signedOutMode === "signup" ? (
          <SignUpButton mode="modal">
            <Button
              type="button"
              variant={variant}
              size={size}
              className={className}
              style={launchStyles}
            >
              {label}
            </Button>
          </SignUpButton>
        ) : (
          <SignInButton mode="modal">
            <Button
              type="button"
              variant={variant}
              size={size}
              className={className}
              style={launchStyles}
            >
              {label}
            </Button>
          </SignInButton>
        )}
      </SignedOut>
      <SignedIn>
        <Button
          variant={variant}
          size={size}
          className={className}
          style={launchStyles}
          onClick={() => router.push(hrefWhenSignedIn)}
        >
          {label}
        </Button>
      </SignedIn>
    </>
  );
}
