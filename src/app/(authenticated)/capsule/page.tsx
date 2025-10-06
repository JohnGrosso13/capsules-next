import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import { CapsuleContent } from "@/components/capsule/CapsuleScaffold";

import capTheme from "./capsule.module.css";

export const metadata: Metadata = {
  title: "Capsule - Capsules",
  description: "Your capsule feed built with Next.js + Clerk.",
};

export default function CapsulePage() {
  return (
    <AppPage activeNav="capsule" showPrompter={false}>
      <div className={capTheme.theme}>
        <CapsuleContent />
      </div>
    </AppPage>
  );
}
