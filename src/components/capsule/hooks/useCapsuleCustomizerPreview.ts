"use client";

import * as React from "react";

import {
  bannerSourceKey,
  isCroppableBanner,
  type BannerCrop,
  type CapsuleCustomizerMode,
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

type ComposeAssetResult = {
  blob: Blob;
  width: number;
  height: number;
  mimeType: "image/jpeg";
};

type UseCustomizerPreviewParams = {
  assetLabel: string;
  customizerMode: CapsuleCustomizerMode;
  open: boolean;
  selectedBanner: SelectedBanner | null;
  setSelectedBanner: React.Dispatch<React.SetStateAction<SelectedBanner | null>>;
  onCropUpdate: (banner: CroppableBanner) => void;
  resetSaveError: () => void;
  fetchMemoryAssetUrl: (memoryId: string) => Promise<string>;
};

const PREVIEW_SCALE_BUFFER = 0.015;
const ASPECT_TOLERANCE = 0.0025;

const MODE_ASPECT_RATIO: Record<CapsuleCustomizerMode, number> = {
  banner: 16 / 9,
  storeBanner: 5 / 2,
  tile: 9 / 16,
  logo: 1,
  avatar: 1,
};

const AI_CROP_BIAS: Record<CapsuleCustomizerMode, { x: number; y: number }> = {
  banner: { x: 0, y: -0.18 },
  storeBanner: { x: 0, y: -0.12 },
  tile: { x: 0, y: 0 },
  logo: { x: 0, y: 0 },
  avatar: { x: 0, y: 0 },
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const clampBias = (value: number) => clamp(value, -1, 1);

export function useCapsuleCustomizerPreview({
  assetLabel,
  customizerMode,
  open,
  selectedBanner,
  setSelectedBanner,
  onCropUpdate,
  resetSaveError,
  fetchMemoryAssetUrl,
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

  const loadImageElement = React.useCallback(
    (src: string, allowCrossOrigin: boolean): Promise<HTMLImageElement> =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (allowCrossOrigin) {
          img.crossOrigin = "anonymous";
        }
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image for ${assetLabel} preview.`));
        img.src = src;
      }),
    [assetLabel],
  );

  const composeAssetImage = React.useCallback(async (): Promise<ComposeAssetResult> => {
    if (!selectedBanner || selectedBanner.kind === "ai") {
      throw new Error(`Choose an image before saving your ${assetLabel}.`);
    }

    const crop = selectedBanner.crop ?? { offsetX: 0, offsetY: 0 };

    const candidateUrls: string[] = [];
    const revokeUrls: string[] = [];
    let allowCrossOrigin = true;

    if (selectedBanner.kind === "memory" && selectedBanner.id) {
      try {
        const proxiedUrl = await fetchMemoryAssetUrl(selectedBanner.id);
        if (proxiedUrl) {
          candidateUrls.push(proxiedUrl);
          revokeUrls.push(proxiedUrl);
        }
      } catch (error) {
        console.warn("memory proxy fetch failed", error);
      }
    }

    if (selectedBanner.kind === "upload" && selectedBanner.file instanceof File) {
      const objectUrl = URL.createObjectURL(selectedBanner.file);
      candidateUrls.push(objectUrl);
      revokeUrls.push(objectUrl);
      allowCrossOrigin = false;
    } else if (selectedBanner.kind === "memory") {
      if (selectedBanner.fullUrl) candidateUrls.push(selectedBanner.fullUrl);
      if (selectedBanner.url && selectedBanner.url !== selectedBanner.fullUrl) {
        candidateUrls.push(selectedBanner.url);
      }
    } else if (selectedBanner.url) {
      candidateUrls.push(selectedBanner.url);
    }

    if (!candidateUrls.length) {
      throw new Error(`No ${assetLabel} image available.`);
    }

    let img: HTMLImageElement | null = null;
    let lastError: unknown = null;

    for (const candidate of candidateUrls) {
      const isBlob =
        candidate.startsWith("blob:") ||
        candidate.startsWith("data:") ||
        candidate.startsWith("file:");
      try {
        img = await loadImageElement(candidate, allowCrossOrigin && !isBlob);
        break;
      } catch (error) {
        lastError = error;
        if (!isBlob) {
          try {
            const response = await fetch(candidate, { mode: "cors" });
            if (!response.ok) {
              throw new Error(`Image fetch failed with status ${response.status}`);
            }
            const fetchedBlob = await response.blob();
            const fetchedUrl = URL.createObjectURL(fetchedBlob);
            revokeUrls.push(fetchedUrl);
            img = await loadImageElement(fetchedUrl, false);
            break;
          } catch (fetchError) {
            lastError = fetchError;
            continue;
          }
        }
      }
    }

  if (!img) {
      revokeUrls.forEach((url) => URL.revokeObjectURL(url));
      throw lastError instanceof Error
        ? lastError
        : new Error(`Failed to load image for ${assetLabel} preview.`);
    }

    if (revokeUrls.length) {
      queueMicrotask(() => {
        revokeUrls.forEach((url) => URL.revokeObjectURL(url));
      });
    }

    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) {
      throw new Error("Unable to read image dimensions.");
    }

    const { maxWidth, maxHeight, aspectRatio } =
      customizerMode === "tile"
        ? { maxWidth: 1080, maxHeight: 1920, aspectRatio: 9 / 16 }
        : customizerMode === "logo" || customizerMode === "avatar"
          ? { maxWidth: 1024, maxHeight: 1024, aspectRatio: 1 }
          : customizerMode === "storeBanner"
            ? { maxWidth: 1600, maxHeight: 640, aspectRatio: 5 / 2 }
            : { maxWidth: 1600, maxHeight: 900, aspectRatio: 16 / 9 };

    let targetWidth = Math.min(maxWidth, naturalWidth);
    let targetHeight = Math.round(targetWidth / aspectRatio);
    if (targetHeight > naturalHeight) {
      targetHeight = Math.min(maxHeight, naturalHeight);
      targetWidth = Math.round(targetHeight * aspectRatio);
    }
    if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
      targetWidth = maxWidth;
    }
    if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
      targetHeight = maxHeight;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(targetWidth));
    canvas.height = Math.max(1, Math.round(targetHeight));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to prepare drawing context.");
    }

    const scale = Math.max(canvas.width / naturalWidth, canvas.height / naturalHeight);
    const scaledWidth = naturalWidth * scale;
    const scaledHeight = naturalHeight * scale;
    const maxOffsetX = Math.max(0, scaledWidth - canvas.width);
    const maxOffsetY = Math.max(0, scaledHeight - canvas.height);

    const offsetX = clamp(
      Math.round(maxOffsetX / 2 - (maxOffsetX / 2) * clampBias(crop.offsetX)),
      0,
      maxOffsetX,
    );
    const offsetY = clamp(
      Math.round(maxOffsetY / 2 - (maxOffsetY / 2) * clampBias(crop.offsetY)),
      0,
      maxOffsetY,
    );

    ctx.drawImage(
      img,
      offsetX,
      offsetY,
      canvas.width / scale,
      canvas.height / scale,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("Failed to prepare asset export."));
      }, "image/jpeg");
    });

    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      mimeType: "image/jpeg" as const,
    };
  }, [assetLabel, customizerMode, fetchMemoryAssetUrl, loadImageElement, selectedBanner]);

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
    composeAssetImage,
  } as const;
}
