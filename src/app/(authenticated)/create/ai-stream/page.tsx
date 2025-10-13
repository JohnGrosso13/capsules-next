import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { AiStreamStudioLayout } from "@/components/create/ai-stream/AiStreamStudioLayout";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { getUserPanelLayouts } from "@/lib/supabase/studio-layouts";
import { getCapsuleSummaryForViewer, resolveCapsuleGate } from "@/server/capsules/service";

// Styles for the studio are imported inside the layout component.

export const metadata: Metadata = {
  title: "AI Stream Studio - Capsules",
  description:
    "Choose the Capsule you want to power with AI Stream Studio before configuring scenes and encoders.",
};

type AiStreamSearchParams = Record<string, string | string[] | undefined>;

type AiStreamStudioPageProps = {
  searchParams?: AiStreamSearchParams | Promise<AiStreamSearchParams>;
};

const STUDIO_LAYOUT_VIEW = "ai-stream-studio";

export default async function AiStreamStudioPage({
  searchParams,
}: AiStreamStudioPageProps): Promise<JSX.Element> {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/create/ai-stream");
  }

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/create/ai-stream");
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

  const { capsules } = await resolveCapsuleGate(supabaseUserId);
  const initialPanelLayouts = await getUserPanelLayouts(supabaseUserId, STUDIO_LAYOUT_VIEW);

  const resolvedSearchParams = (await Promise.resolve(searchParams ?? {})) as AiStreamSearchParams;
  const requestedCapsuleParam = resolvedSearchParams.capsuleId;
  const requestedCapsuleId = Array.isArray(requestedCapsuleParam)
    ? (requestedCapsuleParam[0] ?? null)
    : typeof requestedCapsuleParam === "string"
      ? requestedCapsuleParam
      : null;

  const capsulesWithPreview = [...capsules];
  if (requestedCapsuleId) {
    const alreadyPresent = capsulesWithPreview.some((capsule) => capsule.id === requestedCapsuleId);
    if (!alreadyPresent) {
      const previewCapsule = await getCapsuleSummaryForViewer(requestedCapsuleId, supabaseUserId);
      if (previewCapsule) {
        capsulesWithPreview.unshift(previewCapsule);
      }
    }
  }

  const dedupedCapsules = capsulesWithPreview.filter((capsule, index, list) => {
    return list.findIndex((entry) => entry.id === capsule.id) === index;
  });

  const viewParam = resolvedSearchParams.view;
  const requestedView = Array.isArray(viewParam)
    ? (viewParam[0] ?? null)
    : typeof viewParam === "string"
      ? viewParam
      : null;
  const normalizedView = requestedView ? requestedView.toLowerCase() : null;
  const allowedViews = new Set(["studio", "producer", "encoder"]);
  const resolvedView = allowedViews.has(normalizedView ?? "")
    ? ((normalizedView ?? "studio") as "studio" | "producer" | "encoder")
    : "studio";

  return (
    <AppPage
      activeNav="create"
      showPrompter={false}
      // Use the Capsule layout for a full-width, familiar studio shell
      layoutVariant="capsule"
      // Keep the right rail off for focused studio work
      showLiveChatRightRail={false}
    >
      <AiStreamStudioLayout
        capsules={dedupedCapsules}
        initialView={resolvedView}
        layoutOwnerId={supabaseUserId}
        layoutView={STUDIO_LAYOUT_VIEW}
        initialPanelLayouts={initialPanelLayouts}
      />
    </AppPage>
  );
}
