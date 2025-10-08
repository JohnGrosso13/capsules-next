import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

export const metadata: Metadata = {
  title: "Explore Capsules",
  description: "Discover capsules, creators, and events across the Capsules network.",
};

export default function ExplorePage() {
  return (
    <AppPage activeNav="explore" showPrompter showDiscoveryRightRail>
      <div aria-hidden style={{ minHeight: "clamp(320px, 45vh, 520px)" }} />
    </AppPage>
  );
}
