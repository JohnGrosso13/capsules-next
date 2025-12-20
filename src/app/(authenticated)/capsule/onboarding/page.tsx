import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { CapsuleOnboardingStep } from "@/components/capsule/onboarding/CapsuleOnboardingStep";

import capTheme from "../capsule.module.css";
import styles from "./onboarding.module.css";

export const metadata: Metadata = {
  title: "Name your Capsule",
  description: "Kick off your Capsule onboarding experience by choosing the perfect name.",
};

export default async function CapsuleOnboardingPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/capsule/onboarding");
  }

  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/capsule/onboarding");
  }

  return (
    <AppPage activeNav="capsule" showPrompter={false}>
      <div className={capTheme.theme}>
        <div className={styles.page}>
          <CapsuleOnboardingStep />
        </div>
      </div>
    </AppPage>
  );
}
