"use client";

import * as React from "react";

import type { LightboxImageItem } from "@/components/home-feed/feed-media-gallery";

type FeedLightboxState = {
  postId: string;
  index: number;
  items: LightboxImageItem[];
};

type UseFeedLightboxResult = {
  lightbox: FeedLightboxState | null;
  openLightbox(payload: FeedLightboxState): void;
  closeLightbox(): void;
  handleCloseButtonClick(event: React.MouseEvent<HTMLButtonElement>): void;
  navigate(step: number): void;
};

export function useFeedLightbox(): UseFeedLightboxResult {
  const [lightbox, setLightbox] = React.useState<FeedLightboxState | null>(null);

  const openLightbox = React.useCallback((payload: FeedLightboxState) => {
    setLightbox(payload);
  }, []);

  const closeLightbox = React.useCallback(() => {
    setLightbox(null);
  }, []);

  const navigate = React.useCallback((step: number) => {
    setLightbox((previous) => {
      if (!previous || !previous.items.length) return previous;
      const total = previous.items.length;
      const nextIndex = (((previous.index + step) % total) + total) % total;
      return { ...previous, index: nextIndex };
    });
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigate(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigate(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightbox, closeLightbox, navigate]);

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
