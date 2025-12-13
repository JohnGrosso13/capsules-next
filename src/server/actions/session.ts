"use server";

import { auth, currentUser } from "@clerk/nextjs/server";

import { ensureSupabaseUser } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { headers } from "next/headers";

export type UserSessionContext = {
  supabaseUserId: string;
  clerkUserId: string;
  primaryEmail: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

export async function ensureUserSession(): Promise<UserSessionContext> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Authentication required");
  }
  const user = await currentUser();
  if (!user) {
    throw new Error("Authentication required");
  }

  const primaryEmailId = user.primaryEmailAddressId;
  const primaryEmail = primaryEmailId
    ? user.emailAddresses.find((entry) => entry.id === primaryEmailId)?.emailAddress ?? null
    : user.emailAddresses[0]?.emailAddress ?? null;

  const fallbackFullName = [user.firstName, user.lastName]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();
  const resolvedFullName = (user.fullName ?? fallbackFullName).trim();
  const normalizedFullName = resolvedFullName.length ? resolvedFullName : null;

  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: primaryEmail ?? null,
    full_name: normalizedFullName,
    avatar_url: user.imageUrl ?? null,
  });

  // Lightweight debug hook to help diagnose Memory issues in dev.
  // This will log which Supabase user id is being used for the current Clerk user.
  if (process.env.NODE_ENV !== "production") {
    console.log("[ensureUserSession] resolved user", {
      supabaseUserId,
      clerkUserId: user.id,
      email: primaryEmail ?? null,
    });
  }

  return {
    supabaseUserId,
    clerkUserId: user.id,
    primaryEmail: primaryEmail ?? null,
    fullName: normalizedFullName,
    avatarUrl: user.imageUrl ?? null,
  };
}

export async function resolveRequestOrigin(): Promise<string | null> {
  const headerList = await Promise.resolve(headers());
  return deriveRequestOrigin({ headers: headerList }) ?? null;
}
