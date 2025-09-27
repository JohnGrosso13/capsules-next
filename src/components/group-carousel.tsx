"use client";

import { cn } from "@/lib/cn";

type Item = string | { label: string; icon?: string };

type GroupCarouselProps = {
  items: Item[];
  animate?: boolean;
};

const DEFAULT_ICONS: Record<string, string> = {
  Creators: "✨",
  Teams: "🤝",
  Families: "👪",
  "Community Founders": "🌱",
  "Event Organizers": "🎉",
  "Educators & Coaches": "🎓",
  Clubs: "🏛️",
  "Designers & Illustrators": "🎨",
  "Local Groups": "📍",
  "Gaming Communities": "🕹️",
  Schools: "🏫",
  "Independent Sellers": "🛍️",
  Streamers: "📡",
  Leagues: "🏆",
  Writers: "✍️",
  Podcasters: "🎙️",
  Photographers: "📸",
  "Alumni Networks": "🎓",
};

export function GroupCarousel({ items, animate = false }: GroupCarouselProps) {
  const normalized = items.map((item) =>
    typeof item === "string"
      ? { label: item, icon: DEFAULT_ICONS[item] }
      : { label: item.label, icon: item.icon ?? DEFAULT_ICONS[item.label] },
  );
  const doubled = animate ? [...normalized, ...normalized] : normalized;

  return (
    <div className="border-border/40 bg-surface-muted/60 relative overflow-hidden rounded-3xl border p-4 shadow-md backdrop-blur">
      <div
        className={cn(
          "flex min-w-max items-center gap-3",
          animate ? "animate-marquee" : "flex-wrap",
        )}
        role="list"
        aria-label="Popular group types"
      >
        {doubled.map((entry, index) => (
          <span
            key={`${entry.label}-${index}`}
            className="rounded-pill border-border/40 bg-surface-elevated/80 text-fg/90 inline-flex items-center gap-2 border px-4 py-2 text-sm font-medium shadow-xs backdrop-blur"
            role="listitem"
          >
            {entry.icon ? (
              <span aria-hidden="true" className="text-base">
                {entry.icon}
              </span>
            ) : null}
            <span>{entry.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
