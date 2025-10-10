"use client";

import * as React from "react";
import Link from "next/link";

import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import styles from "./discovery-rail.module.css";

type Item = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
  href?: string;
  avatarUrl?: string | null;
  avatarInitial?: string | null;
};

type SectionAction =
  | { label: string; href: string }
  | { label: string; onClick: () => void }
  | null;

function Section({
  title,
  items,
  action,
  emptyMessage,
}: {
  title: string;
  items: Item[];
  action?: SectionAction;
  emptyMessage?: string;
}) {
  const renderAction = () => {
    if (!action) return null;
    if ("href" in action) {
      return (
        <Link href={action.href} className={styles.actionLink}>
          {action.label}
        </Link>
      );
    }
    if ("onClick" in action) {
      return (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      );
    }
    return null;
  };

  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {renderAction()}
      </header>
      {items.length ? (
        <ul className={styles.list}>
          {items.map((item) => {
            const avatar = item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.avatarUrl} alt="" className={styles.avatarImage} />
            ) : (
              item.avatarInitial ?? null
            );

            const body = (
              <>
                <div className={styles.avatar} aria-hidden>
                  {avatar}
                </div>
                <div className={styles.itemBody}>
                  <div className={styles.itemTitleRow}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
                  </div>
                  {item.subtitle ? <div className={styles.itemSub}>{item.subtitle}</div> : null}
                  {item.meta ? <div className={styles.itemMeta}>{item.meta}</div> : null}
                </div>
              </>
            );

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className={styles.listItem} prefetch={false}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.listItem}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : emptyMessage ? (
        <div className={styles.empty}>{emptyMessage}</div>
      ) : null}
    </section>
  );
}

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

function formatRelativeDate(iso: string | null | undefined): string | null {
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

const FALLBACK_CAPSULES: Item[] = [
  { id: "c1", title: "Creator Studio", subtitle: "Brand design + prompts", meta: "12k members" },
  { id: "c2", title: "AI Photography", subtitle: "Midjourney, SDXL tips", meta: "8.2k members" },
  { id: "c3", title: "Music Makers", subtitle: "DAW workflows + samples", meta: "4.5k members" },
];

export function DiscoveryRail() {
  const [recommendedCapsules, setRecommendedCapsules] = React.useState<Item[]>(FALLBACK_CAPSULES);
  const [loadingCapsules, setLoadingCapsules] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const loadCapsules = async () => {
      setLoadingCapsules(true);
      try {
        const response = await fetch("/api/explore/recent-capsules?limit=12", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401) {
            return;
          }
          throw new Error(`recent capsules request failed (${response.status})`);
        }
        const payload = (await response.json().catch(() => null)) as {
          capsules?: Array<{
            id: string;
            name: string;
            slug: string | null;
            bannerUrl: string | null;
            logoUrl: string | null;
            createdAt: string | null;
          }>;
        } | null;
        if (!payload?.capsules?.length) {
          if (!cancelled) {
            setRecommendedCapsules([]);
          }
          return;
        }
        const items: Item[] = payload.capsules.slice(0, 3).map((capsule) => {
          const logo = resolveToAbsoluteUrl(normalizeMediaUrl(capsule.logoUrl));
          const banner = resolveToAbsoluteUrl(normalizeMediaUrl(capsule.bannerUrl));
          const avatarUrl = logo ?? banner;
          const relative = formatRelativeDate(capsule.createdAt);
          const subtitle = capsule.slug ? `@${capsule.slug}` : "New capsule";
          const meta = relative ? `Created ${relative}` : "Just launched";
          return {
            id: capsule.id,
            title: capsule.name,
            subtitle,
            meta,
            href: `/capsule?capsuleId=${encodeURIComponent(capsule.id)}`,
            avatarUrl,
            avatarInitial: capsule.name ? capsule.name.trim().slice(0, 1).toUpperCase() : "C",
          };
        });
        if (!cancelled) {
          setRecommendedCapsules(items);
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        if (process.env.NODE_ENV === "development") {
          console.warn("discovery-rail: failed to load recent capsules", error);
        }
        if (!cancelled) {
          setRecommendedCapsules(FALLBACK_CAPSULES);
        }
      } finally {
        if (!cancelled) {
          setLoadingCapsules(false);
        }
      }
    };

    void loadCapsules();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const events: Item[] = [
    { id: "e1", title: "Weekly Capsule Lab", subtitle: "Today 5:00 PM", badge: "LIVE" },
    { id: "e2", title: "Prompt Jam #27", subtitle: "Tomorrow 3:00 PM", meta: "RSVP 210" },
  ];
  const trending: Item[] = [
    { id: "t1", title: "What's Hot", subtitle: "AI logos in 60s", meta: "2.1k watching" },
    { id: "t2", title: "Capsules x Stream", subtitle: "OBS scene presets", meta: "1.3k watching" },
  ];

  return (
    <div className={styles.container}>
      {/* Chat-like shell so this rail can become live chat later */}
      <div className={styles.shell}>
        <Section
          title="Recommended Capsules"
          items={recommendedCapsules}
          action={{ label: "See all", href: "/explore" }}
          emptyMessage={
            loadingCapsules ? "Loading recommendations..." : "No new capsules yet. Check again soon!"
          }
        />
        <Section title="Upcoming Events" items={events} action={{ label: "Calendar", onClick: () => {} }} />
        <Section title="What's Hot" items={trending} action={{ label: "More", onClick: () => {} }} />
      </div>
    </div>
  );
}

export default DiscoveryRail;
