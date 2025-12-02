import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AppPage } from "@/components/app-page";
import { ensureUserSession } from "@/server/actions/session";
import { deriveRequestOrigin } from "@/lib/url";
import {
  loadProfilePageData,
  resolveProfileUserId,
} from "@/server/profile/service";
import { buildProfileHref } from "@/lib/profile/routes";
import ProfilePageClient from "../ProfilePageClient";

type ProfilePageParams = {
  identifier: string;
};

type ProfilePageProps = {
  params: ProfilePageParams | Promise<ProfilePageParams>;
};

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: ProfilePageProps) {
  const resolvedParams = await Promise.resolve(params);
  const session = await ensureUserSession();
  const headerList = await headers();
  const origin = deriveRequestOrigin({ headers: headerList }) ?? null;

  let targetUserId: string;
  try {
    targetUserId = await resolveProfileUserId({
      identifier: resolvedParams.identifier,
      viewerId: session.supabaseUserId,
    });
  } catch (error) {
    console.error("profile.resolve failed", error);
    notFound();
  }

  const data = await loadProfilePageData({
    viewerId: session.supabaseUserId,
    targetUserId,
    origin,
  });

  const canonicalPath = buildProfileHref({
    userId: data.user.id,
    userKey: data.user.key,
  });

  return (
    <AppPage showPrompter={true} activeNav="profile">
      <ProfilePageClient data={data} canonicalPath={canonicalPath} />
    </AppPage>
  );
}
