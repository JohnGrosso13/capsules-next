"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LandingAuthCard() {
  const router = useRouter();

  return (
    <Card
      variant="soft"
      className="border-border/50 bg-surface-elevated/80 shadow-glow w-full max-w-md border backdrop-blur-xl"
    >
      <SignedOut>
        <CardHeader className="gap-3 items-center text-center">
          <CardTitle className="text-fg text-2xl font-semibold">Start Your Space</CardTitle>
          <CardDescription className="text-fg-subtle text-[15px] leading-6">
            Sign in to launch your Capsule and explore features with our AI prompter.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SignInButton mode="modal">
            <Button className="w-full" size="lg">
              Sign In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="secondary" className="w-full" size="lg">
              Sign Up
            </Button>
          </SignUpButton>
        </CardContent>
      </SignedOut>
      <SignedIn>
        <CardHeader className="flex-row items-start justify-between gap-4 pb-0">
          <div className="border-border/40 bg-surface-muted/70 rounded-2xl border p-1 shadow-xs">
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "h-11 w-11" } }} />
          </div>
          <div className="flex-1 space-y-1">
            <CardTitle className="text-fg text-xl font-semibold">Welcome back</CardTitle>
            <CardDescription className="text-fg-subtle text-[15px] leading-6">
              Jump straight into your capsule or spin up a new one with AI.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="bg-border/60 h-px w-full" />
        </CardContent>
        <CardFooter className="flex flex-col gap-3 pt-0">
          <Button size="lg" className="w-full" onClick={() => router.push("/capsule")}>
            Open my capsule
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => router.push("/create")}
          >
            Create something new
          </Button>
        </CardFooter>
      </SignedIn>
    </Card>
  );
}
