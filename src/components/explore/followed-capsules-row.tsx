"use client";

import Link from "next/link";

import { CapsulePromoTile } from "@/components/capsule/CapsulePromoTile";
import capsuleTileHostStyles from "@/components/capsule/capsule-tile-host.module.css";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "./followed-capsules-row.module.css";

type FollowedCapsulesRowProps = {
  capsules: CapsuleSummary[];
};

function buildCapsuleLink(capsuleId: string): string {
  const params = new URLSearchParams({ capsuleId });
  return `/capsule?${params.toString()}`;
}

export function FollowedCapsulesRow({ capsules }: FollowedCapsulesRowProps) {
  const uniqueCapsules = capsules.filter(
    (capsule, index, list) => list.findIndex((entry) => entry.id === capsule.id) === index,
  );
  const limitedCapsules = uniqueCapsules.slice(0, 8);

  return (
    <section className={styles.section} aria-labelledby="followed-capsules-heading">
      <header className={styles.header}>
        <h1 id="followed-capsules-heading" className={styles.title}>
          Followed Capsules
        </h1>
        <p className={styles.subtitle}>
          Jump back into the capsules you follow. Invite friends, catch up on posts, or unfollow if
          the vibe has changed.
        </p>
      </header>
      {limitedCapsules.length ? (
        <div className={styles.row}>
          {limitedCapsules.map((capsule) => (
            <Link
              key={capsule.id}
              href={buildCapsuleLink(capsule.id)}
              className={styles.tile}
              aria-label={`Open capsule ${capsule.name}`}
              prefetch={false}
            >
              <CapsulePromoTile
                name={capsule.name}
                bannerUrl={capsule.bannerUrl}
                logoUrl={capsule.logoUrl}
                className={capsuleTileHostStyles.tileHost ?? ""}
                showSlug={false}
              />
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <p>You&apos;re not following any capsules yet. Discover some below and hit Follow.</p>
        </div>
      )}
    </section>
  );
}
