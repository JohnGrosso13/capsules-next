"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";

import { useHomeLoading } from "@/components/home-loading";
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
  date?: string | null;
};

type SectionAction =
  | { label: string; href: string }
  | { label: string; onClick: () => void }
  | null;

type LadderSummaryPayload = {
  id: string;
  capsuleId: string;
  name: string;
  slug: string | null;
  summary: string | null;
  status: "draft" | "active" | "archived";
  visibility: "private" | "capsule" | "public";
  createdById: string;
  game?: { title?: string | null } | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  meta: Record<string, unknown> | null;
  capsule: {
    id: string;
    name: string | null;
    slug: string | null;
    bannerUrl: string | null;
    logoUrl: string | null;
  } | null;
};

type CalendarEvent = Item & { date: string };

type CalendarDay = {
  date: Date;
  label: string;
  key: string;
  isToday: boolean;
  isCurrentMonth: boolean;
  hasEvents: boolean;
};

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseEventDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp);
}

function resolveCapsuleAvatar(
  capsule: { name?: string | null; slug?: string | null; logoUrl?: string | null; bannerUrl?: string | null } | null,
) {
  const logo = resolveToAbsoluteUrl(normalizeMediaUrl(capsule?.logoUrl ?? null));
  const banner = resolveToAbsoluteUrl(normalizeMediaUrl(capsule?.bannerUrl ?? null));
  const avatarUrl = logo ?? banner ?? null;
  const name = capsule?.name?.trim();
  const slug = capsule?.slug?.trim();
  const avatarInitial = name?.slice(0, 1).toUpperCase() ?? slug?.slice(0, 1).toUpperCase() ?? "C";
  return { avatarUrl, avatarInitial };
}

function buildCalendarDays(
  currentMonth: Date,
  eventsByDay: Map<string, CalendarEvent[]>,
): CalendarDay[] {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
  const today = new Date();
  const todayKey = toDateKey(today);

  const days: CalendarDay[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - startDay + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      const date = new Date(year, month, 1);
      days.push({
        date,
        label: "",
        key: `blank-${year}-${month}-${i}`,
        isToday: false,
        isCurrentMonth: false,
        hasEvents: false,
      });
      continue;
    }
    const date = new Date(year, month, dayNumber);
    const key = toDateKey(date);
    const hasEvents = eventsByDay.has(key);
    days.push({
      date,
      label: String(dayNumber),
      key,
      isToday: key === todayKey,
      isCurrentMonth: true,
      hasEvents,
    });
  }

  return days;
}

function Section({
  title,
  items,
  action,
  emptyMessage,
  loading = false,
  skeletonCount = 3,
}: {
  title: string;
  items: Item[];
  action?: SectionAction;
  emptyMessage?: string;
  loading?: boolean;
  skeletonCount?: number;
}) {
  const renderAction = () => {
    if (!action) return null;
    if ("href" in action) {
      return (
        <Link href={action.href} className={styles.calendarAction}>
          <span className={styles.calendarActionLabel}>{action.label}</span>
        </Link>
      );
    }
    if ("onClick" in action) {
      const isUpcomingEventsCalendar = title === "Upcoming Events";
      const isWhatsHotMore = title === "What's Hot";
      if (isUpcomingEventsCalendar) {
        return (
          <button
            type="button"
            className={styles.calendarAction}
            onClick={action.onClick}
          >
            <span className={styles.calendarActionIcon} aria-hidden="true">
              <CalendarBlank size={16} weight="duotone" />
            </span>
            <span className={styles.calendarActionLabel}>{action.label}</span>
          </button>
        );
      }
      if (isWhatsHotMore) {
        return (
          <button
            type="button"
            className={styles.calendarAction}
            onClick={action.onClick}
          >
            <span className={styles.calendarActionLabel}>{action.label}</span>
          </button>
        );
      }
      return (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      );
    }
    return null;
  };

  const renderContent = () => {
    if (loading) {
      return (
        <ul className={styles.list} data-loading="true" aria-hidden>
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <li key={`skeleton-${index}`}>
              <div className={`${styles.listItem} ${styles.skeletonItem}`} data-skeleton="true">
                <span className={styles.skeletonAvatar} />
                <div className={styles.skeletonBody}>
                  <span className={styles.skeletonLine} />
                  <span className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
                  <span className={styles.skeletonPill} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      );
    }

    if (items.length) {
      return (
        <ul className={styles.list}>
          {items.map((item) => {
            const avatar = item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.avatarUrl} alt="" className={styles.avatarImage} />
            ) : (
              (item.avatarInitial ?? null)
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
      );
    }

    if (emptyMessage) {
      return <div className={styles.empty}>{emptyMessage}</div>;
    }

    return null;
  };

  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {renderAction()}
      </header>
      {renderContent()}
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
  {
    id: "c1",
    title: "Creator Studio",
    subtitle: "Brand design + prompts",
    meta: "12k members",
    avatarInitial: "C",
  },
  { id: "c2", title: "AI Photography", subtitle: "Midjourney, SDXL tips", meta: "8.2k members", avatarInitial: "A" },
  { id: "c3", title: "Music Makers", subtitle: "DAW workflows + samples", meta: "4.5k members", avatarInitial: "M" },
];

const FALLBACK_EVENTS: Item[] = [
  { id: "e1", title: "Weekly Capsule Lab", subtitle: "Today 5:00 PM", avatarInitial: "W" },
  { id: "e2", title: "Prompt Jam #27", subtitle: "Tomorrow 3:00 PM", meta: "RSVP 210", avatarInitial: "P" },
];

function UpcomingEventsCalendarOverlay({
  events,
  loading,
  open,
  onClose,
}: {
  events: CalendarEvent[];
  loading: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [monthCursor, setMonthCursor] = React.useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const parsed = parseEventDate(event.date);
      if (!parsed) continue;
      const key = toDateKey(parsed);
      const existing = map.get(key);
      if (existing) {
        existing.push(event);
      } else {
        map.set(key, [event]);
      }
    }
    return map;
  }, [events]);

  React.useEffect(() => {
    if (!open) return;
    if (selectedKey) return;
    const todayKey = toDateKey(new Date());
    if (eventsByDay.has(todayKey)) {
      setSelectedKey(todayKey);
      return;
    }
    const first = events[0];
    if (first?.date) {
      const parsed = parseEventDate(first.date);
      if (parsed) {
        setSelectedKey(toDateKey(parsed));
      }
    }
  }, [events, eventsByDay, open, selectedKey]);

  const days = React.useMemo(
    () => buildCalendarDays(monthCursor, eventsByDay),
    [monthCursor, eventsByDay],
  );

  const selectedEvents = React.useMemo(
    () => (selectedKey ? eventsByDay.get(selectedKey) ?? [] : []),
    [eventsByDay, selectedKey],
  );

  const monthFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }),
    [],
  );

  const handlePrevMonth = () => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    const todayKey = toDateKey(today);
    setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedKey(todayKey);
  };

  const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  if (!open) return null;

  return (
    <div className={styles.calendarOverlay} role="dialog" aria-modal="true">
      <div className={styles.calendarSection}>
        <div className={styles.calendarTopRow}>
          <div className={styles.calendarHeaderRow}>
            <div className={styles.calendarMonthLabel}>{monthFormatter.format(monthCursor)}</div>
            <div className={styles.calendarNav}>
              <button
                type="button"
                className={styles.calendarNavButton}
                onClick={handlePrevMonth}
                aria-label="Previous month"
              >
                {"‹"}
              </button>
              <button
                type="button"
                className={styles.calendarNavButton}
                onClick={handleToday}
              >
                Today
              </button>
              <button
                type="button"
                className={styles.calendarNavButton}
                onClick={handleNextMonth}
                aria-label="Next month"
              >
                {"›"}
              </button>
            </div>
          </div>
          <button
            type="button"
            className={styles.calendarCloseButton}
            onClick={onClose}
            aria-label="Close calendar"
          >
            ×
          </button>
        </div>
        <div className={styles.calendarBody}>
          <div className={styles.calendarGridShell}>
            <div className={styles.calendarWeekdays} aria-hidden>
              {weekdayLabels.map((label) => (
                <div key={label} className={styles.calendarWeekday}>
                  {label}
                </div>
              ))}
            </div>
            <div className={styles.calendarGrid}>
              {days.map((day) => {
                if (!day.isCurrentMonth) {
                  return <div key={day.key} className={styles.calendarDayBlank} />;
                }
                const key = toDateKey(day.date);
                const isSelected = selectedKey === key;
                const classes = [
                  styles.calendarDay,
                  day.isToday ? styles.calendarDayToday : "",
                  day.hasEvents ? styles.calendarDayHasEvents : "",
                  isSelected ? styles.calendarDaySelected : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={day.key}
                    type="button"
                    className={classes}
                    onClick={() => setSelectedKey(key)}
                    aria-pressed={isSelected}
                  >
                    <span className={styles.calendarDayNumber}>{day.label}</span>
                    {day.hasEvents ? <span className={styles.calendarDayDot} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={styles.calendarEvents}>
            {loading ? (
              <div className={styles.calendarEmpty}>Loading ladders...</div>
            ) : selectedEvents.length ? (
              <ul className={styles.calendarEventList}>
                {selectedEvents.map((event) => (
                  <li key={event.id} className={styles.calendarEventItem}>
                    {event.href ? (
                      <Link
                        href={event.href}
                        className={styles.calendarEventLink}
                        prefetch={false}
                      >
                        <span className={styles.calendarEventTitle}>{event.title}</span>
                        {event.subtitle ? (
                          <span className={styles.calendarEventSub}>{event.subtitle}</span>
                        ) : null}
                        {event.meta ? (
                          <span className={styles.calendarEventMeta}>{event.meta}</span>
                        ) : null}
                        {event.badge ? (
                          <span className={styles.calendarEventBadge}>{event.badge}</span>
                        ) : null}
                      </Link>
                    ) : (
                      <div className={styles.calendarEventLink}>
                        <span className={styles.calendarEventTitle}>{event.title}</span>
                        {event.subtitle ? (
                          <span className={styles.calendarEventSub}>{event.subtitle}</span>
                        ) : null}
                        {event.meta ? (
                          <span className={styles.calendarEventMeta}>{event.meta}</span>
                        ) : null}
                        {event.badge ? (
                          <span className={styles.calendarEventBadge}>{event.badge}</span>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.calendarEmpty}>No ladders on this date yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UpcomingEventsCalendarOverlayPortal(
  props: React.ComponentProps<typeof UpcomingEventsCalendarOverlay>,
) {
  const [mounted, setMounted] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = document.createElement("div");
    el.dataset.calendarOverlayRoot = "true";
    document.body.appendChild(el);
    containerRef.current = el;
    setMounted(true);
    return () => {
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
      }
      containerRef.current = null;
    };
  }, []);

  if (!mounted || !containerRef.current) return null;

  return createPortal(<UpcomingEventsCalendarOverlay {...props} />, containerRef.current);
}

export function DiscoveryRail() {
  const [recommendedCapsules, setRecommendedCapsules] = React.useState<Item[]>([]);
  const [loadingCapsules, setLoadingCapsules] = React.useState(true);
  const [upcomingEvents, setUpcomingEvents] = React.useState<Item[]>([]);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const homeLoading = useHomeLoading();

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
          const { avatarUrl, avatarInitial } = resolveCapsuleAvatar(capsule);
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
            avatarInitial,
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

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const loadLadders = async () => {
      setLoadingEvents(true);
      try {
        const response = await fetch("/api/explore/recent-ladders?limit=12", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401) {
            return;
          }
          throw new Error(`recent ladders request failed (${response.status})`);
        }
        const payload = (await response.json().catch(() => null)) as {
          ladders?: LadderSummaryPayload[];
        } | null;
        if (!payload?.ladders?.length) {
          if (!cancelled) {
            setUpcomingEvents([]);
          }
          return;
        }
        const items: Item[] = payload.ladders.slice(0, 3).map((ladder) => {
          const { avatarUrl, avatarInitial } = resolveCapsuleAvatar(ladder.capsule);
          const relative = formatRelativeDate(ladder.publishedAt ?? ladder.createdAt);
          const subtitle =
            (ladder.game?.title && ladder.game.title.trim().length
              ? ladder.game.title
              : null) ??
            ladder.capsule?.name ??
            (ladder.capsule?.slug ? `@${ladder.capsule.slug}` : null) ??
            "New ladder";
          const visibilityLabel =
            ladder.visibility === "capsule"
              ? "Capsule members"
              : ladder.visibility === "private"
                ? "Private"
                : "Public";
          const metaParts = [
            relative ? (ladder.publishedAt ? `Launched ${relative}` : `Created ${relative}`) : null,
            `${visibilityLabel} ladder`,
          ].filter(Boolean) as string[];
          return {
            id: ladder.id,
            title: ladder.name,
            subtitle,
            meta: metaParts.join(" \u2022 "),
            date: ladder.publishedAt ?? ladder.createdAt,
            href: `/capsule?capsuleId=${encodeURIComponent(ladder.capsuleId)}&ladderId=${encodeURIComponent(ladder.id)}&section=events`,
            avatarUrl,
            avatarInitial,
          };
        });
        if (!cancelled) {
          setUpcomingEvents(items);
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        if (process.env.NODE_ENV === "development") {
          console.warn("discovery-rail: failed to load recent ladders", error);
        }
        if (!cancelled) {
          setUpcomingEvents(FALLBACK_EVENTS);
        }
      } finally {
        if (!cancelled) {
          setLoadingEvents(false);
        }
      }
    };

    void loadLadders();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  React.useEffect(() => {
    if (!homeLoading) return;
    if (!loadingCapsules && !loadingEvents) {
      homeLoading.markReady("right-rail");
    }
  }, [homeLoading, loadingCapsules, loadingEvents]);

  const showSkeleton = loadingCapsules || loadingEvents || (homeLoading?.isPending ?? false);
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
          emptyMessage="No new capsules yet. Check again soon!"
          loading={showSkeleton}
        />
        <Section
          title="Upcoming Events"
          items={upcomingEvents}
          action={{
            label: "Calendar",
            onClick: () => setCalendarOpen(true),
          }}
          emptyMessage="No ladders yet. Create one to see it here."
          loading={showSkeleton}
        />
        <Section
          title="What's Hot"
          items={trending}
          action={{ label: "More", onClick: () => {} }}
          loading={showSkeleton}
        />
      </div>
      <UpcomingEventsCalendarOverlayPortal
        events={upcomingEvents.filter(
          (event): event is CalendarEvent => !!event.date,
        )}
        loading={loadingEvents}
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
      />
    </div>
  );
}

export default DiscoveryRail;
