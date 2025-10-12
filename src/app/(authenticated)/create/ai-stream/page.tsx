import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { AiStreamCapsuleGate } from "@/components/create/ai-stream/AiStreamCapsuleGate";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { getCapsuleSummaryForViewer, resolveCapsuleGate } from "@/server/capsules/service";

import styles from "./ai-stream.page.module.css";

export const metadata: Metadata = {
  title: "AI Stream Studio - Capsules",
  description:
    "Choose the Capsule you want to power with AI Stream Studio before configuring scenes and encoders.",
};

type AiStreamSearchParams = Record<string, string | string[] | undefined>;

type AiStreamStudioPageProps = {
  searchParams?: AiStreamSearchParams | Promise<AiStreamSearchParams>;
};

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

  const { capsules, defaultCapsuleId } = await resolveCapsuleGate(supabaseUserId);

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

  const requestedExists = requestedCapsuleId
    ? dedupedCapsules.find((capsule) => capsule.id === requestedCapsuleId)?.id ?? null
    : null;

  let resolvedDefaultId: string | null = null;
  if (requestedExists) {
    resolvedDefaultId = requestedExists;
  } else if (defaultCapsuleId && dedupedCapsules.some((capsule) => capsule.id === defaultCapsuleId)) {
    resolvedDefaultId = defaultCapsuleId;
  } else if (dedupedCapsules.length === 1) {
    resolvedDefaultId = dedupedCapsules[0]?.id ?? null;
  }

  return (
    <AppPage activeNav="create" showPrompter={false}>
      <div className={styles.wrap}>
        <section className={styles.hero}>
          <span className={styles.heroEyebrow}>AI Stream Studio</span>
          <h1 className={styles.heroTitle}>Route your stream into Capsules</h1>
          <p className={styles.heroSubtitle}>
            Pick the Capsule that will receive your AI-managed broadcast. We&apos;ll map scenes,
            overlays, chat automations, and VOD exports to this destination as we bring the studio
            online.
          </p>
          <div className={styles.heroMeta}>
            <div className={styles.heroMetaItem}>Browser &amp; OBS workflows</div>
            <div className={styles.heroMetaItem}>AI co-producer controls</div>
            <div className={styles.heroMetaItem}>Mux-powered delivery</div>
          </div>
        </section>
        <AiStreamCapsuleGate capsules={dedupedCapsules} defaultCapsuleId={resolvedDefaultId} />
      </div>
    </AppPage>
  );
}
