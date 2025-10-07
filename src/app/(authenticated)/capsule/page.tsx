import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import { resolveCapsuleGate } from "@/server/capsules/service";
import { ensureSupabaseUser } from "@/lib/auth/payload";

import capTheme from "./capsule.module.css";

export const metadata: Metadata = {
  title: "Capsule - Capsules",
  description: "Your capsule feed built with Next.js + Clerk.",
};

export default async function CapsulePage() {
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

  const { capsules, defaultCapsuleId } = await resolveCapsuleGate(supabaseUserId);

  return (
    <AppPage activeNav="capsule" showPrompter={false}>
      <div className={capTheme.theme}>
        <CapsuleGate capsules={capsules} defaultCapsuleId={defaultCapsuleId} />
      </div>
    </AppPage>
  );
}
