import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";

export const metadata: Metadata = {
  title: "Capsules Market",
  description: "Manage storefront collaborations and AI-powered commerce tools.",
};

export default function MarketPage() {
  return (
    <AppPage activeNav="market" showPrompter showDiscoveryRightRail>
      <div className={capTheme.storeContent} style={{ padding: "24px 0" }}>
        <div className={capTheme.storeGrid}>
          <section className={capTheme.storePanel}>
            <header className={capTheme.storePanelHeader}>
              <h3 style={{ margin: 0 }}>Seller orders</h3>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                View capsule orders you own with <code>/orders?capsuleId=...</code>.
              </p>
            </header>
            <p className={capTheme.checkoutHint}>
              Paste your capsule id into the query string to see seller order status, shipping, and payment state.
            </p>
            <a className={capTheme.storePrimaryButton} href="/orders?capsuleId=">
              Open seller orders
            </a>
          </section>

          <section className={capTheme.storePanel}>
            <header className={capTheme.storePanelHeader}>
              <h3 style={{ margin: 0 }}>Store setup</h3>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Configure products, shipping options, and checkout inside your capsule&apos;s Store tab.
              </p>
            </header>
            <p className={capTheme.checkoutHint}>
              Open any capsule, switch to the Store tab, and use the Actions menu to edit listings and shipping options.
            </p>
          </section>
        </div>
      </div>
    </AppPage>
  );
}
