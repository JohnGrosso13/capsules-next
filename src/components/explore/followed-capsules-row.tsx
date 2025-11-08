"use client";

import Link from "next/link";

import { CapsulePromoTile } from "@/components/capsule/CapsulePromoTile";
import capsuleTileHostStyles from "@/components/capsule/capsule-tile-host.module.css";
import { resolveCapsuleHandle, resolveCapsuleTileMedia } from "@/lib/capsules/promo-tile";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "./followed-capsules-row.module.css";

type FollowedCapsulesRowProps = {
  capsules: CapsuleSummary[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  headingId?: string;
};

function buildCapsuleLink(capsuleId: string): string {
  const params = new URLSearchParams({ capsuleId });
  return `/capsule?${params.toString()}`;
}

export function FollowedCapsulesRow({
  capsules,
  title = "Followed Capsules",
  subtitle = "Jump back into the capsules you follow. Invite friends, catch up on posts, or unfollow if the vibe has changed.",
  emptyMessage = "You\u2019re not following any capsules yet. Discover some below and hit Follow.",
  headingId = "followed-capsules-heading",
}: FollowedCapsulesRowProps) {
  const uniqueCapsules = capsules.filter(
    (capsule, index, list) => list.findIndex((entry) => entry.id === capsule.id) === index,
  );
  const limitedCapsules = uniqueCapsules.slice(0, 8);

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <header className={styles.header}>
        <h1 id={headingId} className={styles.title}>
          {title}
        </h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </header>
      {limitedCapsules.length ? (
        <div className={styles.row}>
          {limitedCapsules.map((capsule) => {
            const media = resolveCapsuleTileMedia({
              promoTileUrl: capsule.promoTileUrl ?? null,
              bannerUrl: capsule.bannerUrl ?? null,
              logoUrl: capsule.logoUrl ?? null,
            });
            const slugHandle = resolveCapsuleHandle(capsule.slug);
            return (
              <Link
                key={capsule.id}
                href={buildCapsuleLink(capsule.id)}
                className={styles.tile}
                aria-label={`Open capsule ${capsule.name}`}
                prefetch={false}
              >
                <CapsulePromoTile
                  name={capsule.name}
                  slug={slugHandle}
                  bannerUrl={media.bannerUrl}
                  logoUrl={media.logoUrl}
                  className={capsuleTileHostStyles.tileHost ?? ""}
                  showSlug={false}
                />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <p>{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}
