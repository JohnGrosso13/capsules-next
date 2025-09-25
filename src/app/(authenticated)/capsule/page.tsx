import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import { CapsuleSignedIn } from "@/components/capsule-signed-in";

import capTheme from "./capsule.module.css";

export const metadata: Metadata = {
  title: "Capsule - Capsules",
  description: "Your capsule feed built with Next.js + Clerk.",
};

export default function CapsulePage() {
  return (
    <AppPage activeNav="capsule">
      <div className={capTheme.theme}>
        <CapsuleSignedIn />
      </div>
    </AppPage>
  );
}
