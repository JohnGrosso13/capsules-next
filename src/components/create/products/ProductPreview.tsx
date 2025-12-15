/* eslint-disable @next/next/no-img-element */
import * as React from "react";

import styles from "@/components/create/ladders/LadderBuilder.module.css";
import type { ProductPreviewModel } from "./types";
import type { ProductTemplate } from "./templates";

type ProductPreviewProps = {
  model: ProductPreviewModel;
  template: ProductTemplate;
};

export function ProductPreview({ model, template }: ProductPreviewProps) {
  const priceLabel = React.useMemo(() => {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: model.currency?.toUpperCase() || "USD",
    });
    return formatter.format(model.price || 0);
  }, [model.currency, model.price]);

  const mockup = template.mockup ?? {
    aspectRatio: 3 / 4,
    printArea: { x: 0.22, y: 0.2, width: 0.56, height: 0.5 },
    backgroundKind: "generic" as const,
  };

  const printAreaStyle: React.CSSProperties = {
    left: `${mockup.printArea.x * 100}%`,
    top: `${mockup.printArea.y * 100}%`,
    width: `${mockup.printArea.width * 100}%`,
    height: `${mockup.printArea.height * 100}%`,
  };

  const clampedScale = Number.isFinite(model.placementScale)
    ? Math.min(Math.max(model.placementScale, 0.4), 1.4)
    : 1;
  const clampedOffsetX = Number.isFinite(model.placementOffsetX)
    ? Math.min(Math.max(model.placementOffsetX, -1), 1)
    : 0;
  const clampedOffsetY = Number.isFinite(model.placementOffsetY)
    ? Math.min(Math.max(model.placementOffsetY, -1), 1)
    : 0;

  const translateXPercent = clampedOffsetX * 18;
  const translateYPercent = clampedOffsetY * 18;

  const imageStyle: React.CSSProperties = {
    transform: `translate(${translateXPercent}%, ${translateYPercent}%) scale(${clampedScale})`,
    transformOrigin: "center center",
  };

  return (
    <div className={styles.previewEmbed}>
      <div className={styles.previewCard}>
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
          <div className={styles.previewSection}>
            <h4>Mockup</h4>
            <div className={styles.productMockupStage}>
              <div
                className={styles.productMockupInner}
                style={{ aspectRatio: mockup.aspectRatio || 0 }}
              >
                <div className={styles.productMockupSurface} data-kind={mockup.backgroundKind}>
                  <div className={styles.productMockupGarment} data-kind={mockup.backgroundKind}>
                    <div
                      className={styles.productMockupPrintArea}
                      style={printAreaStyle}
                      aria-label="Design placement preview"
                    >
                      {model.imageUrl ? (
                        <img
                          src={model.imageUrl}
                          alt={`${model.title} preview`}
                          className={styles.productMockupImage}
                          style={imageStyle}
                        />
                      ) : (
                        <span className={styles.previewEmpty}>No design linked yet.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
