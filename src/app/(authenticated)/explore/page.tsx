import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { RecentCapsulesGrid } from "@/components/explore/recent-capsules-grid";
import { FollowedCapsulesRow } from "@/components/explore/followed-capsules-row";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import {
  getFollowedCapsules,
  getFriendOwnedCapsules,
  getRecentCapsules,
  type CapsuleSummary,
} from "@/server/capsules/service";
import { deriveRequestOrigin } from "@/lib/url";

export const metadata: Metadata = {
  title: "Explore Capsules",
  description: "Discover capsules, creators, and events across the Capsules network.",
};

export default async function ExplorePage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/explore");
  }

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/explore");
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

  const recentCapsules = await getRecentCapsules({
    viewerId: supabaseUserId,
    limit: 16,
    origin: requestOrigin,
  });
  const followedCapsules = await getFollowedCapsules(supabaseUserId, {
    origin: requestOrigin,
  });
  const friendCapsules = await getFriendOwnedCapsules(supabaseUserId, {
    origin: requestOrigin,
    limit: 12,
  });

  const similarCapsules: CapsuleSummary[] = recentCapsules.slice(0, 8).map((capsule) => ({
    id: capsule.id,
    name: capsule.name,
    slug: capsule.slug,
    bannerUrl: capsule.bannerUrl,
    storeBannerUrl: capsule.storeBannerUrl,
    promoTileUrl: capsule.promoTileUrl,
    logoUrl: capsule.logoUrl,
    role: null,
    ownership: "follower",
  }));

  return (
    <AppPage activeNav="explore" showPrompter showDiscoveryRightRail>
      <FollowedCapsulesRow capsules={followedCapsules} />
      <FollowedCapsulesRow
        headingId="similar-capsules-heading"
        title="Similar Capsules"
        subtitle="Inspired by what you already explore. These picks are based on the latest community launches."
        emptyMessage="Keep browsing capsules and we’ll surface personalized recommendations here."
        capsules={similarCapsules}
      />
      <FollowedCapsulesRow
        headingId="friends-capsules-heading"
        title="Friends’ Capsules"
        subtitle="See which spaces your friends are running and drop in to support them."
        emptyMessage="None of your friends have launched capsules yet. Once they do, they’ll show up here."
        capsules={friendCapsules}
      />
      <RecentCapsulesGrid capsules={recentCapsules} />
    </AppPage>
  );
}
