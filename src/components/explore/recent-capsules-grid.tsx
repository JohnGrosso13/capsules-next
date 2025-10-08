import Link from "next/link";

import { cn } from "@/lib/cn";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import type { DiscoverCapsuleSummary } from "@/server/capsules/service";
import promoStyles from "@/components/promo-row.module.css";
import styles from "./recent-capsules-grid.module.css";

type RecentCapsulesGridProps = {
  capsules: DiscoverCapsuleSummary[];
};

const RELATIVE_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Infinity, unit: "year" },
];

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeDate(iso: string | null): string | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return null;
  let duration = (timestamp - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return null;
}

function chunkIntoRows<T>(items: T[], size: number, maxRows: number): T[][] {
  const rows: T[][] = [];
  if (size <= 0) return rows;
  for (let index = 0; index < items.length && rows.length < maxRows; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed.length) return "C";
  return trimmed.slice(0, 1).toUpperCase();
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
            Check back soon�?"we highlight the newest community capsules here as soon as they go live.
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
          <div key={`recent-capsules-row-${rowIndex}`} className={cn(promoStyles.row, styles.row)}>
            {row.map((capsule) => {
              const bannerSrc = resolveToAbsoluteUrl(normalizeMediaUrl(capsule.bannerUrl));
              const logoSrc = resolveToAbsoluteUrl(normalizeMediaUrl(capsule.logoUrl));
              const mediaSrc = bannerSrc ?? logoSrc;
              const relativeCreated = formatRelativeDate(capsule.createdAt);
              return (
                <Link
                  key={capsule.id}
                  href={resolveCapsuleLink(capsule)}
                  prefetch={false}
                  className={cn(promoStyles.tile, styles.tile)}
                  aria-label={`Open capsule ${capsule.name}`}
                >
                  <div className={promoStyles.short}>
                    <div className={styles.mediaWrapper}>
                      {mediaSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaSrc}
                          alt={capsule.name}
                          className={styles.media}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className={styles.placeholder} aria-hidden>
                          {getInitial(capsule.name)}
                        </div>
                      )}
                    </div>
                    <div className={promoStyles.overlay}>
                      <div className={styles.overlayCopy}>
                        <span className={cn(promoStyles.overlayLabel, styles.name)}>{capsule.name}</span>
                        {relativeCreated ? (
                          <span className={styles.meta}>{`Created ${relativeCreated}`}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
