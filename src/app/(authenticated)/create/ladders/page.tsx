import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { CompetitiveStudioLayout } from "@/components/create/competitive/CompetitiveStudioLayout";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { resolveCapsuleGate, getCapsuleSummaryForViewer } from "@/server/capsules/service";

export const metadata: Metadata = {
  title: "Ladders & Tournaments - Capsules",
  description:
    "Build ladders and tournament brackets with Capsule AI handling copy, schedules, and community updates.",
};

type LadderCreateSearchParams = Record<string, string | string[] | undefined>;

type LadderCreatePageProps = {
  searchParams?: LadderCreateSearchParams | Promise<LadderCreateSearchParams>;
};

export default async function LadderCreatePage({
  searchParams,
}: LadderCreatePageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/create/ladders");
  }

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/create/ladders");
  }

  const primaryEmailId = user.primaryEmailAddressId;
  const primaryEmail = primaryEmailId
    ? (user.emailAddresses.find((entry) => entry.id === primaryEmailId)?.emailAddress ?? null)
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

  const headerList = await headers();
  const requestOrigin = deriveRequestOrigin({ headers: headerList }) ?? null;

  const { capsules } = await resolveCapsuleGate(supabaseUserId, {
    origin: requestOrigin,
  });

  const resolvedSearchParams = (await Promise.resolve(searchParams ?? {})) as LadderCreateSearchParams;
  const requestedCapsuleParam = resolvedSearchParams.capsuleId;
  const requestedCapsuleId = Array.isArray(requestedCapsuleParam)
    ? requestedCapsuleParam[0] ?? null
    : typeof requestedCapsuleParam === "string"
      ? requestedCapsuleParam
      : null;

  const capsulesWithPreview = [...capsules];
  if (requestedCapsuleId) {
    const exists = capsulesWithPreview.some((capsule) => capsule.id === requestedCapsuleId);
    if (!exists) {
      const previewCapsule = await getCapsuleSummaryForViewer(requestedCapsuleId, supabaseUserId, {
        origin: requestOrigin,
      });
      if (previewCapsule) {
        capsulesWithPreview.unshift(previewCapsule);
      }
    }
  }

  const dedupedCapsules = capsulesWithPreview.filter((capsule, index, list) => {
    return list.findIndex((entry) => entry.id === capsule.id) === index;
  });

  const initialCapsuleId =
    requestedCapsuleId && dedupedCapsules.some((capsule) => capsule.id === requestedCapsuleId)
      ? requestedCapsuleId
      : null;

  const variantParam = resolvedSearchParams.variant;
  const requestedVariant = Array.isArray(variantParam)
    ? variantParam[0] ?? null
    : typeof variantParam === "string"
      ? variantParam
      : null;
  const initialTab: "ladders" | "tournaments" =
    requestedVariant && requestedVariant.toLowerCase() === "tournament"
      ? "tournaments"
      : "ladders";

  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <CompetitiveStudioLayout
        capsules={dedupedCapsules}
        initialCapsuleId={initialCapsuleId}
        initialTab={initialTab}
      />
    </AppPage>
  );
}
