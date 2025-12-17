"use client";
import * as React from "react";

import styles from "@/components/create/ladders/LadderBuilder.module.css";
import { resolvePlacement } from "./placement";
import { clampPlacementOffset, clampPlacementScale } from "./placement-types";

import { ProductMockup } from "./ProductMockup";
import type { ProductPreviewModel } from "./types";
import type { ProductTemplate } from "./templates";

type ProductPreviewProps = {
  model: ProductPreviewModel;
  template: ProductTemplate;
  variant?: "panel" | "overlay";
  onPlacementChange?: (value: { scale?: number; offsetX?: number; offsetY?: number }) => void;
};

const COLOR_MATCHES: { match: string; color: string }[] = [
  { match: "black", color: "#0f172a" },
  { match: "white", color: "#f8fafc" },
  { match: "navy", color: "#0a2540" },
  { match: "charcoal", color: "#374151" },
  { match: "grey", color: "#94a3b8" },
  { match: "gray", color: "#94a3b8" },
  { match: "khaki", color: "#c2a26a" },
  { match: "brown", color: "#7b4f2a" },
  { match: "sand", color: "#e7d7b2" },
  { match: "camo", color: "#4b5b32" },
  { match: "silver", color: "#cbd5e1" },
  { match: "gold", color: "#d9b453" },
];

function clampScale(value: number) {
  return clampPlacementScale(value);
}

function clampOffset(value: number) {
  return clampPlacementOffset(value);
}

function resolveColorSwatch(label?: string | null) {
  const normalized = label?.toLowerCase() ?? "";
  const match = COLOR_MATCHES.find((entry) => normalized.includes(entry.match));
  return match ? match.color : null;
}

function uniqueColors(colors: string[]) {
  return Array.from(new Set(colors.filter(Boolean)));
}

export function ProductPreview({ model, template, variant = "panel", onPlacementChange }: ProductPreviewProps) {
  const priceLabel = React.useMemo(() => {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: model.currency?.toUpperCase() || "USD",
    });
    return formatter.format(model.price || 0);
  }, [model.currency, model.price]);

  const previewColors = React.useMemo(() => uniqueColors(model.colors), [model.colors]);
  const [activeColor, setActiveColor] = React.useState<string | null>(model.primaryColor);
  const [localPlacementScale, setLocalPlacementScale] = React.useState(() =>
    clampScale(model.placement.plan.scale),
  );
  const [localPlacementOffsetX, setLocalPlacementOffsetX] = React.useState(() =>
    clampOffset(model.placement.plan.offsetX),
  );
  const [localPlacementOffsetY, setLocalPlacementOffsetY] = React.useState(() =>
    clampOffset(model.placement.plan.offsetY),
  );
  const zoomInputId = React.useId();
  const offsetXInputId = React.useId();
  const offsetYInputId = React.useId();

  React.useEffect(() => {
    setLocalPlacementScale(clampScale(model.placement.plan.scale));
  }, [model.placement.plan.scale]);

  React.useEffect(() => {
    setLocalPlacementOffsetX(clampOffset(model.placement.plan.offsetX));
  }, [model.placement.plan.offsetX]);

  React.useEffect(() => {
    setLocalPlacementOffsetY(clampOffset(model.placement.plan.offsetY));
  }, [model.placement.plan.offsetY]);

  React.useEffect(() => {
    const fallback = model.primaryColor ?? previewColors[0] ?? null;
    if (activeColor && previewColors.includes(activeColor)) return;
    setActiveColor(fallback);
  }, [activeColor, model.primaryColor, previewColors]);

  const selectedColor = activeColor ?? model.primaryColor ?? null;

  const handlePlacementChange = React.useCallback(
    (value: number, axis: "scale" | "x" | "y") => {
      if (axis === "scale") {
        const clamped = clampScale(value);
        setLocalPlacementScale(clamped);
        onPlacementChange?.({ scale: clamped });
        return;
      }
      const clamped = clampOffset(value);
      if (axis === "x") {
        setLocalPlacementOffsetX(clamped);
        onPlacementChange?.({ offsetX: clamped });
        return;
      }
      setLocalPlacementOffsetY(clamped);
      onPlacementChange?.({ offsetY: clamped });
    },
    [onPlacementChange],
  );

  const resetPlacement = React.useCallback(() => {
    const defaultScale = clampScale(1);
    setLocalPlacementScale(defaultScale);
    setLocalPlacementOffsetX(0);
    setLocalPlacementOffsetY(0);
    onPlacementChange?.({ scale: defaultScale, offsetX: 0, offsetY: 0 });
  }, [onPlacementChange]);

  const livePlacement = React.useMemo(
    () => {
      const resolved = resolvePlacement(template, {
        ...model.placement.plan,
        scale: localPlacementScale,
        offsetX: localPlacementOffsetX,
        offsetY: localPlacementOffsetY,
      });
      return {
        ...resolved,
        summary: { ...resolved.summary, warnings: model.placement.summary.warnings },
      };
    },
    [
      localPlacementOffsetX,
      localPlacementOffsetY,
      localPlacementScale,
      model.placement.plan,
      model.placement.summary.warnings,
      template,
    ],
  );

  const mockupPreview = React.useMemo(
    () => ({
      ...model,
      placement: livePlacement,
      placementScale: livePlacement.plan.scale,
      placementOffsetX: livePlacement.plan.offsetX,
      placementOffsetY: livePlacement.plan.offsetY,
    }),
    [livePlacement, model],
  );

  const showZoomControl = true;
  const swatchRow =
    previewColors.length > 0 ? (
      <div className={styles.previewSwatchRow} aria-label="Preview colors">
        {previewColors.map((color) => {
          const swatchColor = resolveColorSwatch(color);
          return (
            <button
              key={color}
              type="button"
              className={styles.previewSwatch}
              data-active={color === selectedColor}
              onClick={() => setActiveColor(color)}
              aria-pressed={color === selectedColor}
            >
              <span
                className={styles.previewSwatchChip}
                data-empty={!swatchColor}
                style={swatchColor ? { background: swatchColor } : undefined}
                aria-hidden="true"
              />
              <span className={styles.previewSwatchLabel}>{color}</span>
            </button>
          );
        })}
      </div>
    ) : null;

  const placementControls = (
    <div className={styles.previewPlacementControls} aria-label="Design placement controls">
      {showZoomControl ? (
        <label className={`${styles.sliderGroup} ${styles.previewZoomControl}`} htmlFor={zoomInputId}>
          <span>Zoom</span>
          <input
            id={zoomInputId}
            type="range"
            min={0.4}
            max={1.4}
            step={0.01}
            value={localPlacementScale}
            onChange={(event) => handlePlacementChange(parseFloat(event.target.value), "scale")}
            aria-label="Adjust design zoom"
          />
        </label>
      ) : null}
      <label className={styles.sliderGroup} htmlFor={offsetXInputId}>
        <span>X offset</span>
        <input
          id={offsetXInputId}
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={localPlacementOffsetX}
          onChange={(event) => handlePlacementChange(parseFloat(event.target.value), "x")}
          aria-label="Move design horizontally"
        />
      </label>
      <label className={styles.sliderGroup} htmlFor={offsetYInputId}>
        <span>Y offset</span>
        <input
          id={offsetYInputId}
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={localPlacementOffsetY}
          onChange={(event) => handlePlacementChange(parseFloat(event.target.value), "y")}
          aria-label="Move design vertically"
        />
      </label>
      <button type="button" className={styles.previewPlacementReset} onClick={resetPlacement}>
        Reset
      </button>
    </div>
  );

  const placementSummary = (
    <div className={styles.previewMetaBlock}>
      <span className={styles.previewMetaLabel}>Placement</span>
      <span className={styles.previewMetaValue}>{livePlacement.summary.text}</span>
    </div>
  );
  const placementWarnings =
    livePlacement.summary.warnings && livePlacement.summary.warnings.length ? (
      <p className={styles.previewMetaHint}>Notes: {livePlacement.summary.warnings.join(" ")}</p>
    ) : null;

  return (
    <div className={styles.previewEmbed} data-variant={variant}>
      <div className={styles.previewCard} data-variant={variant}>
        <div className={styles.previewHeader}>
          <div>
            <span className={styles.previewLabel}>Capsule store</span>
            <div className={styles.previewTitle}>{model.title}</div>
            <p className={styles.previewSummary}>
              {model.summary || "Add a summary to help shoppers decide."}
            </p>
          </div>
          <div className={styles.previewMetaBlock}>
            <span className={styles.previewMetaLabel}>Price</span>
            <span className={styles.previewMetaValue}>{priceLabel}</span>
          </div>
        </div>
        <div className={styles.previewSections}>
          <div className={[styles.previewSection, styles.previewSectionMockup].join(" ")}>
            <div className={styles.previewSectionHeader}>
              <h4>Mockup</h4>
            </div>
            {placementControls}
            {swatchRow}
            <ProductMockup
              imageUrl={model.imageUrl}
              template={template}
              preview={mockupPreview}
              selectedColor={selectedColor}
            />
          </div>
          <div className={styles.previewSection}>
            <h4>Variants</h4>
            <p className={styles.previewMetaHint}>
              Colors: {model.colors.length ? model.colors.join(", ") : "Default"}
            </p>
            <p className={styles.previewMetaHint}>
              Sizes: {model.sizes.length ? model.sizes.join(", ") : "Default"}
            </p>
          </div>
          <div className={styles.previewSection}>
            <h4>Settings</h4>
            <p className={styles.previewMetaHint}>Capsule: {model.capsuleName}</p>
            <p className={styles.previewMetaHint}>Featured: {model.featured ? "Yes" : "No"}</p>
            <p className={styles.previewMetaHint}>
              Publish: {model.publish ? "Immediately" : "Save as draft"}
            </p>
            {placementSummary}
            {placementWarnings}
          </div>
        </div>
      </div>
    </div>
  );
}
