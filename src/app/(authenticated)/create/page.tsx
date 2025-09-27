import type { Metadata } from "next";

import { SignedIn, SignedOut } from "@clerk/nextjs";

import { AppPage } from "@/components/app-page";
import { CreateSignedIn } from "@/components/create-signed-in";
import { HeaderAuth } from "@/components/header-auth";
import { LaunchCta } from "@/components/launch-cta";

import styles from "./create.page.module.css";

export const metadata: Metadata = {
  title: "Create with Capsules",
  description: "Generate new ideas, prompts, and automations for your capsule.",
};

export default function CreatePage() {
  return (
    <>
      <SignedIn>
        <AppPage activeNav="create" showPrompter>
          <CreateSignedIn />
        </AppPage>
      </SignedIn>
      <SignedOut>
        <div className={styles.signedOutWrap}>
          <header className={styles.header}>
            <div className={styles.headerInner}>
              <div className={styles.brand}>
                <span className={styles.brandMark} aria-hidden />
                <span className={styles.brandName}>Capsules</span>
              </div>
              <HeaderAuth />
            </div>
          </header>
          <main className={styles.main}>
            <h1 className={styles.heroTitle}>Sign in to start creating</h1>
            <p className={styles.heroSubtitle}>
              Capsules uses AI to help you design posts, automations, and events for your community.
            </p>
            <LaunchCta className={styles.heroCta} label="Launch Capsule" />
          </main>
        </div>
      </SignedOut>
    </>
  );
}
