import Link from "next/link";

import { CapsulePromoTile } from "@/components/capsule/CapsulePromoTile";
import { resolveCapsuleHandle } from "@/lib/capsules/promo-tile";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import type { DiscoverCapsuleSummary } from "@/server/capsules/service";
import promoStyles from "@/components/promo-row.module.css";
import styles from "./recent-capsules-grid.module.css";

type RecentCapsulesGridProps = {
  capsules: DiscoverCapsuleSummary[];
};

function chunkIntoRows<T>(items: T[], size: number, maxRows: number): T[][] {
  const rows: T[][] = [];
  if (size <= 0) return rows;
  for (let index = 0; index < items.length && rows.length < maxRows; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function resolveCapsuleLink(capsule: DiscoverCapsuleSummary): string {
  const query = new URLSearchParams({ capsuleId: capsule.id });
  return `/capsule?${query.toString()}`;
}

export function RecentCapsulesGrid({ capsules }: RecentCapsulesGridProps) {
  const uniqueCapsules = capsules.filter((capsule, index, list) => {
    return list.findIndex((entry) => entry.id === capsule.id) === index;
  });
  const limitedCapsules = uniqueCapsules.slice(0, 16);
  const rows = chunkIntoRows(limitedCapsules, 4, 4);

  if (!rows.length) {
    return (
      <section className={styles.section} aria-labelledby="recent-capsules-heading">
        <header className={styles.header}>
          <h1 id="recent-capsules-heading" className={styles.title}>
            Recently Created Capsules
          </h1>
          <p className={styles.subtitle}>
            Discover brand-new spaces as soon as they launch. Once new capsules are created, we&rsquo;ll
            surface them here so you can be among the first to explore.
          </p>
        </header>
        <div className={styles.empty} role="status">
          <span className={styles.emptyTitle}>No new capsules yet</span>
          <p className={styles.emptySubtitle}>
            Check back soon&mdash;we highlight the newest community capsules here as soon as they go live.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="recent-capsules-heading">
      <header className={styles.header}>
        <h1 id="recent-capsules-heading" className={styles.title}>
          Recently Created Capsules
        </h1>
        <p className={styles.subtitle}>
          Step into fresh communities right after launch. These capsules were created by fellow members in
          the last few days&mdash;join early and help shape the vibe.
        </p>
      </header>
      <div className={styles.rows}>
        {rows.map((row, rowIndex) => (
          <div
            key={`recent-capsules-row-${rowIndex}`}
            className={`${promoStyles.row} ${styles.row}`}
          >
            {row.map((capsule) => {
              const bannerSrc = resolveToAbsoluteUrl(normalizeMediaUrl(capsule.bannerUrl));
              const logoSrc = resolveToAbsoluteUrl(normalizeMediaUrl(capsule.logoUrl));
              const bannerUrl = capsule.promoTileUrl ?? bannerSrc ?? null;
              const logoUrl = logoSrc ?? null;
              const tileCardClass = styles.tileCard ?? "";
              const slugHandle = resolveCapsuleHandle(capsule.slug);
              return (
                <Link
                  key={capsule.id}
                  href={resolveCapsuleLink(capsule)}
                  prefetch={false}
                  className={styles.tile}
                  aria-label={`Open capsule ${capsule.name}`}
                >
                  <CapsulePromoTile
                    name={capsule.name}
                    slug={slugHandle}
                    bannerUrl={bannerUrl}
                    logoUrl={logoUrl}
                    className={tileCardClass}
                    showSlug={false}
                  />
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
