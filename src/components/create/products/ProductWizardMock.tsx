"use client";

import React from "react";
import clsx from "clsx";

import styles from "@/app/(authenticated)/create/mystore/mystore.page.module.css";

type ProductWizardMockProps = {
  manageHref: string;
  disabled?: boolean;
};

type ProductTemplate = {
  id: string;
  label: string;
  base?: string;
  note?: string;
  sizes?: string[];
  colors?: string[];
};

type ProductCategory = {
  id: string;
  label: string;
  items: ProductTemplate[];
};

const PRODUCT_CATEGORIES: ProductCategory[] = [
  {
    id: "apparel",
    label: "Apparel",
    items: [
      {
        id: "tee",
        label: "Tee (DTG)",
        base: "Bella+Canvas 3001",
        note: "S-4XL, multiple colors",
        sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
        colors: ["Black", "Navy", "White", "Sport Grey"],
      },
      {
        id: "hoodie",
        label: "Hoodie",
        base: "Gildan 18500",
        note: "S-5XL, fleece",
        sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
        colors: ["Black", "Navy", "White", "Sport Grey"],
      },
      {
        id: "crewneck",
        label: "Crewneck",
        base: "Gildan 18000",
        note: "S-5XL",
        sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
        colors: ["Black", "Navy", "Sand", "Sport Grey"],
      },
      {
        id: "joggers",
        label: "Joggers/Leggings",
        base: "All-over",
        note: "Unisex / Women",
        sizes: ["XS", "S", "M", "L", "XL", "2XL"],
        colors: ["Black", "White"],
      },
    ],
  },
  {
    id: "headwear",
    label: "Headwear",
    items: [
      { id: "cap", label: "Hat (Embroidered)", base: "YP Classics 6245CM", note: "Strapback" },
      { id: "trucker", label: "Trucker Cap", base: "YP Classics 6606", note: "Mesh back" },
      { id: "beanie", label: "Beanie", base: "Sportsman SP15", note: "Embroidered" },
    ],
  },
  {
    id: "accessories",
    label: "Accessories",
    items: [
      { id: "tote", label: "Tote Bag", base: "Premium Tote", note: "All-over or classic" },
      { id: "backpack", label: "Backpack", base: "All-over", note: "Padded" },
      { id: "socks", label: "Socks", base: "All-over", note: "Crew" },
      { id: "fannypack", label: "Fanny Pack", base: "All-over", note: "Adjustable strap" },
    ],
  },
  {
    id: "drinkware",
    label: "Drinkware",
    items: [
      { id: "mug", label: "Mug", base: "Ceramic", note: "11oz / 15oz" },
      { id: "tumbler", label: "Tumbler", base: "Stainless", note: "20oz" },
      { id: "bottle", label: "Water Bottle", base: "Stainless", note: "17oz" },
    ],
  },
  {
    id: "wallart",
    label: "Wall Art",
    items: [
      { id: "poster", label: "Poster", base: "Premium Matte", note: "Multiple sizes" },
      { id: "framed", label: "Framed Poster", base: "Matte + Frame", note: "Multiple sizes" },
      { id: "canvas", label: "Canvas", base: "Gallery wrap", note: "Multiple sizes" },
      { id: "metal", label: "Metal Print", base: "Metal", note: "Small/Medium" },
    ],
  },
  {
    id: "phone",
    label: "Phone Cases",
    items: [
      { id: "iphone", label: "iPhone Case", base: "Tough/Glossy", note: "Popular models" },
      { id: "android", label: "Android Case", base: "Select models", note: "Slim/Tough" },
    ],
  },
  {
    id: "stickers",
    label: "Stickers",
    items: [
      { id: "sticker", label: "Kiss-cut Sticker", base: "White/Transparent", note: "Multiple sizes" },
      { id: "decal", label: "Decal", base: "Durable", note: "Indoor/Outdoor" },
    ],
  },
  {
    id: "home",
    label: "Home & Living",
    items: [
      { id: "pillow", label: "Throw Pillow", base: "All-over", note: "Multiple sizes" },
      { id: "blanket", label: "Blanket", base: "Sherpa/Fleece", note: "Multiple sizes" },
      { id: "deskmat", label: "Desk/Mouse Pad", base: "All-over", note: "Gaming sizes" },
      { id: "flag", label: "Flag", base: "All-over", note: "Multiple sizes" },
    ],
  },
];

export function ProductWizardMock({ manageHref, disabled }: ProductWizardMockProps) {
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
                  <div className={styles.wizardBadge}>Printful</div>
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
                  href={manageHref}
                  aria-disabled={disabled}
                  data-disabled={disabled ? "true" : undefined}
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
