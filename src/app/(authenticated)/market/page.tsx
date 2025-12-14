import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";

export const metadata: Metadata = {
  title: "Capsules Market",
  description: "Featured capsules and storefronts across the Capsules network.",
};

export default function MarketPage() {
  return (
    <AppPage activeNav="market" showPrompter showDiscoveryRightRail>
      <div className={capTheme.storeContent} style={{ padding: "24px 0" }}>
        <header style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Capsules Market</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            A curated place to discover Capsules with live stores, limited drops, and creator collaborations.
          </p>
        </header>
      </div>
    </AppPage>
  );
}
