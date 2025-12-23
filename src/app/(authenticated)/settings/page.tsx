import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { getUserCapsules } from "@/server/capsules/service";
import { deriveRequestOrigin } from "@/lib/url";
import { getUserProfileSummary } from "@/server/users/service";
import { getNotificationSettings } from "@/server/notifications/service";

import { SettingsShell } from "./settings-shell";

export const metadata: Metadata = {
  title: "Capsules Preferences",
  description: "Manage your account and profile.",
};

type SettingsPageProps = {
  searchParams?: { tab?: string } | Promise<{ tab?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/settings");
  }

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/settings");
  }

  const primaryEmailId = user.primaryEmailAddressId;
  const primaryEmail = primaryEmailId
    ? (user.emailAddresses.find((entry) => entry.id === primaryEmailId)?.emailAddress ?? null)
    : (user.emailAddresses[0]?.emailAddress ?? null);

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

  const headerList = await headers();
  const requestOrigin = deriveRequestOrigin({ headers: headerList }) ?? null;

  const allCapsules = await getUserCapsules(supabaseUserId, { origin: requestOrigin });
  const ownedCapsules = allCapsules.filter((capsule) => capsule.ownership === "owner");
  const profileSummary = await getUserProfileSummary(supabaseUserId, { origin: requestOrigin });
  const notificationSettings = await getNotificationSettings(supabaseUserId);

  const accountProfile = {
    id: supabaseUserId,
    name: profileSummary.name ?? normalizedFullName,
    email: primaryEmail ?? null,
    clerkAvatarUrl: user.imageUrl ?? null,
    avatarUrl: profileSummary.avatarUrl ?? null,
  };

  return (
    <AppPage showPrompter={true} activeNav="settings" wideWithoutRightRail>
      <SettingsShell
        initialCapsules={ownedCapsules}
        accountProfile={accountProfile}
        notificationSettings={notificationSettings}
        initialTab={resolvedSearchParams?.tab ?? null}
      />
    </AppPage>
  );
}
