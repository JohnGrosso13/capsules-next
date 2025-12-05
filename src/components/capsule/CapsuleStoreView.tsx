"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Sparkle, Storefront } from "@phosphor-icons/react/dist/ssr";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import {
  type BillingSnapshot,
  type CheckoutDetails,
  type CheckoutStep,
  type PaymentOption,
  type ShippingOption,
  type StoreCartItem,
  type StoreProduct,
  type StoreProductDraft,
  type StoreProductVariant,
  type StoreViewMode,
} from "./store/types";
import { StoreCheckoutSheet } from "./store/StoreCheckoutSheet";
import { StoreCatalog } from "./store/StoreCatalog";
import { StoreCartSidebar } from "./store/StoreCartSidebar";

const storeCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type CapsuleStoreViewProps = {
  capsuleName: string | null;
  storeBannerUrl: string | null;
  mode: StoreViewMode;
  onCustomizeStoreBanner?: () => void;
  prompter?: React.ReactNode;
};

function CapsuleStoreView({
  capsuleName,
  storeBannerUrl,
  mode,
  onCustomizeStoreBanner,
  prompter,
}: CapsuleStoreViewProps) {
  const isFounder = mode === "founder";
  const storeTitle = capsuleName ? `${capsuleName} store` : "Capsule store";

  const [products, setProducts] = React.useState<StoreProduct[]>(() => [
    {
      id: "feature",
      title: "Signature Hoodie",
      description: "Mid-weight fleece hoodie with your capsule mark on the chest.",
      price: 45,
      imageUrl: null,
      memoryId: null,
      featured: true,
      order: 0,
      salesCount: 320,
      createdAt: "2024-12-15T00:00:00.000Z",
      active: true,
      kind: "physical",
      fulfillmentKind: "ship",
      inventoryCount: 42,
      fulfillmentUrl: null,
      variants: [
        { id: "feature-s", label: "Size S", price: 45, inventoryCount: 10 },
        { id: "feature-m", label: "Size M", price: 45, inventoryCount: 16 },
        { id: "feature-l", label: "Size L", price: 45, inventoryCount: 16 },
      ],
    },
    {
      id: "collectible",
      title: "Die-cut Sticker Set",
      description: "Three-pack of matte stickers for laptops, cases, and cameras.",
      price: 9,
      imageUrl: null,
      memoryId: null,
      featured: false,
      order: 1,
      salesCount: 180,
      createdAt: "2025-02-04T00:00:00.000Z",
      active: true,
      kind: "physical",
      fulfillmentKind: "ship",
      inventoryCount: 120,
      fulfillmentUrl: null,
      variants: [],
    },
    {
      id: "bundle",
      title: "Creator Essentials Kit",
      description: "Hoodie + tee + sticker set bundled with a launch discount.",
      price: 79,
      imageUrl: null,
      memoryId: null,
      featured: false,
      order: 2,
      salesCount: 95,
      createdAt: "2025-01-10T00:00:00.000Z",
      active: true,
      kind: "physical",
      fulfillmentKind: "ship",
      inventoryCount: 58,
      fulfillmentUrl: null,
      variants: [
        { id: "bundle-default", label: "Standard pack", price: 79, inventoryCount: 58 },
      ],
    },
    {
      id: "digital",
      title: "Stream Overlay Pack",
      description: "Overlay, alerts, and panels themed for this capsule.",
      price: 24,
      imageUrl: null,
      memoryId: null,
      featured: false,
      order: 3,
      salesCount: 260,
      createdAt: "2025-03-01T00:00:00.000Z",
      active: true,
      kind: "digital",
      fulfillmentKind: "download",
      inventoryCount: null,
      fulfillmentUrl: "https://example.com/downloads/overlay-pack",
      variants: [
        { id: "digital-standard", label: "Standard license", price: 24, inventoryCount: null },
      ],
    },
  ]);
  const visibleProducts = React.useMemo(
    () => (isFounder ? products : products.filter((product) => product.active)),
    [isFounder, products],
  );

  const shippingOptions = React.useMemo<ShippingOption[]>(
    () => [
      { id: "express", label: "Express (2-3 days)", price: 14, detail: "Insured, tracked" },
      { id: "standard", label: "Standard (5-7 days)", price: 6, detail: "Tracked delivery" },
    ],
    [],
  );

const checkoutSteps = React.useMemo<CheckoutStep[]>(
  () => ["shipping", "billing", "review", "confirmation"],
  [],
);
const checkoutStepDetails: Record<CheckoutStep, { label: string; description: string }> = {
  shipping: { label: "Shipping", description: "Contact & delivery" },
  billing: { label: "Billing", description: "Payment & billing" },
  review: { label: "Review", description: "Confirm details" },
  confirmation: { label: "Confirmation", description: "Receipt" },
};

const paymentOptions = React.useMemo<PaymentOption[]>(
  () => [
    { id: "card", label: "Card", detail: "Visa / Mastercard / Amex" },
    { id: "apple", label: "Apple Pay", detail: "Fast checkout on supported devices" },
    { id: "gpay", label: "Google Pay", detail: "Use saved details from Google" },
    ],
  [],
);

const taxRate = 0.0825;
const defaultShipping = shippingOptions[1]?.id ?? shippingOptions[0]?.id ?? "standard";
const defaultPayment = paymentOptions[0]?.id ?? "card";

  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
const [productDraft, setProductDraft] = React.useState<StoreProductDraft | null>(null);
const [memoryPickerFor, setMemoryPickerFor] = React.useState<string | null>(null);
const fileInputRef = React.useRef<HTMLInputElement | null>(null);
const [reorderMode, setReorderMode] = React.useState(false);
const [sortMode, setSortMode] = React.useState<"best" | "new" | "manual">("best");
const [heroProductId, setHeroProductId] = React.useState<string | null>(null);
const [draggingProductId, setDraggingProductId] = React.useState<string | null>(null);
    const [checkoutOpen, setCheckoutOpen] = React.useState(false);
    const [checkoutStep, setCheckoutStep] = React.useState<CheckoutStep>("shipping");
    const [checkoutAttempted, setCheckoutAttempted] = React.useState(false);
    const [checkoutDetails, setCheckoutDetails] = React.useState<CheckoutDetails>(() => ({
      email: "",
      phone: "",
      fullName: "",
    address1: "",
    address2: "",
    city: "",
    region: "",
    postal: "",
    country: "United States",
    shippingOption: defaultShipping,
    paymentMethod: defaultPayment,
    promoCode: "",
    notes: "",
    termsAccepted: false,
    cardName: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvc: "",
    billingSameAsShipping: true,
    billingName: "",
    billingAddress1: "",
    billingAddress2: "",
    billingCity: "",
    billingRegion: "",
    billingPostal: "",
    billingCountry: "United States",
  }));
  const [orderReference, setOrderReference] = React.useState<string | null>(null);
  const currentStepIndex = checkoutSteps.indexOf(checkoutStep);

const {
  user: memoryUser,
  items: memoryItems,
  loading: memoryLoading,
  error: memoryError,
  refresh: refreshMemories,
} = useMemoryUploads("upload");
const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
const currentOrigin = React.useMemo(
  () => (typeof window !== "undefined" ? window.location.origin : null),
  [],
);
const memoryUploads = React.useMemo(
  () => computeDisplayUploads(memoryItems, { origin: currentOrigin, cloudflareEnabled }),
  [cloudflareEnabled, currentOrigin, memoryItems],
);

  const sortedProducts = React.useMemo(() => {
    const list = [...visibleProducts];
    const baseSorted = list.sort((a, b) => {
      // Featured always first.
      if (a.featured !== b.featured) return a.featured ? -1 : 1;

      if (sortMode === "best") {
        if (a.salesCount !== b.salesCount) return b.salesCount - a.salesCount;
        return a.order - b.order;
      }
      if (sortMode === "new") {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        if (aTime !== bTime) return bTime - aTime;
        return a.order - b.order;
      }

      // Manual
      return a.order - b.order;
    });

    return baseSorted;
  }, [sortMode, visibleProducts]);

  const beginEditingProduct = React.useCallback((product: StoreProduct) => {
    setEditingProductId(product.id);
    setProductDraft({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price.toString(),
      imageUrl: product.imageUrl,
      memoryId: product.memoryId ?? null,
      active: product.active,
      featured: product.featured,
      kind: product.kind,
      fulfillmentKind: product.fulfillmentKind,
      inventoryCount: product.inventoryCount,
      fulfillmentUrl: product.fulfillmentUrl,
      variants: product.variants,
    });
    setMemoryPickerFor(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const startNewProduct = React.useCallback(() => {
    const nextId = `product-${Date.now()}`;
    const nextOrder = products.length ? Math.max(...products.map((p) => p.order)) + 1 : 0;
    const fresh: StoreProduct = {
      id: nextId,
      title: "New product",
      description: "Add a description to tell buyers what they'll get.",
      price: 0,
      imageUrl: null,
      memoryId: null,
      featured: false,
      order: nextOrder,
      salesCount: 0,
      createdAt: new Date().toISOString(),
      active: false,
      kind: "physical",
      fulfillmentKind: "ship",
      inventoryCount: null,
      fulfillmentUrl: null,
      variants: [],
    };
    setProducts((previous) => [...previous, fresh]);
    beginEditingProduct(fresh);
  }, [beginEditingProduct, products]);

const cancelEditingProduct = React.useCallback(() => {
  setEditingProductId(null);
  setProductDraft(null);
  setMemoryPickerFor(null);
  if (fileInputRef.current) fileInputRef.current.value = "";
}, []);

const updateDraftField = React.useCallback(
  <K extends keyof Omit<StoreProductDraft, "id">>(field: K, value: StoreProductDraft[K]) => {
    setProductDraft((previous) => (previous ? { ...previous, [field]: value } : previous));
  },
  [],
);

  const updateDraftFieldAny = React.useCallback(
    (field: keyof Omit<StoreProductDraft, "id">, value: unknown) =>
      updateDraftField(field as keyof Omit<StoreProductDraft, "id">, value as never),
    [updateDraftField],
  );

  const addDraftVariant = React.useCallback(() => {
    setProductDraft((previous) =>
      previous
        ? {
            ...previous,
            variants: [
              ...previous.variants,
              {
                id: `variant-${Date.now()}`,
                label: "New option",
                price: null,
                inventoryCount: null,
              },
            ],
          }
        : previous,
    );
  }, []);

  const updateDraftVariant = React.useCallback(
    (variantId: string, updates: Partial<StoreProductVariant>) => {
      setProductDraft((previous) =>
        previous
          ? {
              ...previous,
              variants: previous.variants.map((variant) =>
                variant.id === variantId ? { ...variant, ...updates } : variant,
              ),
            }
          : previous,
      );
    },
    [],
  );

  const removeDraftVariant = React.useCallback((variantId: string) => {
    setProductDraft((previous) =>
      previous
        ? {
            ...previous,
            variants: previous.variants.filter((variant) => variant.id !== variantId),
          }
        : previous,
    );
  }, []);

const applyImageFromFile = React.useCallback((file: File) => {
  const reader = new FileReader();
  reader.onload = () => {
    setProductDraft((previous) =>
      previous && typeof reader.result === "string"
        ? { ...previous, imageUrl: reader.result, memoryId: null }
        : previous,
    );
  };
  reader.readAsDataURL(file);
}, []);

const handleFileInputChange = React.useCallback(
  (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (event.target.value) event.target.value = "";
    if (!file) return;
    applyImageFromFile(file);
  },
  [applyImageFromFile],
);

const handleMemorySelect = React.useCallback((upload: DisplayMemoryUpload) => {
  setProductDraft((previous) =>
    previous ? { ...previous, imageUrl: upload.displayUrl, memoryId: upload.id ?? null } : previous,
  );
  setMemoryPickerFor(null);
}, []);

const clearDraftImage = React.useCallback((productId: string) => {
  setProductDraft((previous) =>
    previous && previous.id === productId ? { ...previous, imageUrl: null, memoryId: null } : previous,
  );
}, []);

  const saveProductDraft = React.useCallback(() => {
    if (!productDraft) return;
    const parsedPrice = Number.parseFloat(productDraft.price);
    const parsedInventory =
      productDraft.inventoryCount === null || Number.isNaN(productDraft.inventoryCount)
        ? null
        : Math.max(0, productDraft.inventoryCount);
    setProducts((previous) =>
      previous.map((product) =>
        product.id === productDraft.id
          ? {
              ...product,
              title: productDraft.title.trim() || "Untitled product",
              description: productDraft.description.trim(),
              price:
                Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : product.price,
              imageUrl: productDraft.imageUrl,
              memoryId: productDraft.memoryId,
              active: productDraft.active,
              kind: productDraft.kind,
              fulfillmentKind: productDraft.fulfillmentKind,
              inventoryCount: parsedInventory,
              fulfillmentUrl: productDraft.fulfillmentUrl?.trim() || null,
              variants: productDraft.variants.map((variant) => ({
                ...variant,
                label: variant.label.trim() || "Option",
                price:
                  typeof variant.price === "number" && Number.isFinite(variant.price)
                    ? variant.price
                    : null,
                inventoryCount:
                  variant.inventoryCount === null || Number.isNaN(variant.inventoryCount)
                    ? null
                    : Math.max(0, variant.inventoryCount),
              })),
            }
          : product,
      ),
    );
    setEditingProductId(null);
    setProductDraft(null);
    setMemoryPickerFor(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [productDraft]);

const openImagePicker = React.useCallback(() => {
  fileInputRef.current?.click();
}, []);

  const toggleFeatured = React.useCallback((productId: string) => {
    setProducts((previous) =>
      previous.map((product) =>
        product.id === productId ? { ...product, featured: !product.featured } : product,
      ),
    );
  }, []);

  const toggleActive = React.useCallback((productId: string) => {
    setProducts((previous) =>
      previous.map((product) =>
        product.id === productId ? { ...product, active: !product.active } : product,
      ),
    );
  }, []);

  const deleteProduct = React.useCallback(
    (productId: string) => {
      setProducts((previous) => previous.filter((product) => product.id !== productId));
      setCart((previous) => {
        if (!(productId in previous)) return previous;
        const next = { ...previous };
        delete next[productId];
        return next;
      });
      if (editingProductId === productId) {
        setEditingProductId(null);
        setProductDraft(null);
      }
    },
    [editingProductId],
  );

const moveProduct = React.useCallback(
  (productId: string, direction: "up" | "down") => {
    setProducts((previous) => {
      const ordered = [...previous].sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return a.order - b.order;
      });
      const index = ordered.findIndex((p) => p.id === productId);
      if (index < 0) return previous;
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= ordered.length) return previous;

      const first = ordered[index];
      const second = ordered[swapIndex];
      if (!first || !second) return previous;

      return previous.map((product) => {
        if (product.id === first.id) return { ...product, order: second.order };
        if (product.id === second.id) return { ...product, order: first.order };
        return product;
      });
    });
  },
  [],
);

const setHeroFromProduct = React.useCallback((productId: string) => {
  setHeroProductId(productId);
}, []);

const handleDragStart = React.useCallback((productId: string) => {
  setDraggingProductId(productId);
}, []);

const handleDragEnd = React.useCallback(() => {
  setDraggingProductId(null);
}, []);

const handleDragOver = React.useCallback(
  (event: React.DragEvent<HTMLElement>, targetId: string) => {
    if (!reorderMode || !draggingProductId || draggingProductId === targetId) return;
    event.preventDefault();
    setProducts((previous) => {
      const ordered = [...previous].sort((a, b) => a.order - b.order);
      const fromIndex = ordered.findIndex((p) => p.id === draggingProductId);
      const toIndex = ordered.findIndex((p) => p.id === targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return previous;

      const updated = [...ordered];
      const [moved] = updated.splice(fromIndex, 1);
      if (!moved) return previous;
      updated.splice(toIndex, 0, moved);

      return updated.map((product, idx) => ({ ...product, order: idx }));
    });
  },
  [draggingProductId, reorderMode],
);

  const updateCheckoutField = React.useCallback(
    (field: keyof typeof checkoutDetails, value: string | boolean) => {
      setCheckoutDetails((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [variantSelection, setVariantSelection] = React.useState<Record<string, string | null>>({});
  const storeSearchId = React.useId();
  const [cartRailRoot, setCartRailRoot] = React.useState<HTMLElement | null>(null);
  const [isRailCompactLayout, setIsRailCompactLayout] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const resolveRoot = () =>
      document.getElementById("capsule-store-cart-rail-root") as HTMLElement | null;
    setCartRailRoot(resolveRoot());

    const media = window.matchMedia("(max-width: 1024px)");
    const handleMedia = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsRailCompactLayout(event.matches);
    };

    handleMedia(media);
    const listener = (event: MediaQueryListEvent) => handleMedia(event);
    media.addEventListener("change", listener);

    return () => {
      media.removeEventListener("change", listener);
    };
  }, []);

  const getDefaultVariantId = React.useCallback((product: StoreProduct): string | null => {
    return product.variants.length ? product.variants[0]?.id ?? null : null;
  }, []);

  const setInitialVariantSelections = React.useCallback(
    (productList: StoreProduct[]) => {
      setVariantSelection((previous) => {
        const next = { ...previous };
        productList.forEach((product) => {
          if (next[product.id] === undefined) {
            next[product.id] = getDefaultVariantId(product);
          }
        });
        return next;
      });
    },
    [getDefaultVariantId],
  );

  React.useEffect(() => {
    setInitialVariantSelections(products);
  }, [products, setInitialVariantSelections]);

  const resolveVariant = React.useCallback(
    (product: StoreProduct, variantId: string | null | undefined): StoreProductVariant | null => {
      if (!variantId) return null;
      return product.variants.find((variant) => variant.id === variantId) ?? null;
    },
    [],
  );

  const updateVariantSelection = React.useCallback(
    (productId: string, variantId: string | null) => {
      setVariantSelection((previous) => ({ ...previous, [productId]: variantId }));
    },
    [],
  );

  const resolveSelectedVariantId = React.useCallback(
    (product: StoreProduct) => {
      const chosen = variantSelection[product.id];
      if (chosen && resolveVariant(product, chosen)) return chosen;
      return getDefaultVariantId(product);
    },
    [getDefaultVariantId, resolveVariant, variantSelection],
  );

  const heroProduct = React.useMemo(() => {
    const direct = heroProductId ? visibleProducts.find((p) => p.id === heroProductId) : null;
    if (direct) return direct;
    const featured = sortedProducts.find((p) => p.featured);
    if (featured) return featured;
    return sortedProducts[0] ?? null;
  }, [heroProductId, sortedProducts, visibleProducts]);
  const heroVariantId = heroProduct ? resolveSelectedVariantId(heroProduct) : null;
  const heroVariant = heroProduct ? resolveVariant(heroProduct, heroVariantId) : null;
  const heroDisplayPrice = heroProduct ? heroVariant?.price ?? heroProduct.price : 0;

  const createCartKey = React.useCallback(
    (productId: string, variantId: string | null | undefined) =>
      `${productId}::${variantId ?? "base"}`,
    [],
  );

  const parseCartKey = React.useCallback(
    (key: string) => {
      const [productId, variantId] = key.split("::");
      return { productId, variantId: variantId === "base" ? null : variantId };
    },
    [],
  );

  const addToCart = React.useCallback(
    (productId: string, variantId?: string | null) => {
      const product = products.find((entry) => entry.id === productId);
      if (!product) return;
      if (!product.active && !isFounder) return;
      const resolvedVariantId =
        variantId ?? variantSelection[productId] ?? getDefaultVariantId(product);
      const key = createCartKey(productId, resolvedVariantId);
      setCart((previous) => ({
        ...previous,
        [key]: (previous[key] ?? 0) + 1,
      }));
    },
    [createCartKey, getDefaultVariantId, isFounder, products, variantSelection],
  );

  const removeFromCart = React.useCallback((cartKey: string) => {
    setCart((previous) => {
      const next = { ...previous };
      delete next[cartKey];
      return next;
    });
  }, []);

  const increment = React.useCallback((cartKey: string) => {
    setCart((previous) => ({
      ...previous,
      [cartKey]: Math.max(1, (previous[cartKey] ?? 0) + 1),
    }));
  }, []);

  const decrement = React.useCallback((cartKey: string) => {
    setCart((previous) => {
      const current = previous[cartKey] ?? 0;
      if (current <= 1) {
        const next = { ...previous };
        delete next[cartKey];
        return next;
      }
      return {
        ...previous,
        [cartKey]: current - 1,
      };
    });
  }, []);

    const cartItems = React.useMemo<StoreCartItem[]>(() => {
      const entries = Object.entries(cart);
      const items = entries
        .map(([key, quantity]) => {
          if (quantity <= 0) return null;
          const { productId, variantId } = parseCartKey(key);
        const product = visibleProducts.find((p) => p.id === productId);
        if (!product) return null;
        const variant = resolveVariant(product, variantId);
        const unitPrice = variant?.price ?? product.price;
        return { key, product, variant, quantity, unitPrice };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        return items;
    }, [cart, parseCartKey, resolveVariant, visibleProducts]);

  const shippingRequired = React.useMemo(
    () => cartItems.some((item) => item.product.fulfillmentKind === "ship"),
    [cartItems],
  );

  const needsBillingAddress = React.useMemo(
    () => !checkoutDetails.billingSameAsShipping || !shippingRequired,
    [checkoutDetails.billingSameAsShipping, shippingRequired],
  );

  React.useEffect(() => {
    if (!shippingRequired || !checkoutDetails.billingSameAsShipping) return;
    setCheckoutDetails((previous) => {
      if (!previous.billingSameAsShipping) return previous;
      const next = {
        ...previous,
        billingName: previous.fullName,
        billingAddress1: previous.address1,
        billingAddress2: previous.address2,
        billingCity: previous.city,
        billingRegion: previous.region,
        billingPostal: previous.postal,
        billingCountry: previous.country || previous.billingCountry || "United States",
      };
      const changed =
        next.billingName !== previous.billingName ||
        next.billingAddress1 !== previous.billingAddress1 ||
        next.billingAddress2 !== previous.billingAddress2 ||
        next.billingCity !== previous.billingCity ||
        next.billingRegion !== previous.billingRegion ||
        next.billingPostal !== previous.billingPostal ||
        next.billingCountry !== previous.billingCountry;
      return changed ? next : previous;
    });
  }, [
    checkoutDetails.address1,
    checkoutDetails.address2,
    checkoutDetails.billingSameAsShipping,
    checkoutDetails.city,
    checkoutDetails.country,
    checkoutDetails.fullName,
    checkoutDetails.postal,
    checkoutDetails.region,
    shippingRequired,
  ]);

  React.useEffect(() => {
    setCart((previous) => {
      const next = { ...previous };
      Object.keys(next).forEach((key) => {
        const { productId, variantId } = parseCartKey(key);
        const product = products.find((p) => p.id === productId);
        const variantMissing = variantId && product ? !resolveVariant(product, variantId) : false;
        if (!product || (!product.active && !isFounder) || variantMissing) {
          delete next[key];
        }
      });
      return next;
    });
  }, [isFounder, parseCartKey, products, resolveVariant]);

  const subtotal = React.useMemo(
    () => cartItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
    [cartItems],
  );

  const selectedShipping = React.useMemo(
    () =>
      shippingRequired
        ? shippingOptions.find((option) => option.id === checkoutDetails.shippingOption)
        : null,
    [checkoutDetails.shippingOption, shippingOptions, shippingRequired],
  );

  React.useEffect(() => {
    if (!shippingRequired) return;
    const hasSelection = shippingOptions.some((option) => option.id === checkoutDetails.shippingOption);
    if (!hasSelection) {
      setCheckoutDetails((previous) => ({
        ...previous,
        shippingOption: defaultShipping,
      }));
    }
  }, [checkoutDetails.shippingOption, defaultShipping, shippingOptions, shippingRequired]);

  const shippingCost = shippingRequired && selectedShipping ? selectedShipping.price : 0;
  const taxEstimate = Math.max(0, subtotal + shippingCost) * taxRate;
  const orderTotal = subtotal + shippingCost + taxEstimate;

  const hasItems = cartItems.length > 0;
  const shouldRenderCartInRail = Boolean(cartRailRoot && !isRailCompactLayout);

  const beginCheckout = React.useCallback(() => {
    if (!hasItems) return;
    setCheckoutStep("shipping");
    setCheckoutAttempted(false);
    setOrderReference(null);
    setCheckoutOpen(true);
  }, [hasItems, setCheckoutStep, setCheckoutAttempted, setOrderReference, setCheckoutOpen]);

  const checkoutErrors = React.useMemo(() => {
    const errors: Record<string, string> = {};
    const email = checkoutDetails.email.trim();
    const emailValid = email.length > 3 && email.includes("@") && email.includes(".");
    if (!emailValid) errors.email = "Enter a valid email.";
    if (shippingRequired && checkoutDetails.fullName.trim().length < 2) errors.fullName = "Enter your full name.";
    if (shippingRequired) {
      if (checkoutDetails.address1.trim().length < 4) errors.address1 = "Enter a street address.";
      if (checkoutDetails.city.trim().length < 2) errors.city = "Enter a city.";
      if (checkoutDetails.region.trim().length < 2) errors.region = "Enter a state or region.";
      if (checkoutDetails.postal.trim().length < 3) errors.postal = "Enter a postal code.";
      if (!checkoutDetails.country.trim().length) errors.country = "Enter a country.";
      const hasShippingSelection = shippingOptions.some(
        (option) => option.id === checkoutDetails.shippingOption,
      );
      if (!hasShippingSelection) errors.shippingOption = "Choose a shipping speed.";
    }
    if (checkoutDetails.cardName.trim().length < 2) errors.cardName = "Name on card required.";
    const digitsOnly = checkoutDetails.cardNumber.replace(/\D+/g, "");
    if (digitsOnly.length < 12) errors.cardNumber = "Enter a valid card number.";
    const expiryValid = /^\d{2}\/\d{2}$/.test(checkoutDetails.cardExpiry.trim());
    if (!expiryValid) errors.cardExpiry = "Use MM/YY format.";
    const cvcValid = /^\\d{3,4}$/.test(checkoutDetails.cardCvc.trim());
    if (!cvcValid) errors.cardCvc = "Enter a 3-4 digit CVC.";
    if (needsBillingAddress) {
      if (checkoutDetails.billingName.trim().length < 2) errors.billingName = "Enter billing name.";
      if (checkoutDetails.billingAddress1.trim().length < 4)
        errors.billingAddress1 = "Enter billing address.";
      if (checkoutDetails.billingCity.trim().length < 2) errors.billingCity = "Enter city.";
      if (checkoutDetails.billingRegion.trim().length < 2) errors.billingRegion = "Enter region.";
      if (checkoutDetails.billingPostal.trim().length < 3) errors.billingPostal = "Enter postal code.";
      if (!checkoutDetails.billingCountry.trim().length) errors.billingCountry = "Enter country.";
    }
    if (!checkoutDetails.termsAccepted) errors.terms = "Please agree to the terms.";
    if (!hasItems) errors.cart = "Add at least one item to checkout.";
    return errors;
  }, [checkoutDetails, hasItems, needsBillingAddress, shippingOptions, shippingRequired]);

  const errorFor = React.useCallback(
    (key: keyof typeof checkoutErrors) => (checkoutAttempted ? checkoutErrors[key] : undefined),
    [checkoutAttempted, checkoutErrors],
  );

  const canPlaceOrder = hasItems && Object.keys(checkoutErrors).length === 0;

  const placeOrder = React.useCallback(() => {
    setCheckoutAttempted(true);
    if (!canPlaceOrder) return;
    const ref = `ORD-${Date.now()}`;
    console.info("capsule.store.place_order", {
      cart,
      cartItems,
      details: checkoutDetails,
      totals: { subtotal, shipping: shippingCost, tax: taxEstimate, total: orderTotal },
      reference: ref,
    });
    setOrderReference(ref);
    setCheckoutStep("confirmation");
  }, [
    canPlaceOrder,
    cart,
    cartItems,
    checkoutDetails,
    orderTotal,
    shippingCost,
    subtotal,
    taxEstimate,
  ]);

  const validateShippingStep = React.useCallback(() => {
    setCheckoutAttempted(true);
    const requiredKeys: (keyof typeof checkoutErrors)[] = ["email"];
    if (shippingRequired) {
      requiredKeys.push(
        "fullName",
        "address1",
        "city",
        "region",
        "postal",
        "country",
        "shippingOption",
      );
    }
    const hasErrors = requiredKeys.some((key) => checkoutErrors[key]);
    if (checkoutErrors.cart) return false;
    return !hasErrors;
  }, [checkoutErrors, shippingRequired]);

  const validateBillingStep = React.useCallback(() => {
    setCheckoutAttempted(true);
    const billingKeys = ["cardName", "cardNumber", "cardExpiry", "cardCvc"] as const;
    const billingAddressKeys = needsBillingAddress
      ? (["billingName", "billingAddress1", "billingCity", "billingRegion", "billingPostal", "billingCountry"] as const)
      : [];
    const hasErrors = [...billingKeys, ...billingAddressKeys].some((key) => checkoutErrors[key]);
    if (checkoutErrors.cart) return false;
    return !hasErrors;
  }, [checkoutErrors, needsBillingAddress]);

  const handleNextStep = React.useCallback(() => {
    if (checkoutStep === "shipping") {
      if (validateShippingStep()) {
        setCheckoutAttempted(false);
        setCheckoutStep("billing");
      }
      return;
    }
    if (checkoutStep === "billing") {
      if (validateBillingStep()) {
        setCheckoutAttempted(false);
        setCheckoutStep("review");
      }
      return;
    }
    if (checkoutStep === "review") {
      placeOrder();
    }
  }, [checkoutStep, placeOrder, validateBillingStep, validateShippingStep]);

  const handleBackStep = React.useCallback(() => {
    const currentIndex = checkoutSteps.indexOf(checkoutStep);
    if (currentIndex <= 0) {
      setCheckoutAttempted(false);
      setCheckoutOpen(false);
      return;
    }
    const previous = checkoutSteps[currentIndex - 1];
    setCheckoutAttempted(false);
    if (previous) {
      setCheckoutStep(previous);
    }
  }, [checkoutStep, checkoutSteps]);

  const selectedPaymentOption = React.useMemo(
    () =>
      paymentOptions.find((option) => option.id === checkoutDetails.paymentMethod) ??
      paymentOptions[0] ?? { id: defaultPayment, label: "Card", detail: "Visa / Mastercard" },
    [checkoutDetails.paymentMethod, defaultPayment, paymentOptions],
  );

  const billingSnapshot = React.useMemo<BillingSnapshot>(
    () =>
      checkoutDetails.billingSameAsShipping && shippingRequired
        ? {
            name: checkoutDetails.fullName,
            address1: checkoutDetails.address1,
            address2: checkoutDetails.address2,
            city: checkoutDetails.city,
            region: checkoutDetails.region,
            postal: checkoutDetails.postal,
            country: checkoutDetails.country,
          }
        : {
            name: checkoutDetails.billingName || checkoutDetails.fullName,
            address1: checkoutDetails.billingAddress1,
            address2: checkoutDetails.billingAddress2,
            city: checkoutDetails.billingCity,
            region: checkoutDetails.billingRegion,
            postal: checkoutDetails.billingPostal,
            country: checkoutDetails.billingCountry,
          },
    [
      checkoutDetails.address1,
      checkoutDetails.address2,
      checkoutDetails.billingAddress1,
      checkoutDetails.billingAddress2,
      checkoutDetails.billingCity,
      checkoutDetails.billingCountry,
      checkoutDetails.billingName,
      checkoutDetails.billingPostal,
      checkoutDetails.billingRegion,
      checkoutDetails.billingSameAsShipping,
      checkoutDetails.city,
      checkoutDetails.country,
      checkoutDetails.fullName,
      checkoutDetails.postal,
      checkoutDetails.region,
      shippingRequired,
    ],
  );

  const maskedCardSummary = React.useMemo(() => {
    const digits = checkoutDetails.cardNumber.replace(/\D+/g, "");
    const last4 = digits.slice(-4);
    return last4 ? `•••• ${last4}` : "Card pending";
  }, [checkoutDetails.cardNumber]);

  const cartSidebarProps = {
    cartItems,
    subtotal,
    hasItems,
    formatCurrency: (value: number) => storeCurrencyFormatter.format(value),
    onBeginCheckout: beginCheckout,
    onIncrement: increment,
    onDecrement: decrement,
    onRemove: removeFromCart,
  };

  return (
    <>
      <div className={`${capTheme.liveCanvas} ${capTheme.storeCanvas}`} aria-label="Capsule store" data-store-canvas="true">
        <div className={capTheme.storeContent}>
          <StoreCatalog
            storeTitle={storeTitle}
            storeBannerUrl={storeBannerUrl}
            prompter={prompter}
            isFounder={isFounder}
          onCustomizeStoreBanner={onCustomizeStoreBanner ?? (() => {})}
          hasInlineCart={!shouldRenderCartInRail}
          heroProduct={heroProduct}
          heroDisplayPrice={heroDisplayPrice}
          sortedProducts={sortedProducts}
          storeSearchId={storeSearchId}
          editingProductId={editingProductId}
          productDraft={productDraft}
          memoryPickerFor={memoryPickerFor}
          memoryUploads={memoryUploads}
          memoryUser={memoryUser}
          memoryLoading={memoryLoading}
          memoryError={memoryError}
          onRefreshMemories={refreshMemories}
          reorderMode={reorderMode}
          sortMode={sortMode}
          draggingProductId={draggingProductId}
          onSetSortMode={(mode) => setSortMode(mode)}
          onToggleReorder={() => setReorderMode((state) => !state)}
          onStartNewProduct={startNewProduct}
          onBeginEditingProduct={beginEditingProduct}
          onCancelEditingProduct={cancelEditingProduct}
          onSaveProductDraft={saveProductDraft}
          onAddDraftVariant={addDraftVariant}
          onUpdateDraftVariant={updateDraftVariant}
          onRemoveDraftVariant={removeDraftVariant}
          onUpdateDraftField={updateDraftFieldAny}
          onFileInputChange={handleFileInputChange}
          onOpenImagePicker={openImagePicker}
          onHandleMemorySelect={handleMemorySelect}
          onSetMemoryPickerFor={setMemoryPickerFor}
          onToggleFeatured={toggleFeatured}
          onToggleActive={toggleActive}
          onDeleteProduct={deleteProduct}
          onMoveProduct={moveProduct}
          onSetHeroFromProduct={setHeroFromProduct}
          onHandleDragStart={handleDragStart}
          onHandleDragEnd={handleDragEnd}
          onHandleDragOver={handleDragOver}
          onUpdateVariantSelection={updateVariantSelection}
          onAddToCart={addToCart}
          getDefaultVariantId={getDefaultVariantId}
          resolveVariant={resolveVariant}
          resolveSelectedVariantId={resolveSelectedVariantId}
          onClearDraftImage={clearDraftImage}
          fileInputRef={fileInputRef}
          formatCurrency={(value) => storeCurrencyFormatter.format(value)}
        />
        {!shouldRenderCartInRail ? <StoreCartSidebar {...cartSidebarProps} /> : null}

        <div className={capTheme.storeSupportRow}>
          <section
            className={`${capTheme.storePanel} ${capTheme.storePanelHighlight} ${capTheme.storeSupportCard}`}
          >
            <header className={capTheme.storePanelHeader}>
              <Sparkle size={18} weight="bold" />
              <div>
                <h3>Fuel this capsule</h3>
                <p>Donate tokens or storage so everyone can create more together.</p>
              </div>
            </header>
            <div className={capTheme.storeSupportActions}>
              <button type="button" className={capTheme.storePrimaryButton}>
                Donate tokens
              </button>
              <button type="button" className={capTheme.storeActionButton}>
                Share support link
              </button>
            </div>
          </section>

          <section className={`${capTheme.storePanel} ${capTheme.storeSupportCard}`}>
            <header className={capTheme.storePanelHeader}>
              <Storefront size={18} weight="bold" />
              <div>
                <h3>Upgrade capsule tier</h3>
                <p>Unlock higher-quality models, more memory, and priority jobs.</p>
              </div>
            </header>
            <div className={capTheme.storeSupportActions}>
              <button type="button" className={capTheme.storeActionButton}>
                View capsule plans
              </button>
              <button type="button" className={capTheme.storeGhostButton}>
                What is included?
              </button>
            </div>
          </section>
        </div>

        <StoreCheckoutSheet
          open={checkoutOpen}
          step={checkoutStep}
          steps={checkoutSteps}
          stepDetails={checkoutStepDetails}
          currentStepIndex={currentStepIndex}
          orderReference={orderReference}
        details={checkoutDetails}
        shippingOptions={shippingOptions}
        paymentOptions={paymentOptions}
        selectedShipping={selectedShipping ?? null}
          selectedPaymentOption={selectedPaymentOption}
          shippingRequired={shippingRequired}
          needsBillingAddress={needsBillingAddress}
          billingSnapshot={billingSnapshot}
          maskedCardSummary={maskedCardSummary}
          cartItems={cartItems}
          subtotal={subtotal}
          shippingCost={shippingCost}
          taxEstimate={taxEstimate}
          orderTotal={orderTotal}
          canPlaceOrder={canPlaceOrder}
          errorFor={errorFor}
          onUpdateField={updateCheckoutField}
          onNextStep={handleNextStep}
          onBackStep={handleBackStep}
          onJumpToStep={setCheckoutStep}
          onPlaceOrder={placeOrder}
          onClose={() => setCheckoutOpen(false)}
          onIncrement={increment}
          onDecrement={decrement}
          onRemove={removeFromCart}
          formatCurrency={(value) => storeCurrencyFormatter.format(value)}
        />
      </div>
      </div>
      {shouldRenderCartInRail && cartRailRoot
        ? createPortal(<StoreCartSidebar {...cartSidebarProps} />, cartRailRoot)
        : null}
    </>
  );
}

export { CapsuleStoreView };
