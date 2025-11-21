"use client";

import * as React from "react";

import type { LightboxImageItem } from "@/components/home-feed/feed-media-gallery";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";

type FeedLightboxState = {
  postId: string;
  index: number;
  items: LightboxImageItem[];
  post: HomeFeedPost | null;
};

type UseFeedLightboxResult = {
  lightbox: FeedLightboxState | null;
  openLightbox(payload: FeedLightboxState): void;
  closeLightbox(): void;
  handleCloseButtonClick(event: React.MouseEvent<HTMLButtonElement>): void;
  navigate(step: number, options?: { loop?: boolean }): boolean;
};

export function useFeedLightbox(): UseFeedLightboxResult {
  const [lightbox, setLightbox] = React.useState<FeedLightboxState | null>(null);

  const openLightbox = React.useCallback((payload: FeedLightboxState) => {
    setLightbox(payload);
  }, []);

  const closeLightbox = React.useCallback(() => {
    setLightbox(null);
  }, []);

  const navigate = React.useCallback((step: number, options?: { loop?: boolean }) => {
    let didChange = false;
    setLightbox((previous) => {
      if (!previous || !previous.items.length) return previous;
      const total = previous.items.length;
      const loop = options?.loop ?? true;
      let nextIndex = previous.index + step;
      if (loop) {
        nextIndex = (((nextIndex % total) + total) % total) as number;
      } else if (nextIndex < 0 || nextIndex > total - 1) {
        return previous;
      }
      if (nextIndex === previous.index) return previous;
      didChange = true;
      return { ...previous, index: nextIndex };
    });
    return didChange;
  }, []);

  const handleCloseButtonClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      closeLightbox();
    },
    [closeLightbox],
  );

  React.useEffect(() => {
    if (!lightbox) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [lightbox]);

  return {
    lightbox,
    openLightbox,
    closeLightbox,
    handleCloseButtonClick,
    navigate,
  };
}
