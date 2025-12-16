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
  const [variantSelections, setVariantSelections] = React.useState<Record<string, { sizes: string[]; colors: string[] }>>(
    () => {
      const initial: Record<string, { sizes: string[]; colors: string[] }> = {};
      for (const entry of PRODUCT_CATEGORIES) {
        for (const item of entry.items) {
          initial[item.id] = {
            sizes: item.sizes ?? [],
            colors: item.colors ?? [],
          };
        }
      }
      return initial;
    },
  );

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

  const toggleVariant = (templateId: string, kind: "sizes" | "colors", value: string) => {
    const template =
      PRODUCT_CATEGORIES.flatMap((entry) => entry.items).find((item) => item.id === templateId) ?? null;
    const defaults = template
      ? {
          sizes: template.sizes ?? [],
          colors: template.colors ?? [],
        }
      : { sizes: [], colors: [] };
    setVariantSelections((prev) => {
      const current = prev[templateId] ?? defaults;
      const nextSet = new Set(current[kind]);
      if (nextSet.has(value)) {
        nextSet.delete(value);
      } else {
        nextSet.add(value);
      }
      return {
        ...prev,
        [templateId]: { ...current, [kind]: Array.from(nextSet) },
      };
    });
  };

  const setAllVariants = (templateId: string, kind: "sizes" | "colors", values: string[]) => {
    setVariantSelections((prev) => {
      const current = prev[templateId] ?? { sizes: [], colors: [] };
      return {
        ...prev,
        [templateId]: { ...current, [kind]: [...values] },
      };
    });
  };

  const clearVariants = (templateId: string, kind: "sizes" | "colors") => {
    setVariantSelections((prev) => {
      const current = prev[templateId] ?? { sizes: [], colors: [] };
      return {
        ...prev,
        [templateId]: { ...current, [kind]: [] },
      };
    });
  };

  const activeSelection = activeItem
    ? variantSelections[activeItem.id] ?? { sizes: activeItem.sizes ?? [], colors: activeItem.colors ?? [] }
    : { sizes: [], colors: [] };
  const allSizes = activeItem?.sizes ?? [];
  const allColors = activeItem?.colors ?? [];
  const selectedSizes = activeSelection?.sizes ?? allSizes;
  const selectedColors = activeSelection?.colors ?? allColors;

  const hasSizes = allSizes.length > 0;
  const hasColors = allColors.length > 0;
  const sizeCount = hasSizes ? selectedSizes.length : 1;
  const colorCount = hasColors ? selectedColors.length : 1;
  const variantCount = sizeCount * colorCount;
  const nothingSelected = variantCount === 0;

  const startDisabled = disabled || !capsuleId || nothingSelected;

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
                    <div className={styles.wizardVariantHeader}>
                      <div>
                        <div className={styles.wizardVariantLabel}>
                          Sizes <span className={styles.wizardVariantHint}>({selectedSizes.length}/{activeItem.sizes.length})</span>
                        </div>
                        <div className={styles.wizardVariantStatus}>
                          {selectedSizes.length === activeItem.sizes.length
                            ? "All sizes selected"
                            : selectedSizes.length === 0
                              ? "Choose at least one size"
                              : `${selectedSizes.length} selected`}
                        </div>
                      </div>
                      <div className={styles.wizardVariantActions}>
                        <button
                          type="button"
                          className={styles.wizardActionLink}
                          onClick={() => setAllVariants(activeItem.id, "sizes", activeItem.sizes ?? [])}
                        >
                          Select all
                        </button>
                        <span className={styles.wizardActionDivider}>{"\u2022"}</span>
                        <button
                          type="button"
                          className={styles.wizardActionLink}
                          onClick={() => clearVariants(activeItem.id, "sizes")}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className={styles.wizardChips}>
                      {activeItem.sizes.map((size) => {
                        const isActive = selectedSizes.includes(size);
                        return (
                          <button
                            key={size}
                            type="button"
                            className={clsx(
                              styles.wizardChipButton,
                              isActive ? styles.wizardChipActive : styles.wizardChipGhost,
                            )}
                            onClick={() => toggleVariant(activeItem.id, "sizes", size)}
                            aria-pressed={isActive}
                          >
                            <span className={styles.wizardChipLabel}>
                              {isActive ? <span className={styles.wizardChipCheck}>{"\u2713"}</span> : null}
                              {size}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedSizes.length === 0 ? (
                      <div className={styles.wizardVariantWarning}>Select at least one size to continue.</div>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.wizardVariantGroup}>
                    <div className={styles.wizardVariantLabel}>Sizes</div>
                    <div className={styles.wizardHint}>One size product (auto-selected)</div>
                  </div>
                )}
                {activeItem.colors?.length ? (
                  <div className={styles.wizardVariantGroup}>
                    <div className={styles.wizardVariantHeader}>
                      <div>
                        <div className={styles.wizardVariantLabel}>
                          Colors <span className={styles.wizardVariantHint}>({selectedColors.length}/{activeItem.colors.length})</span>
                        </div>
                        <div className={styles.wizardVariantStatus}>
                          {selectedColors.length === activeItem.colors.length
                            ? "All colors selected"
                            : selectedColors.length === 0
                              ? "Choose at least one color"
                              : `${selectedColors.length} selected`}
                        </div>
                      </div>
                      <div className={styles.wizardVariantActions}>
                        <button
                          type="button"
                          className={styles.wizardActionLink}
                          onClick={() => setAllVariants(activeItem.id, "colors", activeItem.colors ?? [])}
                        >
                          Select all
                        </button>
                        <span className={styles.wizardActionDivider}>{"\u2022"}</span>
                        <button
                          type="button"
                          className={styles.wizardActionLink}
                          onClick={() => clearVariants(activeItem.id, "colors")}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className={styles.wizardChips}>
                      {activeItem.colors.map((color) => {
                        const isActive = selectedColors.includes(color);
                        return (
                          <button
                            key={color}
                            type="button"
                            className={clsx(
                              styles.wizardChipButton,
                              isActive ? styles.wizardChipActive : styles.wizardChipGhost,
                            )}
                            onClick={() => toggleVariant(activeItem.id, "colors", color)}
                            aria-pressed={isActive}
                          >
                            <span className={styles.wizardChipLabel}>
                              {isActive ? <span className={styles.wizardChipCheck}>{"\u2713"}</span> : null}
                              {color}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedColors.length === 0 ? (
                      <div className={styles.wizardVariantWarning}>Select at least one color to continue.</div>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.wizardVariantGroup}>
                    <div className={styles.wizardVariantLabel}>Colors</div>
                    <div className={styles.wizardHint}>Single color product (auto-selected)</div>
                  </div>
                )}
              </div>
              <div className={styles.wizardPreviewFooter}>
                <div className={styles.wizardPreviewMeta}>
                  <div className={styles.wizardVariantSummary}>
                    Variants: {variantCount}
                    {hasSizes || hasColors ? (
                      <span className={styles.wizardVariantHint}>
                        {" "}
                        ({hasSizes ? `${selectedSizes.length} size${selectedSizes.length !== 1 ? "s" : ""}` : "One size"}
                        {hasColors ? ` × ${selectedColors.length} color${selectedColors.length !== 1 ? "s" : ""}` : ""})
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.wizardHint}>Fulfillment: Printful \u2022 Shipping: Capsule store settings</div>
                  {nothingSelected ? (
                    <div className={styles.wizardVariantWarning}>Select at least one color or size to start.</div>
                  ) : null}
                </div>
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
