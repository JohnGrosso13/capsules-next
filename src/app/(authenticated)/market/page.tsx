import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

export const metadata: Metadata = {
  title: "Capsules Market",
  description: "Manage storefront collaborations and AI-powered commerce tools.",
};

export default function MarketPage() {
  return (
    <AppPage activeNav="market" showPrompter showDiscoveryRightRail>
      <div aria-hidden style={{ minHeight: "clamp(320px, 45vh, 520px)" }} />
    </AppPage>
  );
}
