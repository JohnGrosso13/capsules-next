import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import { resolveCapsuleGate, getCapsuleSummaryForViewer } from "@/server/capsules/service";
import { deriveRequestOrigin } from "@/lib/url";
import { ensureSupabaseUser } from "@/lib/auth/payload";

import capTheme from "./capsule.module.css";

export const metadata: Metadata = {
  title: "Capsule - Capsules",
  description: "Your capsule feed built with Next.js + Clerk.",
};

type CapsuleSearchParams = Record<string, string | string[] | undefined>;

type CapsulePageProps = {
  searchParams?: CapsuleSearchParams | Promise<CapsuleSearchParams>;
};

export default async function CapsulePage({ searchParams }: CapsulePageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/capsule");
  }

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/capsule");
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

  const { capsules, defaultCapsuleId } = await resolveCapsuleGate(supabaseUserId, {
    origin: requestOrigin,
  });

  const resolvedSearchParams = (await Promise.resolve(searchParams ?? {})) as CapsuleSearchParams;
  const requestedCapsuleParam = resolvedSearchParams.capsuleId;
  const requestedCapsuleId = Array.isArray(requestedCapsuleParam)
    ? (requestedCapsuleParam[0] ?? null)
    : typeof requestedCapsuleParam === "string"
      ? requestedCapsuleParam
      : null;

  const capsulesWithPreview = [...capsules];
  let selectedCapsuleId: string | null = null;

  if (requestedCapsuleId) {
    if (capsulesWithPreview.some((capsule) => capsule.id === requestedCapsuleId)) {
      selectedCapsuleId = requestedCapsuleId;
    } else {
      const previewCapsule = await getCapsuleSummaryForViewer(requestedCapsuleId, supabaseUserId, { origin: requestOrigin });
      if (previewCapsule) {
        const exists = capsulesWithPreview.some((capsule) => capsule.id === previewCapsule.id);
        if (!exists) {
          capsulesWithPreview.unshift(previewCapsule);
        }
        selectedCapsuleId = previewCapsule.id;
      }
    }
  }
  const switchParam = resolvedSearchParams.switch;
  const shouldForceSelector = Array.isArray(switchParam)
    ? switchParam.some((value) => {
        if (!value) return false;
        const normalized = String(value).toLowerCase();
        return (
          normalized === "1" ||
          normalized === "true" ||
          normalized === "select" ||
          normalized === "switch"
        );
      })
    : typeof switchParam === "string"
      ? ["1", "true", "select", "switch"].includes(switchParam.toLowerCase())
      : false;

  const dedupedCapsules = capsulesWithPreview.filter((capsule, index, list) => {
    return list.findIndex((entry) => entry.id === capsule.id) === index;
  });

  if (!selectedCapsuleId) {
    selectedCapsuleId =
      defaultCapsuleId ?? (dedupedCapsules.length === 1 ? (dedupedCapsules[0]?.id ?? null) : null);
  }

  const hasAnyCapsule = dedupedCapsules.length > 0;
  const initialLiveChatCapsuleId = hasAnyCapsule
    ? (selectedCapsuleId ??
      (dedupedCapsules.length === 1 ? (dedupedCapsules[0]?.id ?? null) : null))
    : null;
  const initialLiveChatCapsule =
    initialLiveChatCapsuleId && hasAnyCapsule
      ? (dedupedCapsules.find((capsule) => capsule.id === initialLiveChatCapsuleId) ?? null)
      : null;

  return (
    <AppPage
      activeNav="capsule"
      showPrompter={false}
      layoutVariant="studio"
      showLiveChatRightRail={true}
      liveChatRailProps={
        hasAnyCapsule
          ? {
              capsuleId: initialLiveChatCapsuleId,
              capsuleName: initialLiveChatCapsule?.name ?? null,
              status: "waiting",
            }
          : { status: "waiting" }
      }
    >
      <div className={capTheme.theme}>
        <CapsuleGate
          capsules={dedupedCapsules}
          defaultCapsuleId={selectedCapsuleId}
          forceSelector={shouldForceSelector}
        />
      </div>
    </AppPage>
  );
}
