/* eslint-disable @next/next/no-img-element */
"use client";
import * as React from "react";

import styles from "@/components/create/ladders/LadderBuilder.module.css";

import type { ProductPreviewModel } from "./types";
import type { ProductTemplate } from "./templates";

type ProductMockupProps = {
  imageUrl: string | null;
  template: ProductTemplate;
  preview: ProductPreviewModel;
  selectedColor?: string | null;
};

type MockupConfig = NonNullable<ProductTemplate["mockup"]>;

const DEFAULT_MOCKUP: MockupConfig = {
  aspectRatio: 3 / 4,
  printArea: { x: 0.22, y: 0.2, width: 0.56, height: 0.5 },
  backgroundKind: "generic",
};

function clampScale(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0.4), 1.4) : 1;
}

function clampOffset(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, -1), 1) : 0;
}

function normalizeColorKey(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function clamp01(value: number, pad = 0) {
  const min = 0 - pad;
  const max = 1 + pad;
  return Math.min(Math.max(value, min), max);
}

function resolveBaseImage(
  mockup: ProductTemplate["mockup"] | undefined,
  selectedColor?: string | null,
): string | null {
  if (!mockup) return null;
  const { baseImage, colorImages } = mockup;
  if (!selectedColor || !colorImages) return baseImage ?? null;

  if (selectedColor in colorImages) {
    return colorImages[selectedColor] ?? baseImage ?? null;
  }

  const target = normalizeColorKey(selectedColor);
  if (!target) return baseImage ?? null;

  const match = Object.entries(colorImages).find(([label]) => normalizeColorKey(label) === target);
  if (match) return match[1] ?? baseImage ?? null;

  return baseImage ?? null;
}

type WarpConfig = MockupConfig["warp"];

type FourPoints = [[number, number], [number, number], [number, number], [number, number]];
type TriPoints = [[number, number], [number, number], [number, number]];

type RemoteMockupImage = {
  url: string;
  position: string | null;
  variantIds: number[];
};

function sanitizeWarpConfig(warp?: WarpConfig | null): (WarpConfig & { meshDetail: number; src: FourPoints; dst: FourPoints }) | null {
  if (!warp) return null;
  const src = Array.isArray(warp.src) ? warp.src.slice(0, 4) : [];
  const dst = Array.isArray(warp.dst) ? warp.dst.slice(0, 4) : [];
  if (src.length < 4 || dst.length < 4) return null;

  const isValidPoint = (point: [number, number]) =>
    Array.isArray(point) &&
    point.length === 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]);
  if (!src.every(isValidPoint) || !dst.every(isValidPoint)) return null;

  const padded = 0.08;
  const normalizedSrc = src
    .map(([x, y]) => [clamp01(x, padded), clamp01(y, padded)] as [number, number])
    .slice(0, 4) as FourPoints;
  const normalizedDst = dst
    .map(([x, y]) => [clamp01(x, padded), clamp01(y, padded)] as [number, number])
    .slice(0, 4) as FourPoints;

  const meshDetail = Math.min(Math.max(warp.meshDetail ?? 14, 2), 48);
  return { ...warp, meshDetail, src: normalizedSrc, dst: normalizedDst };
}

function bilerp(u: number, v: number, points: FourPoints): [number, number] {
  const [p00, p10, p11, p01] = points;
  const x =
    (1 - u) * (1 - v) * p00[0] +
    u * (1 - v) * p10[0] +
    u * v * p11[0] +
    (1 - u) * v * p01[0];
  const y =
    (1 - u) * (1 - v) * p00[1] +
    u * (1 - v) * p10[1] +
    u * v * p11[1] +
    (1 - u) * v * p01[1];
  return [x, y];
}

function computeAffineTransform(
  src: TriPoints,
  dst: TriPoints,
): [number, number, number, number, number, number] | null {
  const [sx0, sy0] = src[0];
  const [sx1, sy1] = src[1];
  const [sx2, sy2] = src[2];
  const [dx0, dy0] = dst[0];
  const [dx1, dy1] = dst[1];
  const [dx2, dy2] = dst[2];

  const denom = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return null;

  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom;
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom;
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom;
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom;
  const e =
    (dx0 * (sx1 * sy2 - sx2 * sy1) +
      dx1 * (sx2 * sy0 - sx0 * sy2) +
      dx2 * (sx0 * sy1 - sx1 * sy0)) /
    denom;
  const f =
    (dy0 * (sx1 * sy2 - sx2 * sy1) +
      dy1 * (sx2 * sy0 - sx0 * sy2) +
      dy2 * (sx0 * sy1 - sx1 * sy0)) /
    denom;

  return [a, b, c, d, e, f];
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = url;
  });
}

async function warpImage(url: string, warp: WarpConfig & { meshDetail: number }) {
  try {
    const img = await loadImage(url);
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const targetWidth = Math.max(2, Math.round(img.naturalWidth * scale));
    const targetHeight = Math.max(2, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const srcCorners = warp.src.map(([x, y]) => [x * targetWidth, y * targetHeight]) as FourPoints;
    const dstCorners = warp.dst.map(([x, y]) => [x * targetWidth, y * targetHeight]) as FourPoints;

    const mesh = warp.meshDetail;
    for (let yi = 0; yi < mesh; yi += 1) {
      for (let xi = 0; xi < mesh; xi += 1) {
        const u0 = xi / mesh;
        const v0 = yi / mesh;
        const u1 = (xi + 1) / mesh;
        const v1 = (yi + 1) / mesh;

        const s00 = bilerp(u0, v0, srcCorners);
        const s10 = bilerp(u1, v0, srcCorners);
        const s11 = bilerp(u1, v1, srcCorners);
        const s01 = bilerp(u0, v1, srcCorners);

        const d00 = bilerp(u0, v0, dstCorners);
        const d10 = bilerp(u1, v0, dstCorners);
        const d11 = bilerp(u1, v1, dstCorners);
        const d01 = bilerp(u0, v1, dstCorners);

        const drawTriangle = (
          srcTri: TriPoints,
          dstTri: TriPoints,
        ) => {
          const transform = computeAffineTransform(srcTri, dstTri);
          if (!transform) return;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(dstTri[0][0], dstTri[0][1]);
          ctx.lineTo(dstTri[1][0], dstTri[1][1]);
          ctx.lineTo(dstTri[2][0], dstTri[2][1]);
          ctx.closePath();
          ctx.clip();
          ctx.setTransform(...transform);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          ctx.restore();
        };

        drawTriangle(
          [s00, s10, s11] as TriPoints,
          [d00, d10, d11] as TriPoints,
        );
        drawTriangle(
          [s00, s11, s01] as TriPoints,
          [d00, d11, d01] as TriPoints,
        );
      }
    }

    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("Failed to apply warp; using original image.", error);
    return null;
  }
}

export function ProductMockup({ imageUrl, template, preview, selectedColor }: ProductMockupProps) {
  const mockup: MockupConfig = { ...DEFAULT_MOCKUP, ...(template.mockup ?? {}) };
  const aspectRatio =
    Number.isFinite(mockup.aspectRatio) && mockup.aspectRatio > 0
      ? mockup.aspectRatio
      : DEFAULT_MOCKUP.aspectRatio;
  const printArea = mockup.printArea ?? DEFAULT_MOCKUP.printArea;
  const backgroundKind = mockup.backgroundKind ?? DEFAULT_MOCKUP.backgroundKind;
  const warpConfig = sanitizeWarpConfig(mockup.warp);
  const baseImageUrl = resolveBaseImage(mockup, selectedColor);
  const hasBaseImage = Boolean(baseImageUrl);
  const maskImageUrl = mockup.maskSvgUrl ?? null;

  const [renderedImageUrl, setRenderedImageUrl] = React.useState<string | null>(imageUrl);
  const [remoteMockups, setRemoteMockups] = React.useState<RemoteMockupImage[]>([]);
  const [remoteActiveIndex, setRemoteActiveIndex] = React.useState(0);
  const [remoteLoading, setRemoteLoading] = React.useState(false);
  const [remoteError, setRemoteError] = React.useState<string | null>(null);

  const printfulImageUrl = React.useMemo(() => {
    if (!imageUrl || !imageUrl.trim().length) return null;
    try {
      const url = new URL(imageUrl, typeof window !== "undefined" ? window.location.origin : undefined);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
    } catch {
      // ignore
    }
    return null;
  }, [imageUrl]);

  React.useEffect(() => {
    setRenderedImageUrl(imageUrl);
  }, [imageUrl]);

  React.useEffect(() => {
    if (!imageUrl || !warpConfig) return;
    let cancelled = false;
    void warpImage(imageUrl, warpConfig).then((result) => {
      if (cancelled) return;
      setRenderedImageUrl(result || imageUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, warpConfig]);

  const resolvedVariantIds = React.useMemo(() => {
    const map = mockup.printful?.variantIdsByColor;
    if (!map) return [];
    const normalize = (value?: string | null) => normalizeColorKey(value);
    const target = normalize(selectedColor);
    const candidates: Array<number | number[]> = [];
    if (target && map[target] !== undefined) candidates.push(map[target]!);
    const directMatch = Object.entries(map).find(
      ([key]) => normalize(key) === target && map[key] !== undefined,
    );
    if (directMatch) candidates.push(directMatch[1]);
    if (map["*"] !== undefined) candidates.push(map["*"]!);
    if (map["default"] !== undefined) candidates.push(map["default"]!);
    if (candidates.length === 0) return [];
    const ids: number[] = [];
    candidates.forEach((entry) => {
      if (typeof entry === "number" && Number.isFinite(entry)) ids.push(entry);
      if (Array.isArray(entry)) {
        entry.forEach((value) => {
          if (typeof value === "number" && Number.isFinite(value)) ids.push(value);
        });
      }
    });
    return ids;
  }, [mockup.printful?.variantIdsByColor, selectedColor]);

  const remoteSignature = React.useMemo(
    () =>
      [
        mockup.printful?.productId ?? "",
        mockup.printful?.placement ?? "",
        mockup.printful?.storeId ?? "",
        printfulImageUrl ?? "",
        resolvedVariantIds.join(","),
      ].join("|"),
    [mockup.printful?.placement, mockup.printful?.productId, mockup.printful?.storeId, printfulImageUrl, resolvedVariantIds],
  );

  const canRequestRemote =
    Boolean(mockup.printful?.productId) && Boolean(printfulImageUrl) && resolvedVariantIds.length > 0;

  React.useEffect(() => {
    if (mockup.printful && imageUrl && !printfulImageUrl) {
      setRemoteError("Image must be a public http/https URL for Printful preview.");
    }
  }, [imageUrl, mockup.printful, printfulImageUrl]);

  React.useEffect(() => {
    if (!canRequestRemote) {
      setRemoteMockups([]);
      setRemoteActiveIndex(0);
      setRemoteLoading(false);
      if (mockup.printful && imageUrl && !printfulImageUrl) {
        setRemoteError("Image must be a public http/https URL for Printful preview.");
      } else {
        setRemoteError(null);
      }
      return;
    }
    const controller = new AbortController();
    setRemoteLoading(true);
    setRemoteError(null);
    const run = async () => {
      try {
        const response = await fetch("/api/store/printful-mockup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: mockup.printful?.productId,
            variantIds: resolvedVariantIds,
            imageUrl: printfulImageUrl,
            placement: mockup.printful?.placement ?? "front",
            storeId: mockup.printful?.storeId ?? undefined,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || "Printful mockup request failed");
        }
        const json = (await response.json()) as { mockups?: RemoteMockupImage[] };
        const list = Array.isArray(json.mockups) ? json.mockups.filter((m) => m?.url) : [];
        setRemoteMockups(list);
        setRemoteActiveIndex(0);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRemoteMockups([]);
        setRemoteActiveIndex(0);
        setRemoteError(error instanceof Error ? error.message : "Printful mockup failed");
      } finally {
        if (!controller.signal.aborted) setRemoteLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [canRequestRemote, imageUrl, mockup.printful?.placement, mockup.printful?.productId, mockup.printful?.storeId, printfulImageUrl, remoteSignature, resolvedVariantIds]);

  const printAreaStyle: React.CSSProperties = {
    left: `${printArea.x * 100}%`,
    top: `${printArea.y * 100}%`,
    width: `${printArea.width * 100}%`,
    height: `${printArea.height * 100}%`,
    ...(maskImageUrl
      ? {
          maskImage: `url(${maskImageUrl})`,
          WebkitMaskImage: `url(${maskImageUrl})`,
          maskSize: "cover",
          WebkitMaskSize: "cover",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }
      : undefined),
  };

  const clampedScale = clampScale(preview.placementScale);
  const clampedOffsetX = clampOffset(preview.placementOffsetX);
  const clampedOffsetY = clampOffset(preview.placementOffsetY);

  const translateXPercent = clampedOffsetX * 18;
  const translateYPercent = clampedOffsetY * 18;

  const imageStyle: React.CSSProperties = {
    transform: `translate(${translateXPercent}%, ${translateYPercent}%) scale(${clampedScale})`,
    transformOrigin: "center center",
  };

  const innerStyle: React.CSSProperties = {
    aspectRatio,
    paddingTop: `${(1 / aspectRatio) * 100}%`,
  };

  const activeRemote = remoteMockups[remoteActiveIndex] ?? null;
  const hasRemote = Boolean(activeRemote);

  return (
    <div className={styles.productMockupStage} data-remote={hasRemote ? "true" : undefined}>
      {hasRemote ? (
        <div className={styles.printfulToolbar} aria-live="polite">
          <span className={styles.printfulLabel}>
            {remoteLoading ? "Loading Printful preview…" : "Printful preview"}
          </span>
          <div className={styles.printfulToggleRow}>
            {remoteMockups.map((mockup, index) => (
              <button
                key={`${mockup.url}-${index}`}
                type="button"
                className={styles.printfulToggle}
                data-active={index === remoteActiveIndex ? "true" : undefined}
                onClick={() => setRemoteActiveIndex(index)}
              >
                {mockup.position?.replace(/_/g, " ") || `View ${index + 1}`}
              </button>
            ))}
          </div>
          {remoteError ? <span className={styles.printfulError}>{remoteError}</span> : null}
        </div>
      ) : null}

      <div className={styles.productMockupInner} style={innerStyle}>
        <div
          className={styles.productMockupSurface}
          data-kind={backgroundKind}
          data-has-base={hasBaseImage}
        >
          {hasRemote && activeRemote ? (
            <div className={styles.productMockupRemote} style={{ aspectRatio }}>
              <img
                src={activeRemote.url}
                alt="Printful mockup preview"
                className={styles.productMockupRemoteImage}
                loading="lazy"
              />
            </div>
          ) : (
            <div
              className={styles.productMockupGarment}
              data-kind={backgroundKind}
              data-has-base={hasBaseImage}
              style={{ aspectRatio }}
            >
              {hasBaseImage && baseImageUrl ? (
                <img
                  src={baseImageUrl}
                  alt={`${template.label} base mockup${selectedColor ? ` - ${selectedColor}` : ""}`}
                  className={styles.productMockupBaseImage}
                />
              ) : null}
              <div
                className={styles.productMockupPrintArea}
                style={printAreaStyle}
                aria-label="Design placement preview"
                data-has-base={hasBaseImage}
                data-mask={Boolean(maskImageUrl)}
              >
                {renderedImageUrl ? (
                  <img
                    src={renderedImageUrl}
                    alt={`${template.label} preview`}
                    className={styles.productMockupImage}
                    style={imageStyle}
                  />
                ) : (
                  <span className={styles.previewEmpty}>No design linked yet.</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {remoteError && !hasRemote ? (
        <div className={styles.printfulError} role="status" aria-live="polite">
          {remoteError}
        </div>
      ) : null}
      {remoteLoading && !hasRemote ? (
        <div className={styles.printfulLabel} aria-live="polite">
          Loading Printful preview…
        </div>
      ) : null}
    </div>
  );
}
