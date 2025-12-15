"use client";

import React from "react";
import clsx from "clsx";

import styles from "@/app/(authenticated)/create/mystore/mystore.page.module.css";
import { PRODUCT_CATEGORIES } from "./templates";

type ProductWizardMockProps = {
  manageHref: string;
  builderHref?: string;
  capsuleId?: string | null;
  disabled?: boolean;
};

export function ProductWizardMock({ manageHref, builderHref = "/create/mystore/products/editor", capsuleId, disabled }: ProductWizardMockProps) {
  const [category, setCategory] = React.useState(PRODUCT_CATEGORIES[0]?.id ?? "");
  const [selected, setSelected] = React.useState(PRODUCT_CATEGORIES[0]?.items[0]?.id ?? "");

  const activeCategory = PRODUCT_CATEGORIES.find((entry) => entry.id === category) ?? PRODUCT_CATEGORIES[0];
  const activeItem =
    activeCategory?.items.find((item) => item.id === selected) ?? activeCategory?.items[0] ?? null;

  const handleCategory = (id: string) => {
    setCategory(id);
    const first = PRODUCT_CATEGORIES.find((entry) => entry.id === id)?.items[0];
    if (first) setSelected(first.id);
  };

  const buildStartHref = (templateId: string) => {
    if (!capsuleId) return "#";
    const base = builderHref || "/create/mystore/products/editor";
    const joiner = base.includes("?") ? "&" : "?";
    return `${base}${joiner}capsuleId=${encodeURIComponent(capsuleId)}&template=${encodeURIComponent(templateId)}`;
  };

  const startDisabled = disabled || !capsuleId;

  return (
    <div className={styles.wizardShell}>
      <div className={styles.wizardHeader}>
        <div>
          <div className={styles.wizardTitle}>Add a product</div>
          <div className={styles.wizardSubtitle}>
            Pick from Printful-supported items, then customize art, colors, and pricing.
          </div>
        </div>
        <a
          className={styles.newProductButton}
          href={manageHref}
          aria-disabled={disabled}
          data-disabled={disabled ? "true" : undefined}
        >
          Open store editor
        </a>
      </div>
      <div className={styles.wizardGrid}>
        <div className={styles.wizardSidebar} aria-label="Product categories">
          {PRODUCT_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={clsx(
                styles.wizardCategory,
                entry.id === activeCategory?.id ? styles.wizardCategoryActive : undefined,
              )}
              onClick={() => handleCategory(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className={styles.wizardContent}>
          <div className={styles.wizardList} aria-label="Product templates">
            {activeCategory?.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={clsx(
                  styles.wizardCard,
                  item.id === activeItem?.id ? styles.wizardCardActive : undefined,
                )}
                onClick={() => setSelected(item.id)}
              >
                <div className={styles.wizardCardTop}>
                  <div className={styles.wizardCardTitle}>{item.label}</div>
                </div>
                <div className={styles.wizardCardMeta}>
                  <span>{item.base}</span>
                  {item.note ? <span className={styles.wizardHint}>{item.note}</span> : null}
                </div>
              </button>
            ))}
          </div>
          {activeItem ? (
            <div className={styles.wizardPreview}>
              <div className={styles.wizardPreviewTitle}>{activeItem.label}</div>
              <p className={styles.wizardPreviewBody}>
                Add your artwork, choose colors/sizes, and set your margin. We&apos;ll map this to the matching
                Printful variant so fulfillment stays automatic.
              </p>
              <div className={styles.wizardVariants}>
                {activeItem.sizes?.length ? (
                  <div className={styles.wizardVariantGroup}>
                    <div className={styles.wizardVariantLabel}>Sizes</div>
                    <div className={styles.wizardChips}>
                      {activeItem.sizes.map((size) => (
                        <span key={size} className={styles.wizardChip}>
                          {size}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {activeItem.colors?.length ? (
                  <div className={styles.wizardVariantGroup}>
                    <div className={styles.wizardVariantLabel}>Colors</div>
                    <div className={styles.wizardChips}>
                      {activeItem.colors.map((color) => (
                        <span key={color} className={styles.wizardChip}>
                          {color}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={styles.wizardPreviewFooter}>
                <div className={styles.wizardHint}>Fulfillment: Printful • Shipping: Capsule store settings</div>
                <a
                  className={styles.chipButton}
                  href={startDisabled ? "#" : buildStartHref(activeItem.id)}
                  aria-disabled={startDisabled}
                  data-disabled={startDisabled ? "true" : undefined}
                >
                  Start with {activeItem.label}
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
