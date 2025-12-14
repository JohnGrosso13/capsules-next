"use client";

import * as React from "react";
import {
  CaretDown,
  CaretUp,
  ImageSquare,
  Info,
  MagnifyingGlass,
  MagicWand,
  PushPinSimple,
  UploadSimple,
  ImagesSquare,
} from "@phosphor-icons/react/dist/ssr";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import { ComposerMemoryPicker } from "@/components/composer/components/ComposerMemoryPicker";
import type { MemoryPickerTab } from "@/components/composer/components/ComposerMemoryPicker";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import type { StoreProduct, StoreProductDraft, StoreProductVariant } from "./types";

type StoreCatalogProps = {
  storeTitle: string;
  storeBannerUrl: string | null;
  prompter?: React.ReactNode;
  capsuleId?: string | null;
  isFounder: boolean;
  onCustomizeStoreBanner?: () => void;
  heroProduct: StoreProduct | null;
  heroDisplayPrice: number;
  sortedProducts: StoreProduct[];
  displayProducts: StoreProduct[];
  storeSearchId: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  editingProductId: string | null;
  productDraft: StoreProductDraft | null;
  memoryPickerFor: string | null;
  memoryUploads: DisplayMemoryUpload[];
  memoryAssets: DisplayMemoryUpload[];
  memoryUser: { id: string } | null;
  memoryLoading: boolean;
  memoryError: string | null;
  memoryUploadsHasMore?: boolean;
  memoryAssetsHasMore?: boolean;
  onLoadMoreMemoryUploads?: () => void;
  onLoadMoreMemoryAssets?: () => void;
  onSearchMemories?: (params: {
    tab: MemoryPickerTab;
    query: string;
    page: number;
    pageSize: number;
  }) => Promise<{ items: DisplayMemoryUpload[]; hasMore: boolean; error?: string | null }>;
  memoryAssetsLoading: boolean;
  memoryAssetsError: string | null;
  memoryPickerTab: MemoryPickerTab;
  onMemoryTabChange: (tab: MemoryPickerTab) => void;
  onRefreshMemories: () => void;
  reorderMode: boolean;
  sortMode: "best" | "new" | "manual";
  draggingProductId: string | null;
  onSetSortMode: (mode: "best" | "new" | "manual") => void;
  onToggleReorder: () => void;
  onStartNewProduct: () => void;
  onBeginEditingProduct: (product: StoreProduct) => void;
  onCancelEditingProduct: () => void;
  onSaveProductDraft: () => void;
  onAddDraftVariant: () => void;
  onUpdateDraftVariant: (variantId: string, updates: Partial<StoreProductVariant>) => void;
  onRemoveDraftVariant: (variantId: string) => void;
  onUpdateDraftField: (field: keyof Omit<StoreProductDraft, "id">, value: unknown) => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenImagePicker: () => void;
  onHandleMemorySelect: (upload: DisplayMemoryUpload) => void;
  onSetMemoryPickerFor: (productId: string | null) => void;
  onToggleFeatured: (productId: string) => void;
  onToggleActive: (productId: string) => void;
  onDeleteProduct: (productId: string) => void;
  onMoveProduct: (productId: string, direction: "up" | "down") => void;
  onSetHeroFromProduct: (productId: string) => void;
  onHandleDragStart: (productId: string) => void;
  onHandleDragEnd: () => void;
  onHandleDragOver: (event: React.DragEvent<HTMLElement>, targetId: string) => void;
  onUpdateVariantSelection: (productId: string, variantId: string | null) => void;
  onAddToCart: (productId: string, variantId?: string | null) => void;
  getDefaultVariantId: (product: StoreProduct) => string | null;
  resolveVariant: (product: StoreProduct, variantId: string | null | undefined) => StoreProductVariant | null;
  resolveSelectedVariantId: (product: StoreProduct) => string | null;
  onClearDraftImage: (productId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  formatCurrency: (value: number) => string;
  savingProduct?: boolean;
  saveError?: string | null;
  storeError?: string | null;
  loading?: boolean;
  hasInlineCart: boolean;
};

function StoreCatalog({
  storeBannerUrl,
  prompter,
  capsuleId,
  isFounder,
  onCustomizeStoreBanner,
  heroProduct,
  heroDisplayPrice,
  sortedProducts,
  displayProducts,
  storeSearchId,
  searchValue,
  onSearchChange,
  editingProductId,
  productDraft,
  memoryPickerFor,
  memoryUploads,
  memoryAssets,
  memoryUser: _memoryUser,
  memoryLoading,
  memoryError,
  memoryUploadsHasMore,
  memoryAssetsHasMore,
  onLoadMoreMemoryUploads,
  onLoadMoreMemoryAssets,
  onSearchMemories,
  memoryAssetsLoading,
  memoryAssetsError,
  memoryPickerTab,
  onMemoryTabChange,
  onRefreshMemories: _onRefreshMemories,
  reorderMode,
  sortMode,
  draggingProductId,
  onSetSortMode,
  onToggleReorder,
  onStartNewProduct,
  onBeginEditingProduct,
  onCancelEditingProduct,
  onSaveProductDraft,
  onAddDraftVariant,
  onUpdateDraftVariant,
  onRemoveDraftVariant,
  onUpdateDraftField,
  onFileInputChange,
  onOpenImagePicker,
  onHandleMemorySelect,
  onSetMemoryPickerFor,
  onToggleFeatured,
  onToggleActive,
  onDeleteProduct,
  onMoveProduct,
  onSetHeroFromProduct,
  onHandleDragStart,
  onHandleDragEnd,
  onHandleDragOver,
  onUpdateVariantSelection,
  onAddToCart,
  getDefaultVariantId,
  resolveVariant,
  resolveSelectedVariantId,
  onClearDraftImage,
  fileInputRef,
  formatCurrency,
  hasInlineCart,
  savingProduct,
  saveError,
  storeError,
  loading = false,
}: StoreCatalogProps) {
  const storeHeroBannerStyle = storeBannerUrl
    ? ({
        backgroundImage: `url("${storeBannerUrl}")`,
      } as React.CSSProperties)
    : undefined;
  const myOrdersHref =
    capsuleId && isFounder
      ? `/create/mystore/orders?capsuleId=${encodeURIComponent(capsuleId)}`
      : "/create/mystore/orders";
  const myProductsHref =
    capsuleId && isFounder
      ? `/create/mystore/products?capsuleId=${encodeURIComponent(capsuleId)}`
      : "/create/mystore/products";
  const [heroActionsMenuOpen, setHeroActionsMenuOpen] = React.useState(false);
  const heroActionsMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!heroActionsMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!heroActionsMenuRef.current) return;
      if (heroActionsMenuRef.current.contains(event.target as Node)) return;
      setHeroActionsMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHeroActionsMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [heroActionsMenuOpen]);
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileInputChange}
        style={{ display: "none" }}
      />
      <section className={capTheme.heroWrap}>
        <div
          className={capTheme.heroBanner}
          role="img"
          aria-label="Capsule store banner preview"
          data-has-banner={storeBannerUrl ? "true" : undefined}
        >
          {storeBannerUrl ? (
            <div className={capTheme.heroBannerImage} style={storeHeroBannerStyle} aria-hidden="true" />
          ) : null}
        </div>
        <div className={capTheme.storeHeroActionsBelow}>
          <div className={capTheme.storeHeroActions}>
            <div className={capTheme.storeHeroActionsMenu} ref={heroActionsMenuRef}>
              <button
                type="button"
                className={`${capTheme.heroCustomizeBtn} ${capTheme.storeHeroActionsTrigger ?? ""}`.trim()}
                onClick={() => setHeroActionsMenuOpen((open) => !open)}
                aria-expanded={heroActionsMenuOpen}
                aria-haspopup="menu"
              >
                <span>Store actions</span>
                <CaretDown size={12} weight="bold" />
              </button>
              {heroActionsMenuOpen ? (
                <div className={capTheme.storeHeroActionsMenuSurface} role="menu">
                  {isFounder && onCustomizeStoreBanner ? (
                    <button
                      type="button"
                      className={capTheme.storeHeroActionsMenuItem}
                      onClick={() => {
                        onCustomizeStoreBanner();
                        setHeroActionsMenuOpen(false);
                      }}
                      role="menuitem"
                    >
                      <MagicWand size={16} weight="bold" />
                      <span>Edit banner</span>
                    </button>
                  ) : null}
                  {isFounder && capsuleId ? (
                    <a
                      className={capTheme.storeHeroActionsMenuItem}
                      role="menuitem"
                      href={myProductsHref}
                    >
                      <span>My products</span>
                    </a>
                  ) : null}
                  <a className={capTheme.storeHeroActionsMenuItem} role="menuitem" href={myOrdersHref}>
                    <span>My orders</span>
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className={capTheme.storeShell}>
        {prompter ? <div className={capTheme.storePrompterWrap}>{prompter}</div> : null}

        {storeError ? (
          <div className={capTheme.storePanel} data-variant="destructive" role="alert">
            <p style={{ margin: 0 }}>{storeError}</p>
          </div>
        ) : null}

        <div className={capTheme.storeGrid} data-inline-cart={hasInlineCart ? "true" : "false"}>
          <section className={capTheme.storeMainColumn}>
            {heroProduct
              ? (() => {
                  const selectedHeroVariantId = resolveSelectedVariantId(heroProduct);
                  const heroVariant = resolveVariant(heroProduct, selectedHeroVariantId);
                  const heroStock =
                    heroVariant?.inventoryCount !== undefined && heroVariant?.inventoryCount !== null
                      ? heroVariant.inventoryCount
                      : heroProduct.inventoryCount;
                  const heroOutOfStock =
                    typeof heroStock === "number" && heroStock !== null ? heroStock <= 0 : false;
                  return (
                    <section className={capTheme.storeHeroFeatured}>
                      <div className={capTheme.storeHeroImage}>
                        {heroProduct.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={heroProduct.imageUrl} alt={heroProduct.title} loading="lazy" />
                        ) : (
                          <div className={capTheme.storeImagePlaceholder}>
                            <ImageSquare size={22} weight="duotone" />
                            <span>Feature your best product</span>
                          </div>
                        )}
                      </div>
                      <div className={capTheme.storeHeroDetails}>
                        <div className={capTheme.storeHeroBadge}>Featured spotlight</div>
                        <h3>{heroProduct.title}</h3>
                        <p>{heroProduct.description}</p>
                        <div className={capTheme.storeHeroMeta}>
                          <span>{formatCurrency(heroDisplayPrice)}</span>
                          <span>{heroProduct.salesCount.toLocaleString()} sold</span>
                        </div>
                        {heroOutOfStock ? <p className={capTheme.checkoutError}>Out of stock</p> : null}
                        <div className={capTheme.storeHeroActions}>
                          {heroProduct.variants.length ? (
                            <label className={capTheme.storeFieldInline}>
                              <span>Choose option</span>
                              <select
                                value={resolveSelectedVariantId(heroProduct) ?? ""}
                                onChange={(event) =>
                                  onUpdateVariantSelection(
                                    heroProduct.id,
                                    event.target.value || getDefaultVariantId(heroProduct),
                                  )
                                }
                              >
                                {heroProduct.variants.map((variant) => (
                                  <option key={variant.id} value={variant.id}>
                                    {variant.label} - {formatCurrency(variant.price ?? heroProduct.price)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <button
                            type="button"
                            className={capTheme.storePrimaryButton}
                            onClick={() => onAddToCart(heroProduct.id, resolveSelectedVariantId(heroProduct))}
                            disabled={(!heroProduct.active && !isFounder) || heroOutOfStock}
                          >
                            Add to cart
                          </button>
                          {isFounder ? (
                            <button
                              type="button"
                              className={capTheme.storeGhostButton}
                              onClick={() => onBeginEditingProduct(heroProduct)}
                            >
                              Edit spotlight
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  );
                })()
              : null}
            <header className={capTheme.storeControlsBar}>
              <div>
                <h3 className={capTheme.storeColumnTitle}>Featured products</h3>
              </div>
              <div className={capTheme.storeControlButtons}>
                {isFounder ? (
                  <>
                    <button type="button" className={capTheme.storeControlButton} onClick={onStartNewProduct}>
                      <span>Products</span>
                      <strong>Add listing</strong>
                    </button>
                    <button
                      type="button"
                      className={`${capTheme.storeControlButton} ${reorderMode ? capTheme.storeControlButtonActive : ""}`}
                      onClick={onToggleReorder}
                    >
                      <span>Layout</span>
                      <strong>{reorderMode ? "Reorder: On" : "Reorder"}</strong>
                    </button>
                  </>
                ) : null}
                {(["best", "new", "manual"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`${capTheme.storeControlButton} ${
                      sortMode === mode ? capTheme.storeControlButtonActive : ""
                    }`}
                    onClick={() => onSetSortMode(mode)}
                  >
                    <span>Sort</span>
                    <strong>{mode === "best" ? "Best selling" : mode === "new" ? "Newest" : "Manual"}</strong>
                  </button>
                ))}
              </div>
            </header>

            <label className={capTheme.storeSearch} htmlFor={storeSearchId}>
              <MagnifyingGlass size={18} weight="bold" />
              <input
                id={storeSearchId}
                type="search"
                placeholder="Search drops"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className={capTheme.storeProducts}>
              {loading ? (
                <div className={capTheme.storePanel} style={{ textAlign: "center" }}>
                  <p>Loading store...</p>
                </div>
              ) : displayProducts.length === 0 ? (
                <div className={capTheme.storePanel}>
                  <p style={{ margin: 0 }}>
                    {searchValue.trim().length
                      ? "No products match your search yet."
                      : "No products published yet."}
                  </p>
                </div>
              ) : (
                displayProducts.map((product) => {
                  const index = sortedProducts.findIndex((entry) => entry.id === product.id);
                  const isEditing = editingProductId === product.id;
                  const draft = isEditing && productDraft?.id === product.id ? productDraft : null;
                  const imageUrl = draft ? draft.imageUrl : product.imageUrl;
                  const titleValue = draft ? draft.title : product.title;
                  const descriptionValue = draft ? draft.description : product.description;
                  const priceValue = draft ? draft.price : product.price.toString();
                  const currentKind = draft?.kind ?? product.kind;
                  const currentFulfillment = draft?.fulfillmentKind ?? product.fulfillmentKind;
                  const isPhysicalPrintful = currentKind === "physical";
                  const showFulfillmentUrl =
                    currentKind !== "physical" &&
                    (currentFulfillment === "download" || currentFulfillment === "external");
                  const inventoryManaged = isPhysicalPrintful || currentFulfillment === "download";
                  const fulfillmentInfo = isPhysicalPrintful
                    ? "Physical items are fulfilled by Printful."
                    : "Choose how customers receive this item.";
                  const inventoryInfo = inventoryManaged
                    ? "Inventory is managed automatically for this fulfillment type."
                    : "Set how many units are available for this product.";
                  const selectedVariantId = resolveSelectedVariantId(product);
                  const selectedVariant = resolveVariant(product, selectedVariantId);
                  const displayPrice = selectedVariant?.price ?? product.price;
                  const stockAvailable =
                    selectedVariant?.inventoryCount !== undefined && selectedVariant?.inventoryCount !== null
                      ? selectedVariant.inventoryCount
                      : product.inventoryCount;
                  const outOfStock =
                    typeof stockAvailable === "number" && stockAvailable !== null ? stockAvailable <= 0 : false;
                  const isDragging = draggingProductId === product.id;

                  return (
                    <article
                      key={product.id}
                      className={capTheme.storeProductCard}
                      draggable={reorderMode}
                      onDragStart={() => onHandleDragStart(product.id)}
                      onDragEnd={onHandleDragEnd}
                      onDragOver={(event) => onHandleDragOver(event, product.id)}
                      data-dragging={isDragging ? "true" : undefined}
                    >
                      <div className={capTheme.storeProductTop}>
                        <div className={capTheme.storeProductTopLeft}>
                          {isFounder ? (
                            <button
                              type="button"
                              className={capTheme.storeIconButton}
                              onClick={() => onToggleFeatured(product.id)}
                              aria-label={`${product.featured ? "Unfeature" : "Feature"} ${product.title}`}
                              aria-pressed={product.featured}
                            >
                              <PushPinSimple size={16} weight="bold" />
                            </button>
                          ) : null}
                          {isEditing ? (
                            <span className={capTheme.storeProductLabel}>Editing</span>
                          ) : product.featured ? (
                            <span className={capTheme.storeProductLabel}>Featured</span>
                          ) : !product.active ? (
                            <span className={capTheme.storeProductLabel}>Unpublished</span>
                          ) : outOfStock ? (
                            <span className={capTheme.storeProductLabel}>Out of stock</span>
                          ) : null}
                        </div>
                        {isFounder ? (
                          <div className={capTheme.storeProductTopActions}>
                            {reorderMode ? (
                              <div className={capTheme.storeReorderControls}>
                                <button
                                  type="button"
                                  className={capTheme.storeIconButton}
                                  onClick={() => onMoveProduct(product.id, "up")}
                                  disabled={index === 0}
                                  aria-label={`Move ${product.title} up`}
                                >
                                  <CaretUp size={16} weight="bold" />
                                </button>
                                <button
                                  type="button"
                                  className={capTheme.storeIconButton}
                                  onClick={() => onMoveProduct(product.id, "down")}
                                  disabled={index === sortedProducts.length - 1}
                                  aria-label={`Move ${product.title} down`}
                                >
                                  <CaretDown size={16} weight="bold" />
                                </button>
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className={capTheme.storeProductTopActionButton}
                              onClick={() => onToggleActive(product.id)}
                            >
                              {product.active ? "Unpublish" : "Publish"}
                            </button>
                            <button
                              type="button"
                              className={capTheme.storeProductTopActionButton}
                              onClick={() => onDeleteProduct(product.id)}
                            >
                              Remove
                            </button>
                            <button
                              type="button"
                              className={capTheme.storeProductTopActionButton}
                              onClick={() => (isEditing ? onCancelEditingProduct() : onBeginEditingProduct(product))}
                            >
                              {isEditing ? "Close" : "Edit"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {isEditing ? (
                        <form
                          className={capTheme.storeProductEditor}
                          onSubmit={(event) => {
                            event.preventDefault();
                            onSaveProductDraft();
                          }}
                        >
                          <div className={capTheme.storeEditorMediaColumn}>
                            <div className={capTheme.storeProductImage} data-has-image={imageUrl ? "true" : undefined}>
                              {imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={imageUrl} alt={titleValue || "Store product image"} loading="lazy" />
                              ) : (
                                <div className={capTheme.storeImagePlaceholder}>
                                  <ImageSquare size={22} weight="duotone" />
                                  <span>Upload an image</span>
                                </div>
                              )}
                            </div>
                            <div className={capTheme.storeMediaEditor}>
                              <div className={capTheme.storeMediaControls}>
                                <button type="button" className={capTheme.storeMediaButton} onClick={onOpenImagePicker}>
                                  <UploadSimple size={16} weight="bold" />
                                  Upload image
                                </button>
                                <button
                                  type="button"
                                  className={capTheme.storeMediaButton}
                                  data-variant="ghost"
                                  onClick={() => onSetMemoryPickerFor(product.id)}
                              >
                              <ImagesSquare size={16} weight="bold" />
                              Browse memories
                            </button>
                            {imageUrl ? (
                              <button
                                type="button"
                                className={capTheme.storeGhostButton}
                                onClick={() => onClearDraftImage(product.id)}
                              >
                                Remove image
                              </button>
                            ) : null}
                          </div>
                        </div>
                          </div>

                          <div className={capTheme.storeEditorFieldColumn}>
                            <label className={capTheme.storeField}>
                              <div className={capTheme.storeFieldLabel}>
                                <span>Title</span>
                                <span
                                  className={capTheme.storeInfoIcon}
                                  title="Shown on your storefront and checkout."
                                  aria-label="Shown on your storefront and checkout."
                                >
                                  <Info size={12} weight="bold" />
                                </span>
                              </div>
                              <input
                                type="text"
                                value={titleValue}
                                onChange={(event) => onUpdateDraftField("title", event.target.value)}
                                required
                              />
                            </label>
                            <label className={capTheme.storeField}>
                              <div className={capTheme.storeFieldLabel}>
                                <span>Description</span>
                                <span
                                  className={capTheme.storeInfoIcon}
                                  title="Short summary buyers see before purchasing."
                                  aria-label="Short summary buyers see before purchasing."
                                >
                                  <Info size={12} weight="bold" />
                                </span>
                              </div>
                              <textarea
                                rows={3}
                                value={descriptionValue}
                                onChange={(event) => onUpdateDraftField("description", event.target.value)}
                              />
                            </label>

                            <div className={capTheme.storeFieldRow}>
                              <label className={capTheme.storeField}>
                                <div className={capTheme.storeFieldLabel}>
                                  <span>Price</span>
                                  <span
                                    className={capTheme.storeInfoIcon}
                                    title="Displayed price buyers will see."
                                    aria-label="Displayed price buyers will see."
                                  >
                                    <Info size={12} weight="bold" />
                                  </span>
                                </div>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  value={priceValue}
                                  onChange={(event) => onUpdateDraftField("price", event.target.value)}
                                />
                              </label>
                              {isPhysicalPrintful ? null : (
                                <label className={capTheme.storeField}>
                                  <div className={capTheme.storeFieldLabel}>
                                    <span>SKU (optional)</span>
                                    <span
                                      className={capTheme.storeInfoIcon}
                                      title="Internal code for your own tracking."
                                      aria-label="Internal code for your own tracking."
                                    >
                                      <Info size={12} weight="bold" />
                                    </span>
                                  </div>
                                  <input
                                    type="text"
                                    value={draft?.sku ?? product.sku ?? ""}
                                    onChange={(event) => onUpdateDraftField("sku", event.target.value)}
                                    placeholder="SKU for this product"
                                  />
                                </label>
                              )}
                            </div>

                            <div className={capTheme.storeFieldRow}>
                              <label className={capTheme.storeField}>
                                <div className={capTheme.storeFieldLabel}>
                                  <span>Kind</span>
                                  <span
                                    className={capTheme.storeInfoIcon}
                                    title="Choose whether this is physical, digital, or a service."
                                    aria-label="Choose whether this is physical, digital, or a service."
                                  >
                                    <Info size={12} weight="bold" />
                                  </span>
                                </div>
                                <select
                                  value={draft?.kind ?? product.kind}
                                  onChange={(event) => onUpdateDraftField("kind", event.target.value)}
                                >
                                  <option value="physical">Physical</option>
                                  <option value="digital">Digital</option>
                                  <option value="service">Service</option>
                                </select>
                              </label>
                              <label className={capTheme.storeField}>
                                <div className={capTheme.storeFieldLabel}>
                                  <span>Fulfillment</span>
                                  <span
                                    className={capTheme.storeInfoIcon}
                                    title={fulfillmentInfo}
                                    aria-label={fulfillmentInfo}
                                  >
                                    <Info size={12} weight="bold" />
                                  </span>
                                </div>
                                <select
                                  value={currentFulfillment}
                                  onChange={(event) => onUpdateDraftField("fulfillmentKind", event.target.value)}
                                  disabled={isPhysicalPrintful}
                                >
                                  <option value="ship">Ship to customer</option>
                                  {!isPhysicalPrintful ? <option value="download">Download link</option> : null}
                                  {!isPhysicalPrintful ? <option value="external">External fulfillment</option> : null}
                                </select>
                              </label>
                            </div>

                            <div className={capTheme.storeFieldRow}>
                              <label className={capTheme.storeField}>
                                <div className={capTheme.storeFieldLabel}>
                                  <span>Inventory</span>
                                  <span
                                    className={capTheme.storeInfoIcon}
                                    title={inventoryInfo}
                                    aria-label={inventoryInfo}
                                  >
                                    <Info size={12} weight="bold" />
                                  </span>
                                </div>
                                <input
                                  type="number"
                                  value={(draft?.inventoryCount ?? product.inventoryCount ?? "").toString()}
                                  onChange={(event) =>
                                    onUpdateDraftField("inventoryCount", Number.parseInt(event.target.value, 10))
                                  }
                                  placeholder={inventoryManaged ? "Managed automatically" : "0"}
                                  disabled={inventoryManaged}
                                />
                              </label>
                              {showFulfillmentUrl ? (
                                <label className={capTheme.storeField}>
                                  <div className={capTheme.storeFieldLabel}>
                                    <span>Fulfillment URL (optional)</span>
                                    <span
                                      className={capTheme.storeInfoIcon}
                                      title="Link or download buyers receive after purchase."
                                      aria-label="Link or download buyers receive after purchase."
                                    >
                                      <Info size={12} weight="bold" />
                                    </span>
                                  </div>
                                  <input
                                    type="url"
                                    value={draft?.fulfillmentUrl ?? product.fulfillmentUrl ?? ""}
                                    onChange={(event) => onUpdateDraftField("fulfillmentUrl", event.target.value)}
                                    placeholder="https://..."
                                  />
                                </label>
                              ) : null}
                            </div>

                            <div className={capTheme.storeVariants}>
                              <div className={capTheme.storeVariantsHeader}>
                                <div className={capTheme.storeFieldLabel}>
                                  <h4>Variants</h4>
                                  <span
                                    className={capTheme.storeInfoIcon}
                                    title="Create options like sizes or colors with their own price and stock."
                                    aria-label="Create options like sizes or colors with their own price and stock."
                                  >
                                    <Info size={12} weight="bold" />
                                  </span>
                                </div>
                                <button type="button" className={capTheme.storeActionButton} onClick={onAddDraftVariant}>
                                  Add option
                                </button>
                              </div>
                              {(draft?.variants ?? product.variants).map((variant) => (
                                <div key={variant.id} className={capTheme.storeVariantRow}>
                                  <input
                                    type="text"
                                    value={variant.label}
                                    onChange={(event) => onUpdateDraftVariant(variant.id, { label: event.target.value })}
                                    placeholder="Label"
                                  />
                                  <input
                                    type="number"
                                    value={variant.price ?? ""}
                                    onChange={(event) =>
                                      onUpdateDraftVariant(variant.id, {
                                        price: event.target.value === "" ? null : Number(event.target.value),
                                      })
                                    }
                                    placeholder="Price"
                                  />
                                  {inventoryManaged ? null : (
                                    <input
                                      type="number"
                                      value={variant.inventoryCount ?? ""}
                                      onChange={(event) =>
                                        onUpdateDraftVariant(variant.id, {
                                          inventoryCount: event.target.value === "" ? null : Number(event.target.value),
                                        })
                                      }
                                      placeholder="Inventory"
                                    />
                                  )}
                                  {isPhysicalPrintful ? null : (
                                    <input
                                      type="text"
                                      value={variant.sku ?? ""}
                                      onChange={(event) =>
                                        onUpdateDraftVariant(variant.id, { sku: event.target.value || null })
                                      }
                                      placeholder="SKU"
                                    />
                                  )}
                                  {isPhysicalPrintful ? null : (
                                    <input
                                      type="text"
                                      value={variant.printfulVariantId ?? ""}
                                      onChange={(event) =>
                                        onUpdateDraftVariant(variant.id, {
                                          printfulVariantId: event.target.value || null,
                                        })
                                      }
                                      placeholder="Printful variant ID"
                                    />
                                  )}
                                  <button
                                    type="button"
                                    className={capTheme.storeGhostButton}
                                    onClick={() => onRemoveDraftVariant(variant.id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className={capTheme.storeEditorActions}>
                              <div className={capTheme.storeToggleGroup}>
                                <label className={capTheme.storeToggle}>
                                  <input
                                    type="checkbox"
                                    checked={draft ? draft.active : product.active}
                                    onChange={(event) => onUpdateDraftField("active", event.target.checked)}
                                  />
                                  <span>Active</span>
                                </label>
                                <label className={capTheme.storeToggle}>
                                  <input
                                    type="checkbox"
                                    checked={draft ? draft.featured : product.featured}
                                    onChange={(event) => onUpdateDraftField("featured", event.target.checked)}
                                  />
                                  <span>Featured</span>
                                </label>
                              </div>
                              <div className={capTheme.storeEditorButtons}>
                                <button type="button" className={capTheme.storeGhostButton} onClick={onCancelEditingProduct}>
                                  Cancel
                                </button>
                                {saveError ? <p className={capTheme.checkoutError}>{saveError}</p> : null}
                                <button type="submit" className={capTheme.storePrimaryButton} disabled={savingProduct}>
                                  {savingProduct ? "Saving..." : "Save changes"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className={capTheme.storeProductImage} data-has-image={product.imageUrl ? "true" : undefined}>
                            {product.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={product.imageUrl} alt={product.title} loading="lazy" />
                            ) : (
                              <div className={capTheme.storeImagePlaceholder}>
                                <ImageSquare size={22} weight="duotone" />
                                <span>Upload an image</span>
                              </div>
                            )}
                          </div>
                          <div className={capTheme.storeProductBody}>
                            <div className={capTheme.storeProductHeader}>
                              <h4 className={capTheme.storeProductTitle}>{titleValue}</h4>
                              {!product.active && isFounder ? (
                                <span className={capTheme.storeProductStatus}>Unpublished</span>
                              ) : null}
                              <p className={capTheme.storeProductDescription}>{descriptionValue}</p>
                            </div>
                            <div className={capTheme.storeProductFooter}>
                              <span className={capTheme.storeProductPrice}>{formatCurrency(displayPrice)}</span>
                              <div className={capTheme.storeProductActions}>
                                {isFounder ? (
                                  <button
                                    type="button"
                                    className={capTheme.storeActionButton}
                                    onClick={() => onSetHeroFromProduct(product.id)}
                                  >
                                    Set as hero
                                  </button>
                                ) : null}
                                {product.variants.length ? (
                                  <label className={capTheme.storeFieldInline}>
                                    <span>Option</span>
                                    <select
                                      value={resolveSelectedVariantId(product) ?? ""}
                                      onChange={(event) =>
                                        onUpdateVariantSelection(
                                          product.id,
                                          event.target.value || getDefaultVariantId(product),
                                        )
                                      }
                                    >
                                      {product.variants.map((variant) => (
                                        <option key={variant.id} value={variant.id}>
                                          {variant.label} - {formatCurrency(variant.price ?? product.price)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}
                                <button
                                  type="button"
                                  className={capTheme.storePrimaryButton}
                                  onClick={() => onAddToCart(product.id, resolveSelectedVariantId(product))}
                                  disabled={(!product.active && !isFounder) || outOfStock}
                                >
                                  Add to cart
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
      {isFounder ? (
        <ComposerMemoryPicker
          open={Boolean(memoryPickerFor)}
          activeTab={memoryPickerTab}
          onTabChange={onMemoryTabChange}
          uploads={memoryUploads}
          uploadsLoading={memoryLoading}
          uploadsError={memoryError}
          uploadsHasMore={Boolean(memoryUploadsHasMore)}
          onLoadMoreUploads={onLoadMoreMemoryUploads ?? (() => {})}
          assets={memoryAssets}
          assetsLoading={memoryAssetsLoading}
          assetsError={memoryAssetsError}
          assetsHasMore={Boolean(memoryAssetsHasMore)}
          onLoadMoreAssets={onLoadMoreMemoryAssets ?? (() => {})}
          searchEnabled
          searchPageSize={24}
          onSearch={
            onSearchMemories ??
            (async () => ({ items: [], hasMore: false, error: "Search unavailable" }))
          }
          onSelect={(upload) => onHandleMemorySelect(upload)}
          onClose={() => onSetMemoryPickerFor(null)}
        />
      ) : null}
    </>
  );
}

export { StoreCatalog };
