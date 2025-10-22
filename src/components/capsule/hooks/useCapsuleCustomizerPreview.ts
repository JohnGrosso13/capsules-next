"use client";

import * as React from "react";

import {
  isCroppableBanner,
  type BannerCrop,
  type CroppableBanner,
  type SelectedBanner,
} from "./capsuleCustomizerTypes";

type DragState = {
  pointerId: number;
  cleanup: () => void;
};

type PreviewMetrics = {
  overflowX: number;
  overflowY: number;
  maxOffsetX: number;
  maxOffsetY: number;
  scale: number;
};

type UseCustomizerPreviewParams = {
  open: boolean;
  selectedBanner: SelectedBanner | null;
  setSelectedBanner: React.Dispatch<React.SetStateAction<SelectedBanner | null>>;
  onCropUpdate: (banner: CroppableBanner) => void;
  resetSaveError: () => void;
};

const PREVIEW_SCALE_BUFFER = 0.015;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function useCapsuleCustomizerPreview({
  open,
  selectedBanner,
  setSelectedBanner,
  onCropUpdate,
  resetSaveError,
}: UseCustomizerPreviewParams) {
  const previewStageRef = React.useRef<HTMLDivElement | null>(null);
  const previewImageRef = React.useRef<HTMLImageElement | null>(null);
  const previewMetricsRef = React.useRef<PreviewMetrics>({
    overflowX: 0,
    overflowY: 0,
    maxOffsetX: 0,
    maxOffsetY: 0,
    scale: 1,
  });
  const previewOffsetRef = React.useRef({ x: 0, y: 0 });
  const pendingCropRef = React.useRef<BannerCrop | null>(null);
  const dragStateRef = React.useRef<DragState | null>(null);

  const [previewOffset, setPreviewOffset] = React.useState(previewOffsetRef.current);
  const [previewScale, setPreviewScale] = React.useState(1);
  const [isDraggingPreview, setIsDraggingPreview] = React.useState(false);
  const [previewCanPan, setPreviewCanPan] = React.useState(false);

  const previewDraggable =
    selectedBanner?.kind === "upload" || selectedBanner?.kind === "memory";
  const previewPannable = previewDraggable && previewCanPan;
  const activeImageUrl = previewDraggable ? selectedBanner?.url ?? null : null;

  const syncBannerCropToMessages = React.useCallback(
    (nextBanner: CroppableBanner) => {
      onCropUpdate(nextBanner);
    },
    [onCropUpdate],
  );

  const applyPreviewOffset = React.useCallback(
    (nextX: number, nextY: number, metricsOverride?: PreviewMetrics) => {
      const metrics = metricsOverride ?? previewMetricsRef.current;
      const { maxOffsetX, maxOffsetY } = metrics;
      const clampedX = maxOffsetX ? clamp(nextX, -maxOffsetX, maxOffsetX) : 0;
      const clampedY = maxOffsetY ? clamp(nextY, -maxOffsetY, maxOffsetY) : 0;
      const nextOffset = { x: clampedX, y: clampedY };

      const hasChanged =
        previewOffsetRef.current.x !== nextOffset.x || previewOffsetRef.current.y !== nextOffset.y;

      previewOffsetRef.current = nextOffset;
      setPreviewOffset((previous) => {
        if (!hasChanged) return previous;
        return nextOffset;
      });

      const normalizedX = maxOffsetX ? nextOffset.x / maxOffsetX : 0;
      const normalizedY = maxOffsetY ? nextOffset.y / maxOffsetY : 0;
      const nextCrop = { offsetX: normalizedX, offsetY: normalizedY };

      let updatedBanner: SelectedBanner | null = null;
      setSelectedBanner((previous) => {
        if (!previous || previous.kind === "ai") return previous;
        const existingCrop = previous.crop ?? { offsetX: 0, offsetY: 0 };
        if (
          existingCrop.offsetX === nextCrop.offsetX &&
          existingCrop.offsetY === nextCrop.offsetY
        ) {
          updatedBanner = previous;
          return previous;
        }

        const nextBanner =
          previous.kind === "upload"
            ? { ...previous, crop: nextCrop }
            : previous.kind === "memory"
              ? { ...previous, crop: nextCrop }
              : previous;

        updatedBanner = nextBanner;
        return nextBanner;
      });

      if (isCroppableBanner(updatedBanner)) {
        syncBannerCropToMessages(updatedBanner);
      }
    },
    [setSelectedBanner, syncBannerCropToMessages],
  );

  const updateSelectedBanner = React.useCallback(
    (banner: SelectedBanner | null) => {
      if (dragStateRef.current) {
        dragStateRef.current.cleanup();
      }

      setIsDraggingPreview(false);
      setPreviewCanPan(false);
      resetSaveError();
      setPreviewScale(1);
      previewMetricsRef.current = {
        overflowX: 0,
        overflowY: 0,
        maxOffsetX: 0,
        maxOffsetY: 0,
        scale: 1,
      };

      const normalizedBanner =
        banner && banner.kind !== "ai"
          ? { ...banner, crop: banner.crop ?? { offsetX: 0, offsetY: 0 } }
          : banner;

      if (normalizedBanner && normalizedBanner.kind !== "ai") {
        pendingCropRef.current = normalizedBanner.crop ?? { offsetX: 0, offsetY: 0 };
      } else {
        pendingCropRef.current = null;
      }

      previewOffsetRef.current = { x: 0, y: 0 };
      setPreviewOffset({ x: 0, y: 0 });
      setSelectedBanner(normalizedBanner ?? null);
    },
    [resetSaveError, setSelectedBanner],
  );

  const measurePreview = React.useCallback(() => {
    const container = previewStageRef.current;
    const image = previewImageRef.current;
    if (!container || !image) return;

    const containerRect = container.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!containerRect.width || !containerRect.height || !naturalWidth || !naturalHeight) {
      return;
    }

    const widthRatio = containerRect.width / naturalWidth;
    const heightRatio = containerRect.height / naturalHeight;
    const coverScale = Math.max(widthRatio, heightRatio);
    const needsShrink =
      naturalWidth > containerRect.width || naturalHeight > containerRect.height;
    const baseScale = needsShrink ? coverScale * (1 + PREVIEW_SCALE_BUFFER) : 1;
    const scaledWidth = naturalWidth * baseScale;
    const scaledHeight = naturalHeight * baseScale;

    const overflowX = Math.max(0, scaledWidth - containerRect.width);
    const overflowY = Math.max(0, scaledHeight - containerRect.height);
    const metrics: PreviewMetrics = {
      overflowX,
      overflowY,
      maxOffsetX: overflowX / 2,
      maxOffsetY: overflowY / 2,
      scale: baseScale,
    };

    previewMetricsRef.current = metrics;
    setPreviewScale(baseScale);
    setPreviewCanPan(metrics.maxOffsetX > 0 || metrics.maxOffsetY > 0);
    const pendingCrop = pendingCropRef.current;
    if (pendingCrop) {
      pendingCropRef.current = null;
      const targetX = (pendingCrop.offsetX || 0) * metrics.maxOffsetX;
      const targetY = (pendingCrop.offsetY || 0) * metrics.maxOffsetY;
      applyPreviewOffset(targetX, targetY, metrics);
    } else {
      applyPreviewOffset(previewOffsetRef.current.x, previewOffsetRef.current.y, metrics);
    }
  }, [applyPreviewOffset]);

  const handlePreviewPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!previewDraggable || !previewPannable) return;
      if (event.button !== 0) return;

      previewImageRef.current?.setPointerCapture?.(event.pointerId);

      if (dragStateRef.current) {
        dragStateRef.current.cleanup();
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const startOffset = { ...previewOffsetRef.current };

      const move = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        nativeEvent.preventDefault();
        const deltaX = nativeEvent.clientX - startX;
        const deltaY = nativeEvent.clientY - startY;
        applyPreviewOffset(startOffset.x + deltaX, startOffset.y + deltaY);
      };

      const finish = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        cleanup();
      };

      function cleanup() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        dragStateRef.current = null;
        setIsDraggingPreview(false);
      }

      dragStateRef.current = {
        pointerId,
        cleanup,
      };

      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);

      setIsDraggingPreview(true);
      event.preventDefault();
    },
    [applyPreviewOffset, previewDraggable, previewPannable],
  );

  React.useEffect(() => {
    return () => {
      dragStateRef.current?.cleanup();
    };
  }, []);

  React.useEffect(() => {
    if (!open && dragStateRef.current) {
      dragStateRef.current.cleanup();
    }
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    measurePreview();
  }, [measurePreview, open, activeImageUrl]);

  React.useEffect(() => {
    if (!open) return;
    const stage = previewStageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      measurePreview();
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, [measurePreview, open]);

  React.useEffect(() => {
    if (!open) return;
    const handleResize = () => {
      measurePreview();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measurePreview, open]);

  return {
    previewState: {
      previewOffset,
      previewScale,
      previewDraggable,
      previewPannable,
      previewCanPan,
      isDraggingPreview,
      stageRef: previewStageRef,
      imageRef: previewImageRef,
      onPointerDown: handlePreviewPointerDown,
      onImageLoad: measurePreview,
    },
    updateSelectedBanner,
  } as const;
}
