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
const MASK_BRUSH_RADIUS = 36;
const MASK_STROKE_STYLE = "rgba(255, 0, 0, 0.85)";

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
  const maskCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
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
  const maskDataRef = React.useRef<string | null>(null);

  const [previewOffset, setPreviewOffset] = React.useState(previewOffsetRef.current);
  const [previewScale, setPreviewScale] = React.useState(1);
  const [isDraggingPreview, setIsDraggingPreview] = React.useState(false);
  const [previewCanPan, setPreviewCanPan] = React.useState(false);
  const [maskEnabled, setMaskEnabled] = React.useState(false);
  const [maskHasData, setMaskHasData] = React.useState(false);
  const [isDrawingMask, setIsDrawingMask] = React.useState(false);

  const previewDraggable =
    selectedBanner?.kind === "upload" || selectedBanner?.kind === "memory";
  const maskEditable = previewDraggable;
  const previewPannable = previewDraggable && previewCanPan && !maskEnabled;
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

  const clearMaskCanvas = React.useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const applyMaskDataUrl = React.useCallback(
    (dataUrl: string | null) => {
      maskDataRef.current = dataUrl;
      setMaskHasData(Boolean(dataUrl));
      setSelectedBanner((previous) => {
        if (!previous || previous.kind === "ai") return previous;
        const current = previous.maskDataUrl ?? null;
        if (current === dataUrl) return previous;
        if (previous.kind === "upload" || previous.kind === "memory") {
          return { ...previous, maskDataUrl: dataUrl ?? null };
        }
        return previous;
      });
    },
    [setSelectedBanner],
  );

  const renderMaskFromStoredData = React.useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dataUrl = maskDataRef.current;
    if (!dataUrl) {
      setMaskHasData(false);
      return;
    }
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      setMaskHasData(true);
    };
    image.onerror = () => {
      setMaskHasData(false);
    };
    image.src = dataUrl;
  }, []);

  const clearMask = React.useCallback(() => {
    clearMaskCanvas();
    applyMaskDataUrl(null);
  }, [applyMaskDataUrl, clearMaskCanvas]);

  const toggleMaskEditing = React.useCallback(
    (enabled?: boolean) => {
      if (!maskEditable) {
        setMaskEnabled(false);
        return;
      }
      setMaskEnabled((previous) => {
        const target = typeof enabled === "boolean" ? enabled : !previous;
        return target;
      });
    },
    [maskEditable],
  );

  const handleMaskPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!maskEnabled || !maskEditable) return;
      if (event.button !== 0) return;
      const canvas = maskCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      event.preventDefault();

      const drawAtPoint = (fromX: number, fromY: number, toX: number, toY: number) => {
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
      };

      const updateBrushStyle = () => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const brush = MASK_BRUSH_RADIUS * 2 * Math.max(scaleX, scaleY);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = MASK_STROKE_STYLE;
        ctx.lineWidth = brush;
      };

      updateBrushStyle();

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      let lastX = (event.clientX - rect.left) * scaleX;
      let lastY = (event.clientY - rect.top) * scaleY;

      canvas.setPointerCapture?.(event.pointerId);

      drawAtPoint(lastX, lastY, lastX, lastY);
      setIsDrawingMask(true);

      const pointerId = event.pointerId;

      const move = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        nativeEvent.preventDefault();
        const nextRect = canvas.getBoundingClientRect();
        const nextX = (nativeEvent.clientX - nextRect.left) * (canvas.width / nextRect.width);
        const nextY = (nativeEvent.clientY - nextRect.top) * (canvas.height / nextRect.height);
        drawAtPoint(lastX, lastY, nextX, nextY);
        lastX = nextX;
        lastY = nextY;
      };

      const finish = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        cleanup();
        requestAnimationFrame(() => {
          const dataUrl = canvas.toDataURL("image/png");
          applyMaskDataUrl(dataUrl);
        });
      };

      const cancel = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        cleanup();
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", cancel);
        setIsDrawingMask(false);
        canvas.releasePointerCapture?.(pointerId);
      };

      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", cancel);
    },
    [applyMaskDataUrl, maskEditable, maskEnabled],
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
      setMaskEnabled(false);
      setIsDrawingMask(false);
      const nextMaskData =
        normalizedBanner && normalizedBanner.kind !== "ai"
          ? normalizedBanner.maskDataUrl ?? null
          : null;
      maskDataRef.current = nextMaskData;
      if (!nextMaskData) {
        clearMaskCanvas();
        setMaskHasData(false);
      }
      setSelectedBanner(normalizedBanner ?? null);
    },
    [clearMaskCanvas, resetSaveError, setSelectedBanner],
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

    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      if (maskCanvas.width !== naturalWidth || maskCanvas.height !== naturalHeight) {
        maskCanvas.width = naturalWidth;
        maskCanvas.height = naturalHeight;
      }
      renderMaskFromStoredData();
    }

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
  }, [applyPreviewOffset, renderMaskFromStoredData]);

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

  React.useEffect(() => {
    if (!open) {
      setMaskEnabled(false);
      setIsDrawingMask(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!maskEditable) {
      setMaskEnabled(false);
      maskDataRef.current = null;
      clearMaskCanvas();
      setMaskHasData(false);
      return;
    }
    const nextMask = selectedBanner?.maskDataUrl ?? null;
    maskDataRef.current = nextMask;
    if (nextMask) {
      renderMaskFromStoredData();
    } else if (maskCanvasRef.current) {
      clearMaskCanvas();
      setMaskHasData(false);
    }
  }, [
    clearMaskCanvas,
    maskEditable,
    renderMaskFromStoredData,
    selectedBanner?.maskDataUrl,
  ]);

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
      selected: selectedBanner,
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
      mask: {
        canvasRef: maskCanvasRef,
        enabled: maskEditable && maskEnabled,
        hasMask: maskHasData,
        isDrawing: isDrawingMask,
        toggle: toggleMaskEditing,
        clear: clearMask,
        onPointerDown: handleMaskPointerDown,
      },
    },
    updateSelectedBanner,
  } as const;
}
