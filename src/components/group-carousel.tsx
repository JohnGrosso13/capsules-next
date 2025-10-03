"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import {
  UsersThree,
  PencilSimple,
  Palette,
  MapPin,
  GameController,
  GraduationCap,
  Storefront,
  VideoCamera,
  Trophy,
  TextAa,
  Microphone,
  Camera,
  Handshake,
  CalendarBlank,
  ChalkboardTeacher,
} from "@phosphor-icons/react/dist/ssr";

type ItemIcon = React.ReactNode;
type Item = string | { label: string; icon?: ItemIcon };

type GroupCarouselProps = {
  items: Item[];
  animate?: boolean;
  speed?: "normal" | "slow" | "slower";
};

const size = 20;
const weight = "duotone" as const;
const DEFAULT_ICONS: Record<string, ItemIcon> = {
  Creators: <PencilSimple size={size} weight={weight} />,
  Teams: <UsersThree size={size} weight={weight} />,
  Families: <UsersThree size={size} weight={weight} />,
  "Community Founders": <Handshake size={size} weight={weight} />,
  "Event Organizers": <CalendarBlank size={size} weight={weight} />,
  "Educators & Coaches": <ChalkboardTeacher size={size} weight={weight} />,
  Clubs: <UsersThree size={size} weight={weight} />,
  "Designers & Illustrators": <Palette size={size} weight={weight} />,
  "Local Groups": <MapPin size={size} weight={weight} />,
  "Gaming Communities": <GameController size={size} weight={weight} />,
  Schools: <GraduationCap size={size} weight={weight} />,
  "Independent Sellers": <Storefront size={size} weight={weight} />,
  Streamers: <VideoCamera size={size} weight={weight} />,
  Leagues: <Trophy size={size} weight={weight} />,
  Writers: <TextAa size={size} weight={weight} />,
  Podcasters: <Microphone size={size} weight={weight} />,
  Photographers: <Camera size={size} weight={weight} />,
  "Alumni Networks": <GraduationCap size={size} weight={weight} />,
};

export function GroupCarousel({ items, animate = false, speed = "slower" }: GroupCarouselProps) {
  const normalized = items.map((item) =>
    typeof item === "string"
      ? { label: item, icon: DEFAULT_ICONS[item] }
      : { label: item.label, icon: item.icon ?? DEFAULT_ICONS[item.label] },
  );
  const doubled = animate ? [...normalized, ...normalized] : normalized;

  return (
    <div className="glass-panel relative overflow-hidden rounded-3xl p-4">
      <div
        className={cn(
          "flex min-w-max items-center gap-4 md:gap-6",
          animate
            ? speed === "slower"
              ? "animate-marquee-slower"
              : speed === "slow"
                ? "animate-marquee-slow"
                : "animate-marquee"
            : "flex-wrap",
        )}
        role="list"
        aria-label="Popular group types"
      >
        {doubled.map((entry, index) => (
          <span
            key={`${entry.label}-${index}`}
            className="text-fg inline-flex items-center gap-3 px-4 md:px-5 py-2 md:py-2.5 text-base md:text-lg font-semibold"
            role="listitem"
          >
            {entry.icon ? <span aria-hidden="true">{entry.icon}</span> : null}
            <span>{entry.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
