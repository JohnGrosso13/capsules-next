import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import styles from "@/components/explore/recent-capsules-grid.module.css";

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

        <div className={capTheme.storeGrid}>
          <section className={capTheme.storePanel}>
            <header className={capTheme.storePanelHeader}>
              <h3 style={{ margin: 0 }}>Featured Capsules</h3>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Hand-picked Capsules with polished storefronts, reliable fulfillment, and active communities.
              </p>
            </header>
            <div className={styles.grid}>
              <article className={styles.card}>
                <div className={styles.thumb} />
                <div className={styles.body}>
                  <h4 className={styles.title}>Aim Lab Arena</h4>
                  <p className={styles.subtitle}>Training-focused Capsule with merch, coaching bundles, and ladder rewards.</p>
                </div>
              </article>
              <article className={styles.card}>
                <div className={styles.thumb} />
                <div className={styles.body}>
                  <h4 className={styles.title}>Cozy Vibes Cafe</h4>
                  <p className={styles.subtitle}>Creator hangout with seasonal drops, stickers, and supporter packs.</p>
                </div>
              </article>
              <article className={styles.card}>
                <div className={styles.thumb} />
                <div className={styles.body}>
                  <h4 className={styles.title}>Weekend Tournament Hub</h4>
                  <p className={styles.subtitle}>Weekly bracket Capsule with jersey pre-orders and prize bundles.</p>
                </div>
              </article>
            </div>
          </section>

          <section className={capTheme.storePanel}>
            <header className={capTheme.storePanelHeader}>
              <h3 style={{ margin: 0 }}>Trending this week</h3>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Capsules seeing a spike in sales, new launches, or featured collaborations.
              </p>
            </header>
            <ul className={styles.list}>
              <li className={styles.listItem}>
                <div className={styles.listMeta}>
                  <span className={styles.listTitle}>Daily Clips Capsule</span>
                  <span className={styles.listTag}>New drop</span>
                </div>
                <p className={styles.listSubtitle}>Creator-branded desk mats and limited print posters.</p>
              </li>
              <li className={styles.listItem}>
                <div className={styles.listMeta}>
                  <span className={styles.listTitle}>Coaching Capsule</span>
                  <span className={styles.listTag}>Bundle</span>
                </div>
                <p className={styles.listSubtitle}>Session credits packaged with merch and replay reviews.</p>
              </li>
              <li className={styles.listItem}>
                <div className={styles.listMeta}>
                  <span className={styles.listTitle}>Charity Capsule</span>
                  <span className={styles.listTag}>Spotlight</span>
                </div>
                <p className={styles.listSubtitle}>Limited shirts with proceeds going to a rotating cause.</p>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </AppPage>
  );
}
