import * as React from "react";

import { cn } from "@/lib/cn";

import styles from "./capsule-promo-tile.module.css";

type CapsulePromoTileProps = {
  name: string;
  slug?: string | null;
  bannerUrl?: string | null;
  logoUrl?: string | null;
  badgeLabel?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  header?: React.ReactNode;
  description?: string | null;
  actionLabel?: string | null;
  actionSlot?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  showSlug?: boolean;
};

function getInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "C";
  return trimmed.charAt(0).toUpperCase();
}

export function CapsulePromoTile({
  name,
  slug,
  bannerUrl,
  logoUrl,
  badgeLabel,
  headline,
  subheadline,
  header,
  description,
  actionLabel,
  actionSlot,
  className,
  style,
  showSlug = true,
}: CapsulePromoTileProps): React.JSX.Element {
  const normalizedBanner = typeof bannerUrl === "string" && bannerUrl.trim().length ? bannerUrl : null;
  const normalizedSlug =
    showSlug && typeof slug === "string" && slug.trim().length
      ? slug.trim().replace(/^@/, "")
      : null;
  const hasLogo = typeof logoUrl === "string" && logoUrl.trim().length > 0;
  const hasBanner = Boolean(normalizedBanner);

  const headerContent =
    header ??
    ((badgeLabel || headline || subheadline) && (
      <div className={styles.header}>
        {badgeLabel ? <span className={styles.badge}>{badgeLabel}</span> : null}
        {headline ? <p className={styles.headline}>{headline}</p> : null}
        {subheadline ? <p className={styles.subheadline}>{subheadline}</p> : null}
      </div>
    ));

  const actionContent =
    actionSlot ??
    (actionLabel ? <span className={styles.cta}>{actionLabel}</span> : null);

  return (
    <div
      className={cn(styles.tile, className)}
      data-has-banner={hasBanner ? "true" : "false"}
      style={style}
    >
      <div
        className={styles.banner}
        style={hasBanner ? { backgroundImage: `url(${normalizedBanner})` } : undefined}
        aria-hidden="true"
      />
      <div className={styles.content}>
        {headerContent}
        <div className={styles.identityBlock}>
          <div className={styles.identityText}>
            <span className={styles.name}>{name}</span>
            {normalizedSlug ? <span className={styles.slug}>@{normalizedSlug}</span> : null}
          </div>
          <span className={styles.logo} aria-hidden="true">
            {hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl ?? undefined} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className={styles.logoInitial}>{getInitial(name)}</span>
            )}
          </span>
          {description ? <span className={styles.description}>{description}</span> : null}
          {actionContent ? <div className={styles.actionSlot}>{actionContent}</div> : null}
        </div>
      </div>
    </div>
  );
}

