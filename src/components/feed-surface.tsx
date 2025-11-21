"use client";

import * as React from "react";
import clsx from "clsx";

import feedStyles from "./home-feed.module.css";
import surfaceStyles from "./feed-surface.module.css";

type FeedSurfaceProps = {
  children: React.ReactNode;
  variant?: "home" | "capsule";
  bleed?: boolean;
  className?: string;
};

export function FeedSurface({
  children,
  variant = "home",
  bleed = false,
  className,
}: FeedSurfaceProps) {
  return (
    <section
      className={surfaceStyles.surface}
      data-variant={variant}
      data-bleed={bleed ? "true" : undefined}
    >
      <div className={clsx(feedStyles.feed, surfaceStyles.inner, className)}>{children}</div>
    </section>
  );
}
