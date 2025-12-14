"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Sparkle, Storefront } from "@phosphor-icons/react/dist/ssr";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import type { MemoryPickerTab } from "@/components/composer/components/ComposerMemoryPicker";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import {
  type BillingSnapshot,
  type CheckoutDetails,
  type CheckoutStep,
  type PaymentOption,
  type ShippingOption,
  type StoreProduct,
  type StoreProductDraft,
  type StoreProductVariant,
  type StoreViewMode,
} from "./store/types";
import { StoreCheckoutSheet } from "./store/StoreCheckoutSheet";
import { StoreCatalog } from "./store/StoreCatalog";
import { StoreCartSidebar } from "./store/StoreCartSidebar";
import { useCapsuleStoreCatalog } from "./store/useCapsuleStoreCatalog";
import { useCapsuleStoreShippingOptions } from "./store/useCapsuleStoreShipping";
import { useCapsuleStoreCart } from "./store/useCapsuleStoreCart";

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

type PaymentElementSlotProps = {
  onReady: (fn: () => Promise<void>) => void;
};

function PaymentElementSlot({ onReady }: PaymentElementSlotProps) {
  const stripe = useStripe();
  const elements = useElements();

  React.useEffect(() => {
    if (!stripe || !elements) return;
    onReady(() =>
      stripe
        .confirmPayment({
          elements,
          redirect: "if_required",
        })
        .then((result) => {
          if (result.error) {
            throw result.error;
          }
        }),
    );
  }, [elements, onReady, stripe]);

  return <PaymentElement options={{ layout: "tabs" }} />;
}

type CapsuleStoreViewProps = {
  capsuleId?: string | null;
  capsuleName: string | null;
  storeBannerUrl: string | null;
  mode: StoreViewMode;
  onCustomizeStoreBanner?: () => void;
  prompter?: React.ReactNode;
};

type CatalogAdminControls = {
  editingProductId: string | null;
  productDraft: StoreProductDraft | null;
  memoryPickerFor: string | null;
  memoryUploads: DisplayMemoryUpload[];
  memoryAssets: DisplayMemoryUpload[];
  memoryUser: { id: string } | null;
  memoryLoading: boolean;
  memoryError: string | null;
  memoryUploadsHasMore: boolean;
  memoryAssetsHasMore: boolean;
  onLoadMoreMemoryUploads: () => void;
  onLoadMoreMemoryAssets: () => void;
  onSearchMemories: (params: {
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
  draggingProductId: string | null;
  heroProductId: string | null;
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
  onClearDraftImage: (productId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  savingProduct?: boolean;
  saveError?: string | null;
};

type ShippingAdminControls = {
  shippingOptions: ShippingOption[];
  shippingSaveBusy: boolean;
  shippingSaveError: string | null;
  addShippingOption: () => void;
  updateShippingOptionField: (optionId: string, field: keyof ShippingOption, value: unknown) => void;
  persistShippingOption: (optionId: string) => Promise<void>;
  deleteShippingOption: (optionId: string) => Promise<void>;
};

const noop = () => {};

function createReadonlyAdminControls(fileInputRef: React.RefObject<HTMLInputElement | null>): CatalogAdminControls {
  return {
    editingProductId: null,
    productDraft: null,
    memoryPickerFor: null,
    memoryUploads: [],
    memoryAssets: [],
    memoryUser: null,
    memoryLoading: false,
    memoryError: null,
    memoryUploadsHasMore: false,
    memoryAssetsHasMore: false,
    onLoadMoreMemoryUploads: () => {},
    onLoadMoreMemoryAssets: () => {},
    onSearchMemories: async () => ({ items: [], hasMore: false, error: "Not available" }),
    memoryAssetsLoading: false,
    memoryAssetsError: null,
    memoryPickerTab: "uploads",
    onMemoryTabChange: noop as CatalogAdminControls["onMemoryTabChange"],
    onRefreshMemories: noop,
    reorderMode: false,
    draggingProductId: null,
    heroProductId: null,
    onToggleReorder: noop,
    onStartNewProduct: noop,
    onBeginEditingProduct: noop,
    onCancelEditingProduct: noop,
    onSaveProductDraft: noop,
    onAddDraftVariant: noop,
    onUpdateDraftVariant: noop as CatalogAdminControls["onUpdateDraftVariant"],
    onRemoveDraftVariant: noop,
    onUpdateDraftField: noop as CatalogAdminControls["onUpdateDraftField"],
    onFileInputChange: noop as CatalogAdminControls["onFileInputChange"],
    onOpenImagePicker: noop,
    onHandleMemorySelect: noop as CatalogAdminControls["onHandleMemorySelect"],
    onSetMemoryPickerFor: noop,
    onToggleFeatured: noop,
    onToggleActive: noop,
    onDeleteProduct: noop,
    onMoveProduct: noop as CatalogAdminControls["onMoveProduct"],
    onSetHeroFromProduct: noop,
    onHandleDragStart: noop,
    onHandleDragEnd: noop,
    onHandleDragOver: noop as CatalogAdminControls["onHandleDragOver"],
    onClearDraftImage: noop,
    fileInputRef,
    savingProduct: false,
    saveError: null,
  };
}

function CapsuleStoreView({
  capsuleId,
  capsuleName,
  storeBannerUrl,
  mode,
  onCustomizeStoreBanner,
  prompter,
}: CapsuleStoreViewProps) {
  const isFounder = mode === "founder";
  const storeTitle = capsuleName ? `${capsuleName} store` : "Capsule store";
  const [storeError, setStoreError] = React.useState<string | null>(null);
  const {
    products,
    setProducts,
    shippingOptions: catalogShippingOptions,
    currency,
    loading: catalogLoading,
    error: catalogError,
  } = useCapsuleStoreCatalog(capsuleId ?? null);

  React.useEffect(() => {
    setStoreError(catalogError);
  }, [catalogError]);

  const formatCurrency = React.useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
        maximumFractionDigits: 2,
      }),
    [currency],
  );
  const formatCurrencyValue = React.useCallback((value: number) => formatCurrency.format(value), [formatCurrency]);

  if (isFounder) {
    return (
      <FounderStoreExperience
        capsuleId={capsuleId}
        storeTitle={storeTitle}
        storeBannerUrl={storeBannerUrl}
        prompter={prompter}
        products={products}
        setProducts={setProducts}
        catalogShippingOptions={catalogShippingOptions}
        currency={currency || "USD"}
        storeError={storeError}
        setStoreError={setStoreError}
        catalogLoading={catalogLoading}
        onCustomizeStoreBanner={onCustomizeStoreBanner ?? noop}
        formatCurrency={formatCurrencyValue}
      />
    );
  }

  return (
    <ShopperStoreExperience
      capsuleId={capsuleId}
      storeTitle={storeTitle}
      storeBannerUrl={storeBannerUrl}
      prompter={prompter}
      products={products}
      catalogShippingOptions={catalogShippingOptions}
      currency={currency || "USD"}
      storeError={storeError}
      setStoreError={setStoreError}
      catalogLoading={catalogLoading}
      onCustomizeStoreBanner={onCustomizeStoreBanner ?? noop}
      formatCurrency={formatCurrencyValue}
    />
  );
}

type StoreExperienceBaseProps = {
  capsuleId?: string | null | undefined;
  storeTitle: string;
  storeBannerUrl: string | null;
  prompter?: React.ReactNode;
  products: StoreProduct[];
  currency: string;
  storeError: string | null;
  setStoreError: (value: string | null) => void;
  catalogLoading: boolean;
  onCustomizeStoreBanner?: () => void;
  formatCurrency: (value: number) => string;
};

type StorefrontExperienceProps = StoreExperienceBaseProps & {
  isFounder: boolean;
  shippingOptions: ShippingOption[];
  adminControls: CatalogAdminControls;
  shippingAdmin?: ShippingAdminControls | null;
};

type ShopperStoreExperienceProps = StoreExperienceBaseProps & { catalogShippingOptions: ShippingOption[] };

type FounderStoreExperienceProps = StoreExperienceBaseProps & {
  catalogShippingOptions: ShippingOption[];
  setProducts: React.Dispatch<React.SetStateAction<StoreProduct[]>>;
};

function ShopperStoreExperience({ catalogShippingOptions, ...rest }: ShopperStoreExperienceProps) {
  const readonlyFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const readonlyAdmin = React.useMemo(() => createReadonlyAdminControls(readonlyFileInputRef), [readonlyFileInputRef]);
  return (
    <StorefrontExperience
      {...rest}
      isFounder={false}
      shippingOptions={catalogShippingOptions}
      adminControls={readonlyAdmin}
    />
  );
}

function FounderStoreExperience({
  catalogShippingOptions,
  setProducts,
  products,
  ...rest
}: FounderStoreExperienceProps) {
  const shipping = useCapsuleStoreShippingOptions({
    capsuleId: rest.capsuleId ?? null,
    currency: rest.currency,
    initialOptions: catalogShippingOptions,
    onError: rest.setStoreError,
  });
  const adminControls = useFounderProductAdmin({
    capsuleId: rest.capsuleId ?? null,
    currency: rest.currency,
    products,
    setProducts,
    onError: rest.setStoreError,
  });

  return (
    <StorefrontExperience
      {...rest}
      products={products}
      isFounder
      shippingOptions={shipping.shippingOptions}
      adminControls={adminControls}
      shippingAdmin={shipping}
    />
  );
}

function StorefrontExperience({
  capsuleId,
  storeTitle,
  storeBannerUrl,
  prompter,
  products,
  shippingOptions,
  storeError,
  setStoreError,
  catalogLoading,
  onCustomizeStoreBanner,
  formatCurrency,
  adminControls,
  shippingAdmin,
  isFounder,
}: StorefrontExperienceProps) {
  const fallbackFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const catalogAdmin = adminControls ?? createReadonlyAdminControls(fallbackFileInputRef);
  const visibleProducts = React.useMemo(
    () => (isFounder ? products : products.filter((product) => product.active)),
    [isFounder, products],
  );

  const [searchQuery, setSearchQuery] = React.useState("");
  const [checkoutTotals, setCheckoutTotals] = React.useState<{
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    currency: string;
  } | null>(null);
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = React.useState<string | null>(null);
  const [orderId, setOrderId] = React.useState<string | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);
  const confirmPaymentRef = React.useRef<(() => Promise<void>) | null>(null);
  const [orderSummary, setOrderSummary] = React.useState<{
    status: string;
    tracking?: string | null;
    carrier?: string | null;
    shippingStatus?: string | null;
    totalCents: number;
    currency: string;
    items: { title: string; quantity: number; unitPriceCents: number }[];
  } | null>(null);
  const [connectStatus, setConnectStatus] = React.useState<{
    loading: boolean;
    enabled: boolean;
    requireAccount: boolean;
    onboardingComplete: boolean;
    accountId: string | null;
    error: string | null;
  }>({
    loading: false,
    enabled: false,
    requireAccount: false,
    onboardingComplete: false,
    accountId: null,
    error: null,
  });
  const checkoutSteps = React.useMemo<CheckoutStep[]>(() => ["shipping", "billing", "review", "confirmation"], []);
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
  const availableShippingOptions = React.useMemo(
    () => shippingOptions.filter((option) => option.active !== false),
    [shippingOptions],
  );
  const defaultShipping = React.useMemo(
    () => availableShippingOptions[1]?.id ?? availableShippingOptions[0]?.id ?? "",
    [availableShippingOptions],
  );
  const defaultPayment = paymentOptions[0]?.id ?? "card";
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
    billingPhone: "",
  }));
  const [orderReference, setOrderReference] = React.useState<string | null>(null);
  const currentStepIndex = checkoutSteps.indexOf(checkoutStep);

  React.useEffect(() => {
    if (!shippingOptions.length) return;
    setCheckoutDetails((previous) => ({
      ...previous,
      shippingOption: previous.shippingOption || shippingOptions[0]?.id || "",
    }));
  }, [shippingOptions]);

  const [variantSelection, setVariantSelection] = React.useState<Record<string, string | null>>({});
  const storeSearchId = React.useId();
  const [cartRailRoot, setCartRailRoot] = React.useState<HTMLElement | null>(null);
  const [isRailCompactLayout, setIsRailCompactLayout] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const resolveRoot = () => document.getElementById("capsule-store-cart-rail-root") as HTMLElement | null;
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

  const getAvailableInventory = React.useCallback(
    (product: StoreProduct, variantId: string | null | undefined) => {
      const variant = resolveVariant(product, variantId);
      const inventory = variant?.inventoryCount ?? product.inventoryCount;
      if (inventory === null || inventory === undefined) return Number.POSITIVE_INFINITY;
      return Math.max(0, inventory);
    },
    [resolveVariant],
  );

  const updateVariantSelection = React.useCallback((productId: string, variantId: string | null) => {
    setVariantSelection((previous) => ({ ...previous, [productId]: variantId }));
  }, []);

  const resolveSelectedVariantId = React.useCallback(
    (product: StoreProduct) => {
      const chosen = variantSelection[product.id];
      if (chosen && resolveVariant(product, chosen)) return chosen;
      return getDefaultVariantId(product);
    },
    [getDefaultVariantId, resolveVariant, variantSelection],
  );

  const [sortMode, setSortMode] = React.useState<"best" | "new" | "manual">("best");

  const sortedProducts = React.useMemo(() => {
    const list = [...visibleProducts];
    const baseSorted = list.sort((a, b) => {
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

      return a.order - b.order;
    });

    return baseSorted;
  }, [sortMode, visibleProducts]);

  const filteredProducts = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedProducts;
    return sortedProducts.filter((product) => {
      const haystack = `${product.title} ${product.description ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, sortedProducts]);

  const heroProduct = React.useMemo(() => {
    const direct = catalogAdmin.heroProductId
      ? visibleProducts.find((product) => product.id === catalogAdmin.heroProductId)
      : null;
    if (direct) return direct;
    const featured = sortedProducts.find((product) => product.featured);
    if (featured) return featured;
    return sortedProducts[0] ?? null;
  }, [catalogAdmin.heroProductId, sortedProducts, visibleProducts]);
  const heroVariantId = heroProduct ? resolveSelectedVariantId(heroProduct) : null;
  const heroVariant = heroProduct ? resolveVariant(heroProduct, heroVariantId) : null;
  const heroDisplayPrice = heroProduct ? heroVariant?.price ?? heroProduct.price : 0;

  const {
    setCart,
    cartItems,
    hasItems,
    parseCartKey,
    addToCart,
    removeFromCart,
    increment,
    decrement,
  } = useCapsuleStoreCart({
    products,
    visibleProducts,
    variantSelection,
    getDefaultVariantId,
    resolveVariant,
    getAvailableInventory,
    isFounder,
    onInventoryError: setStoreError,
  });

  React.useEffect(() => {
    setCheckoutTotals(null);
    setClientSecret(null);
    setPaymentIntentId(null);
    setOrderId(null);
    setOrderSummary(null);
  }, [cartItems, checkoutDetails.country, checkoutDetails.postal, checkoutDetails.shippingOption]);

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
  }, [isFounder, parseCartKey, products, resolveVariant, setCart]);

  const subtotal = React.useMemo(
    () => cartItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
    [cartItems],
  );

  const selectedShipping = React.useMemo(
    () =>
      shippingRequired
        ? availableShippingOptions.find((option) => option.id === checkoutDetails.shippingOption) ?? null
        : null,
    [availableShippingOptions, checkoutDetails.shippingOption, shippingRequired],
  );

  React.useEffect(() => {
    if (!shippingRequired) return;
    const hasSelection = availableShippingOptions.some((option) => option.id === checkoutDetails.shippingOption);
    if (!hasSelection) {
      setCheckoutDetails((previous) => ({
        ...previous,
        shippingOption: availableShippingOptions[0]?.id ?? defaultShipping,
      }));
    }
  }, [availableShippingOptions, checkoutDetails.shippingOption, defaultShipping, shippingRequired]);

  const buildAddressFromCheckout = React.useCallback(
    (target: "shipping" | "billing") => {
      if (target === "shipping") {
        if (!shippingRequired) return null;
        return {
          name: checkoutDetails.fullName || null,
          email: checkoutDetails.email || null,
          phone: checkoutDetails.phone || null,
          line1: checkoutDetails.address1 || null,
          line2: checkoutDetails.address2 || null,
          city: checkoutDetails.city || null,
          region: checkoutDetails.region || null,
          postal: checkoutDetails.postal || null,
          country: checkoutDetails.country || null,
          notes: checkoutDetails.notes || null,
        };
      }
      if (checkoutDetails.billingSameAsShipping) {
        return buildAddressFromCheckout("shipping");
      }
      return {
        name: checkoutDetails.billingName || checkoutDetails.fullName || null,
        email: checkoutDetails.email || null,
        phone: checkoutDetails.billingPhone || checkoutDetails.phone || null,
        line1: checkoutDetails.billingAddress1 || null,
        line2: checkoutDetails.billingAddress2 || null,
        city: checkoutDetails.billingCity || null,
        region: checkoutDetails.billingRegion || null,
        postal: checkoutDetails.billingPostal || null,
        country: checkoutDetails.billingCountry || null,
      };
    },
    [
      checkoutDetails.address1,
      checkoutDetails.address2,
      checkoutDetails.billingAddress1,
      checkoutDetails.billingAddress2,
      checkoutDetails.billingCity,
      checkoutDetails.billingCountry,
      checkoutDetails.billingName,
      checkoutDetails.billingPhone,
      checkoutDetails.billingPostal,
      checkoutDetails.billingRegion,
      checkoutDetails.billingSameAsShipping,
      checkoutDetails.city,
      checkoutDetails.country,
      checkoutDetails.email,
      checkoutDetails.fullName,
      checkoutDetails.notes,
      checkoutDetails.phone,
      checkoutDetails.postal,
      checkoutDetails.region,
      shippingRequired,
    ],
  );

  const fallbackShippingCost = shippingRequired && selectedShipping ? selectedShipping.price : 0;
  const resolvedShippingCost = checkoutTotals?.shipping ?? fallbackShippingCost;
  const resolvedSubtotal = checkoutTotals?.subtotal ?? subtotal;
  const taxEstimate = checkoutTotals?.tax ?? Math.max(0, resolvedSubtotal + resolvedShippingCost) * taxRate;
  const orderTotal = checkoutTotals?.total ?? resolvedSubtotal + resolvedShippingCost + taxEstimate;

  const shouldRenderCartInRail = Boolean(cartRailRoot && !isRailCompactLayout);

  const beginCheckout = React.useCallback(() => {
    if (!hasItems) return;
    setCheckoutTotals(null);
    setClientSecret(null);
    setPaymentIntentId(null);
    setOrderId(null);
    setCheckoutStep("shipping");
    setCheckoutAttempted(false);
    setOrderReference(null);
    setPaymentError(null);
    setCheckoutOpen(true);
  }, [hasItems]);

  const buildCheckoutPayload = React.useCallback(() => {
    if (!capsuleId) throw new Error("Capsule is not available for checkout");
    const shippingAddress = shippingRequired ? buildAddressFromCheckout("shipping") : null;
    const billingAddress = buildAddressFromCheckout("billing");
    const contactEmail = checkoutDetails.email.trim();
    return {
      capsuleId,
      cart: cartItems.map((item) => ({
        productId: item.product.id,
        variantId: item.variant?.id ?? null,
        quantity: item.quantity,
      })),
      contact: {
        email: contactEmail,
        phone: checkoutDetails.phone?.trim() || null,
      },
      shippingOptionId: shippingRequired ? checkoutDetails.shippingOption ?? null : null,
      shippingAddress,
      billingAddress,
      billingSameAsShipping: checkoutDetails.billingSameAsShipping,
      promoCode: checkoutDetails.promoCode || null,
      notes: checkoutDetails.notes || null,
      termsVersion: "v1",
      termsAcceptedAt: new Date().toISOString(),
      paymentMethod: checkoutDetails.paymentMethod,
    };
  }, [
    buildAddressFromCheckout,
    capsuleId,
    cartItems,
    checkoutDetails.billingSameAsShipping,
    checkoutDetails.notes,
    checkoutDetails.paymentMethod,
    checkoutDetails.phone,
    checkoutDetails.promoCode,
    checkoutDetails.shippingOption,
    checkoutDetails.email,
    shippingRequired,
  ]);

  const startCheckoutIntent = React.useCallback(async () => {
    setPaymentError(null);
    setCheckoutBusy(true);
    try {
      const payload = buildCheckoutPayload();
      const response = await fetch("/api/store/checkout-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        let message = `Checkout failed (${response.status})`;
        try {
          const errorJson = (await response.json()) as { message?: string };
          if (errorJson?.message) {
            message = errorJson.message;
          }
        } catch {
          const text = await response.text();
          if (text) message = text;
        }
        throw new Error(message);
      }
      const data: {
        orderId: string;
        paymentIntentId: string;
        clientSecret: string;
        subtotalCents: number;
        shippingCents: number;
        taxCents: number;
        totalCents: number;
        currency: string;
        stripeTaxCalculationId: string | null;
      } = await response.json();
      setOrderId(data.orderId);
      setPaymentIntentId(data.paymentIntentId);
      setClientSecret(data.clientSecret);
      setCheckoutTotals({
        subtotal: data.subtotalCents / 100,
        shipping: data.shippingCents / 100,
        tax: data.taxCents / 100,
        total: data.totalCents / 100,
        currency: data.currency,
      });
      return data;
    } finally {
      setCheckoutBusy(false);
    }
  }, [buildCheckoutPayload]);

  const loadOrderDetails = React.useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/store/orders?orderId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data: {
        orders: Array<{
          order: {
            status: string;
            confirmationCode?: string | null;
            id?: string;
            shippingStatus?: string | null;
            shippingTracking: string | null;
            shippingCarrier: string | null;
            totalCents: number;
            currency: string;
          };
          items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
        }>;
      } = await response.json();
      const entry = data.orders[0];
      if (entry) {
        setOrderReference(entry.order.confirmationCode ?? entry.order.id ?? null);
        setOrderSummary({
          status: entry.order.status,
          tracking: entry.order.shippingTracking,
          carrier: entry.order.shippingCarrier,
          shippingStatus: entry.order.shippingStatus ?? null,
          totalCents: entry.order.totalCents,
          currency: entry.order.currency,
          items: entry.items,
        });
      }
    } catch (error) {
      console.warn("store.orders.detail_load_failed", error);
    }
  }, []);

  const refreshConnectStatus = React.useCallback(async () => {
    if (!capsuleId) return;
    setConnectStatus((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const response = await fetch(`/api/store/connect?capsuleId=${encodeURIComponent(capsuleId)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to load payouts status");
      }
      const data: {
        connectEnabled: boolean;
        requireAccount: boolean;
        platformFeeBasisPoints: number;
        accountId: string | null;
        onboardingComplete: boolean;
        chargesEnabled: boolean;
        payoutsEnabled: boolean;
        detailsSubmitted: boolean;
      } = await response.json();
      setConnectStatus({
        loading: false,
        enabled: data.connectEnabled,
        requireAccount: data.requireAccount,
        onboardingComplete: data.onboardingComplete,
        accountId: data.accountId,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load payouts status";
      setConnectStatus((previous) => ({ ...previous, loading: false, error: message }));
    }
  }, [capsuleId]);

  const startConnectOnboarding = React.useCallback(async () => {
    if (!capsuleId) {
      setStoreError("Capsule is not available.");
      return;
    }
    setConnectStatus((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const response = await fetch("/api/store/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capsuleId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "message" in (payload as Record<string, unknown>)
            ? ((payload as { message?: string }).message ?? "Unable to start Stripe onboarding.")
            : "Unable to start Stripe onboarding.";
        throw new Error(message);
      }
      const onboardingUrl = (payload as { onboardingUrl?: string })?.onboardingUrl;
      if (onboardingUrl && typeof window !== "undefined") {
        window.open(onboardingUrl, "_blank", "noopener,noreferrer");
      }
      await refreshConnectStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start Stripe onboarding.";
      setConnectStatus((previous) => ({ ...previous, error: message }));
      setStoreError(message);
    } finally {
      setConnectStatus((previous) => ({ ...previous, loading: false }));
    }
  }, [capsuleId, refreshConnectStatus, setStoreError]);

  React.useEffect(() => {
    if (!isFounder || !capsuleId) return;
    void refreshConnectStatus();
  }, [capsuleId, isFounder, refreshConnectStatus]);

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
      const hasShippingSelection = availableShippingOptions.some((option) => option.id === checkoutDetails.shippingOption);
      if (!availableShippingOptions.length) {
        errors.shippingOption = "Shipping isn't configured yet for this capsule.";
      } else if (!hasShippingSelection) {
        errors.shippingOption = "Choose a shipping speed.";
      }
    }
    if (needsBillingAddress) {
      if (checkoutDetails.billingName.trim().length < 2) errors.billingName = "Enter billing name.";
      if (checkoutDetails.billingAddress1.trim().length < 4) errors.billingAddress1 = "Enter billing address.";
      if (checkoutDetails.billingCity.trim().length < 2) errors.billingCity = "Enter city.";
      if (checkoutDetails.billingRegion.trim().length < 2) errors.billingRegion = "Enter region.";
      if (checkoutDetails.billingPostal.trim().length < 3) errors.billingPostal = "Enter postal code.";
      if (!checkoutDetails.billingCountry.trim().length) errors.billingCountry = "Enter country.";
    }
    if (!checkoutDetails.termsAccepted) errors.terms = "Please agree to the terms.";
    if (!hasItems) errors.cart = "Add at least one item to checkout.";
    return errors;
  }, [availableShippingOptions, checkoutDetails, hasItems, needsBillingAddress, shippingRequired]);

  const errorFor = React.useCallback(
    (key: keyof typeof checkoutErrors) => (checkoutAttempted ? checkoutErrors[key] : undefined),
    [checkoutAttempted, checkoutErrors],
  );

  const canPlaceOrder = hasItems && Object.keys(checkoutErrors).length === 0;
  const canPlaceOrderNow = canPlaceOrder && Boolean(clientSecret);

  const placeOrder = React.useCallback(async () => {
    setCheckoutAttempted(true);
    setPaymentError(null);
    if (!canPlaceOrder) return;
    if (!clientSecret || !confirmPaymentRef.current) {
      setPaymentError(
        stripePromise
          ? "Payment is not ready yet. Please wait a moment and try again."
          : "Payment is not available. Contact support.",
      );
      return;
    }
    setCheckoutBusy(true);
    try {
      await confirmPaymentRef.current();
      const ref = orderId ?? paymentIntentId ?? `ORD-${Date.now()}`;
      setOrderReference(ref);
      if (orderId) {
        void loadOrderDetails(orderId);
      }
      setCheckoutStep("confirmation");
    } catch (error) {
      const message =
        error && typeof (error as { message?: string }).message === "string"
          ? (error as { message: string }).message
          : "Payment could not be completed. Please check your card and try again.";
      setPaymentError(message);
      setCheckoutStep("billing");
    } finally {
      setCheckoutBusy(false);
    }
  }, [canPlaceOrder, clientSecret, loadOrderDetails, orderId, paymentIntentId]);

  React.useEffect(() => {
    confirmPaymentRef.current = null;
  }, [clientSecret]);

  const handlePaymentReady = React.useCallback((fn: () => Promise<void>) => {
    confirmPaymentRef.current = fn;
  }, []);

  const validateShippingStep = React.useCallback(() => {
    setCheckoutAttempted(true);
    const requiredKeys: (keyof typeof checkoutErrors)[] = ["email"];
    if (shippingRequired) {
      requiredKeys.push("fullName", "address1", "city", "region", "postal", "country", "shippingOption");
    }
    const hasErrors = requiredKeys.some((key) => checkoutErrors[key]);
    if (checkoutErrors.cart) return false;
    return !hasErrors;
  }, [checkoutErrors, shippingRequired]);

  const validateBillingStep = React.useCallback(() => {
    setCheckoutAttempted(true);
    const billingAddressKeys = needsBillingAddress
      ? (["billingName", "billingAddress1", "billingCity", "billingRegion", "billingPostal", "billingCountry"] as const)
      : [];
    const hasErrors = billingAddressKeys.some((key) => checkoutErrors[key]);
    if (checkoutErrors.cart) return false;
    return !hasErrors;
  }, [checkoutErrors, needsBillingAddress]);

  const handleNextStep = React.useCallback(async () => {
    setPaymentError(null);
    if (checkoutStep === "shipping") {
      if (validateShippingStep()) {
        try {
          await startCheckoutIntent();
          setCheckoutAttempted(false);
          setCheckoutStep("billing");
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "We couldn't start checkout. Please check your shipping details and try again.";
          setPaymentError(message);
        }
      }
      return;
    }
    if (checkoutStep === "billing") {
      if (!clientSecret) {
        try {
          await startCheckoutIntent();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "We couldn't start checkout. Please check your shipping details and try again.";
          setPaymentError(message);
          return;
        }
      }
      if (validateBillingStep()) {
        setCheckoutAttempted(false);
        setCheckoutStep("review");
      }
      return;
    }
    if (checkoutStep === "review") {
      await placeOrder();
    }
  }, [checkoutStep, clientSecret, placeOrder, startCheckoutIntent, validateBillingStep, validateShippingStep]);

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

  const maskedCardSummary = clientSecret ? "Payment method ready" : "Payment pending";

  const paymentElementNode =
    clientSecret && stripePromise ? (
      <Elements stripe={stripePromise} options={{ clientSecret }} key={clientSecret}>
        <PaymentElementSlot onReady={handlePaymentReady} />
      </Elements>
    ) : null;

  const cartSidebarProps = {
    cartItems,
    subtotal: resolvedSubtotal,
    hasItems,
    formatCurrency,
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
            capsuleId={capsuleId ?? null}
            isFounder={isFounder}
            onCustomizeStoreBanner={onCustomizeStoreBanner ?? (() => {})}
            hasInlineCart={!shouldRenderCartInRail}
            heroProduct={heroProduct}
            heroDisplayPrice={heroDisplayPrice}
            sortedProducts={sortedProducts}
            storeSearchId={storeSearchId}
            editingProductId={catalogAdmin.editingProductId}
            productDraft={catalogAdmin.productDraft}
            memoryPickerFor={catalogAdmin.memoryPickerFor}
            memoryUploads={catalogAdmin.memoryUploads}
            memoryAssets={catalogAdmin.memoryAssets}
            memoryUser={catalogAdmin.memoryUser}
            memoryLoading={catalogAdmin.memoryLoading}
            memoryError={catalogAdmin.memoryError}
            memoryUploadsHasMore={catalogAdmin.memoryUploadsHasMore}
            memoryAssetsHasMore={catalogAdmin.memoryAssetsHasMore}
            onLoadMoreMemoryUploads={catalogAdmin.onLoadMoreMemoryUploads}
            onLoadMoreMemoryAssets={catalogAdmin.onLoadMoreMemoryAssets}
            onSearchMemories={catalogAdmin.onSearchMemories}
            memoryAssetsLoading={catalogAdmin.memoryAssetsLoading}
            memoryAssetsError={catalogAdmin.memoryAssetsError}
            memoryPickerTab={catalogAdmin.memoryPickerTab}
            onMemoryTabChange={catalogAdmin.onMemoryTabChange}
            onRefreshMemories={catalogAdmin.onRefreshMemories}
            reorderMode={catalogAdmin.reorderMode}
            sortMode={sortMode}
            draggingProductId={catalogAdmin.draggingProductId}
            onSetSortMode={(mode) => setSortMode(mode)}
            onToggleReorder={catalogAdmin.onToggleReorder}
            onStartNewProduct={catalogAdmin.onStartNewProduct}
            onBeginEditingProduct={catalogAdmin.onBeginEditingProduct}
            onCancelEditingProduct={catalogAdmin.onCancelEditingProduct}
            onSaveProductDraft={catalogAdmin.onSaveProductDraft}
            onAddDraftVariant={catalogAdmin.onAddDraftVariant}
            onUpdateDraftVariant={catalogAdmin.onUpdateDraftVariant}
            onRemoveDraftVariant={catalogAdmin.onRemoveDraftVariant}
            onUpdateDraftField={catalogAdmin.onUpdateDraftField}
            onFileInputChange={catalogAdmin.onFileInputChange}
            onOpenImagePicker={catalogAdmin.onOpenImagePicker}
            onHandleMemorySelect={catalogAdmin.onHandleMemorySelect}
            onSetMemoryPickerFor={catalogAdmin.onSetMemoryPickerFor}
            onToggleFeatured={catalogAdmin.onToggleFeatured}
            onToggleActive={catalogAdmin.onToggleActive}
            onDeleteProduct={catalogAdmin.onDeleteProduct}
            onMoveProduct={catalogAdmin.onMoveProduct}
            onSetHeroFromProduct={catalogAdmin.onSetHeroFromProduct}
            onHandleDragStart={catalogAdmin.onHandleDragStart}
            onHandleDragEnd={catalogAdmin.onHandleDragEnd}
            onHandleDragOver={catalogAdmin.onHandleDragOver}
            onUpdateVariantSelection={updateVariantSelection}
            onAddToCart={addToCart}
            getDefaultVariantId={getDefaultVariantId}
            resolveVariant={resolveVariant}
            resolveSelectedVariantId={resolveSelectedVariantId}
            onClearDraftImage={catalogAdmin.onClearDraftImage}
            fileInputRef={catalogAdmin.fileInputRef}
            formatCurrency={formatCurrency}
            savingProduct={catalogAdmin.savingProduct ?? false}
            saveError={catalogAdmin.saveError ?? null}
            storeError={storeError}
            displayProducts={filteredProducts}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            loading={catalogLoading}
          />
          {!shouldRenderCartInRail ? <StoreCartSidebar {...cartSidebarProps} /> : null}

          <div className={capTheme.storeSupportRow}>
            <section
              className={`${capTheme.storePanel} ${capTheme.storePanelHighlight} ${capTheme.storeSupportCard}`}
            >
              <header className={capTheme.storePanelHeader}>
                <Sparkle size={18} weight="bold" />
                <div>
                  <h3>Support options</h3>
                  <p>Donations and boosts are coming soon for this capsule.</p>
                </div>
              </header>
              <div className={capTheme.storeSupportActions}>
                <button type="button" className={capTheme.storePrimaryButton} disabled aria-disabled="true">
                  Coming soon
                </button>
                <button type="button" className={capTheme.storeActionButton} disabled aria-disabled="true">
                  Notify me
                </button>
              </div>
            </section>

            <section className={`${capTheme.storePanel} ${capTheme.storeSupportCard}`}>
              <header className={capTheme.storePanelHeader}>
                <Storefront size={18} weight="bold" />
                <div>
                  <h3>Capsule tiers</h3>
                  <p>Plan upgrades will live here when available.</p>
                </div>
              </header>
              <div className={capTheme.storeSupportActions}>
                <button type="button" className={capTheme.storeActionButton} disabled aria-disabled="true">
                  Coming soon
                </button>
                <button type="button" className={capTheme.storeGhostButton} disabled aria-disabled="true">
                  Preview benefits
                </button>
              </div>
            </section>
          </div>

          {isFounder && capsuleId ? (
            <section className={capTheme.storePanel} style={{ marginTop: "16px" }}>
              <header className={capTheme.storePanelHeader}>
                <h3 style={{ margin: 0 }}>Orders & payouts</h3>
                <p className={capTheme.checkoutHint} style={{ margin: 0 }}>
                  Seller orders live here. Stripe Connect controls when payouts land in your account.
                </p>
              </header>
              {connectStatus.error ? <p className={capTheme.checkoutError}>{connectStatus.error}</p> : null}
              <div className={capTheme.storeSupportActions}>
                <a className={capTheme.storeActionButton} href={`/orders?capsuleId=${capsuleId}`}>
                  View seller orders
                </a>
                <button
                  type="button"
                  className={capTheme.storePrimaryButton}
                  onClick={() => void startConnectOnboarding()}
                  disabled={connectStatus.loading || (!connectStatus.enabled && !connectStatus.onboardingComplete)}
                >
                  {connectStatus.enabled
                    ? connectStatus.onboardingComplete
                      ? "Manage Stripe payouts"
                      : "Connect payouts with Stripe"
                    : "Connect disabled"}
                </button>
              </div>
              <p className={capTheme.checkoutHint} style={{ marginTop: 8, marginBottom: 0 }}>
                View fulfillment updates at the seller orders link above. If Stripe Connect is incomplete, payments
                will route through the platform account until onboarding finishes.
              </p>
              <p className={capTheme.checkoutHint} style={{ marginTop: 4, marginBottom: 0 }}>
                {connectStatus.enabled
                  ? connectStatus.onboardingComplete
                    ? "Payouts are routed to your Stripe account; platform fees apply at checkout."
                    : connectStatus.requireAccount
                      ? "Finish Stripe onboarding to take payments for this capsule."
                      : "Complete Stripe onboarding so payouts can be sent to your account."
                  : "Stripe Connect is disabled here; payments currently run on the platform account."}
              </p>
            </section>
          ) : null}

          {isFounder && shippingAdmin ? (
            <section className={capTheme.storePanel} style={{ marginTop: "16px" }}>
              <header className={capTheme.storePanelHeader}>
                <h3 style={{ margin: 0 }}>Shipping options</h3>
                <p className={capTheme.checkoutHint} style={{ margin: 0 }}>
                  These options power checkout for physical products.
                </p>
              </header>
              {shippingAdmin.shippingSaveError ? (
                <p className={capTheme.checkoutError}>{shippingAdmin.shippingSaveError}</p>
              ) : null}
              <div className={capTheme.storeFieldColumn}>
                {shippingAdmin.shippingOptions.map((option) => (
                  <div key={option.id} className={capTheme.storeFieldRow}>
                    <label className={capTheme.storeField}>
                      <span>Label</span>
                      <input
                        type="text"
                        value={option.label}
                        onChange={(event) =>
                          shippingAdmin.updateShippingOptionField(option.id, "label", event.target.value)
                        }
                      />
                    </label>
                    <label className={capTheme.storeField}>
                      <span>Price</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={option.price}
                        onChange={(event) =>
                          shippingAdmin.updateShippingOptionField(
                            option.id,
                            "price",
                            Number.parseFloat(event.target.value) || 0,
                          )
                        }
                      />
                    </label>
                    <label className={capTheme.storeField}>
                      <span>Detail</span>
                      <input
                        type="text"
                        value={option.detail ?? ""}
                        onChange={(event) =>
                          shippingAdmin.updateShippingOptionField(option.id, "detail", event.target.value)
                        }
                      />
                    </label>
                    <div className={capTheme.storeEditorActions}>
                      <label className={capTheme.storeToggle}>
                        <input
                          type="checkbox"
                          checked={option.active}
                          onChange={(event) =>
                            shippingAdmin.updateShippingOptionField(option.id, "active", event.target.checked)
                          }
                        />
                        <span>Active</span>
                      </label>
                      <div className={capTheme.storeEditorButtons}>
                        <button
                          type="button"
                          className={capTheme.storeGhostButton}
                          onClick={() => shippingAdmin.deleteShippingOption(option.id)}
                          disabled={shippingAdmin.shippingSaveBusy}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className={capTheme.storePrimaryButton}
                          onClick={() => void shippingAdmin.persistShippingOption(option.id)}
                          disabled={shippingAdmin.shippingSaveBusy}
                        >
                          {shippingAdmin.shippingSaveBusy ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className={capTheme.storeSupportActions}>
                  <button type="button" className={capTheme.storeActionButton} onClick={shippingAdmin.addShippingOption}>
                    Add shipping option
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <StoreCheckoutSheet
            open={checkoutOpen}
            step={checkoutStep}
            steps={checkoutSteps}
            stepDetails={checkoutStepDetails}
            currentStepIndex={currentStepIndex}
            orderReference={orderReference}
            details={checkoutDetails}
            shippingOptions={availableShippingOptions}
            paymentOptions={paymentOptions}
            selectedShipping={selectedShipping ?? null}
            selectedPaymentOption={selectedPaymentOption}
            shippingRequired={shippingRequired}
            needsBillingAddress={needsBillingAddress}
            billingSnapshot={billingSnapshot}
            maskedCardSummary={maskedCardSummary}
            paymentElement={paymentElementNode}
            paymentError={paymentError ?? storeError}
            checkoutBusy={checkoutBusy || catalogLoading}
            orderSummary={orderSummary}
            cartItems={cartItems}
            subtotal={resolvedSubtotal}
            shippingCost={resolvedShippingCost}
            taxEstimate={taxEstimate}
            orderTotal={orderTotal}
            canPlaceOrder={canPlaceOrderNow}
            errorFor={errorFor}
            onUpdateField={(field, value) => {
              setCheckoutDetails((prev) => ({ ...prev, [field]: value }));
            }}
            onNextStep={handleNextStep}
            onBackStep={handleBackStep}
            onJumpToStep={setCheckoutStep}
            onPlaceOrder={placeOrder}
            onClose={() => setCheckoutOpen(false)}
            onIncrement={increment}
            onDecrement={decrement}
            onRemove={removeFromCart}
            formatCurrency={formatCurrency}
          />
        </div>
      </div>
      {shouldRenderCartInRail && cartRailRoot
        ? createPortal(<StoreCartSidebar {...cartSidebarProps} />, cartRailRoot)
        : null}
    </>
  );
}

type FounderAdminParams = {
  capsuleId: string | null;
  currency: string;
  products: StoreProduct[];
  setProducts: React.Dispatch<React.SetStateAction<StoreProduct[]>>;
  onError?: (message: string) => void;
};

function useFounderProductAdmin({
  capsuleId,
  currency,
  products,
  setProducts,
  onError,
}: FounderAdminParams): CatalogAdminControls {
  const [editingProductId, setEditingProductId] = React.useState<string | null>(null);
  const [productDraft, setProductDraft] = React.useState<StoreProductDraft | null>(null);
  const [memoryPickerFor, setMemoryPickerFor] = React.useState<string | null>(null);
  const [memoryPickerTab, setMemoryPickerTab] = React.useState<MemoryPickerTab>("uploads");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [reorderMode, setReorderMode] = React.useState(false);
  const [heroProductId, setHeroProductId] = React.useState<string | null>(null);
  const [draggingProductId, setDraggingProductId] = React.useState<string | null>(null);
  const [productSaveBusy, setProductSaveBusy] = React.useState(false);
  const [productSaveError, setProductSaveError] = React.useState<string | null>(null);

  const {
    user: memoryUser,
    envelope: memoryEnvelope,
    items: memoryItems,
    loading: memoryLoading,
    error: memoryError,
    refresh: refreshMemories,
    hasMore: memoryHasMore,
    loadMore: loadMoreMemoryUploads,
  } = useMemoryUploads("upload", { enablePaging: true, pageSize: 24 });
  const {
    user: _memoryAssetUser,
    envelope: memoryAssetsEnvelope,
    items: memoryAssetItems,
    loading: memoryAssetsLoading,
    error: memoryAssetsError,
    refresh: refreshMemoryAssets,
    hasMore: memoryAssetsHasMore,
    loadMore: loadMoreMemoryAssets,
  } = useMemoryUploads(null, { enablePaging: true, pageSize: 24 });
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(() => (typeof window !== "undefined" ? window.location.origin : null), []);
  const memoryUploads = React.useMemo(
    () => computeDisplayUploads(memoryItems, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, memoryItems],
  );
  const filteredAssetItems = React.useMemo(
    () => memoryAssetItems.filter((item) => (item.kind ?? "").toLowerCase() !== "upload"),
    [memoryAssetItems],
  );
  const memoryAssets = React.useMemo(
    () => computeDisplayUploads(filteredAssetItems, { origin: currentOrigin, cloudflareEnabled }),
    [cloudflareEnabled, currentOrigin, filteredAssetItems],
  );
  const refreshAllMemories = React.useCallback(() => {
    void refreshMemories();
    void refreshMemoryAssets();
  }, [refreshMemories, refreshMemoryAssets]);
  React.useEffect(() => {
    if (!memoryPickerFor) return;
    void refreshAllMemories();
  }, [memoryPickerFor, refreshAllMemories]);
  const setMemoryPickerTarget = React.useCallback(
    (productId: string | null) => {
      setMemoryPickerFor(productId);
    },
    [],
  );

  const searchMemoriesForPicker = React.useCallback(
    async ({
      tab,
      query,
      page,
      pageSize,
    }: {
      tab: MemoryPickerTab;
      query: string;
      page: number;
      pageSize: number;
    }) => {
      const envelope = memoryEnvelope ?? memoryAssetsEnvelope;
      if (!envelope) {
        return { items: [] as DisplayMemoryUpload[], hasMore: false, error: "Sign in to search memories." };
      }

      const response = await fetch("/api/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: envelope,
          q: query,
          limit: pageSize,
          page,
          kind: tab === "uploads" ? "upload" : undefined,
        }),
      });

      if (!response.ok) {
        return { items: [] as DisplayMemoryUpload[], hasMore: false, error: "Search failed. Try again." };
      }

      const json = (await response.json()) as { items?: DisplayMemoryUpload[] };
      const rawItems = Array.isArray(json.items) ? json.items : [];
      const processed = computeDisplayUploads(rawItems, { origin: currentOrigin, cloudflareEnabled });
      const filtered =
        tab === "uploads"
          ? processed.filter((item) => (item.kind ?? "").toLowerCase() === "upload")
          : processed.filter((item) => (item.kind ?? "").toLowerCase() !== "upload");
      return {
        items: filtered,
        hasMore: rawItems.length >= pageSize,
        error: null,
      };
    },
    [cloudflareEnabled, currentOrigin, memoryAssetsEnvelope, memoryEnvelope],
  );

  const beginEditingProduct = React.useCallback((product: StoreProduct) => {
    setEditingProductId(product.id);
    setProductDraft({
      id: product.id,
      title: product.title,
      description: product.description ?? "",
      price: product.price.toString(),
      currency: product.currency,
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
      currency,
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
  }, [beginEditingProduct, currency, products, setProducts]);

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

  const updateDraftVariant = React.useCallback((variantId: string, updates: Partial<StoreProductVariant>) => {
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
  }, []);

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

  const saveProductDraft = React.useCallback(async () => {
    if (!productDraft) return;
    if (!capsuleId) {
      setProductSaveError("Capsule is not available.");
      return;
    }
    const parsedPrice = Number.parseFloat(productDraft.price);
    const parsedInventory =
      productDraft.inventoryCount === null || Number.isNaN(productDraft.inventoryCount)
        ? null
        : Math.max(0, productDraft.inventoryCount);
    const normalizedVariants = productDraft.variants.map((variant, index) => ({
      id: variant.id,
      label: variant.label.trim() || "Option",
      price: typeof variant.price === "number" && Number.isFinite(variant.price) ? variant.price : null,
      inventoryCount:
        variant.inventoryCount === null || Number.isNaN(variant.inventoryCount)
          ? null
          : Math.max(0, variant.inventoryCount),
      sku: variant.sku ?? null,
      printfulVariantId: variant.printfulVariantId ?? null,
      active: true,
      sortOrder: index,
    }));
    const payload = {
      capsuleId,
      product: {
        id: productDraft.id ?? null,
        title: productDraft.title.trim() || "Untitled product",
        description: productDraft.description.trim(),
        price: Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0,
        currency: (productDraft.currency || currency || "USD").toLowerCase(),
        active: productDraft.active,
        inventoryCount: parsedInventory,
        fulfillmentKind: productDraft.fulfillmentKind,
        fulfillmentUrl: productDraft.fulfillmentUrl?.trim() || null,
        imageUrl: productDraft.imageUrl,
        memoryId: productDraft.memoryId,
        featured: productDraft.featured,
        sortOrder: products.find((p) => p.id === productDraft.id)?.order ?? products.length,
        sku: productDraft.sku ?? null,
        kind: productDraft.kind,
        variants: normalizedVariants,
      },
    };
    setProductSaveBusy(true);
    setProductSaveError(null);
    const draftId = productDraft.id;
    try {
      const response = await fetch("/api/store/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save product");
      }
      const data: {
        product: StoreProduct;
        variants: StoreProductVariant[];
      } = await response.json();
      const savedProduct: StoreProduct = {
        ...data.product,
        order: data.product.order ?? 0,
        price: data.product.price,
        variants: data.variants.map((variant) => ({
          ...variant,
        })),
      };

      setProducts((previous) => {
        const withoutTemp =
          draftId && draftId !== savedProduct.id ? previous.filter((p) => p.id !== draftId) : previous;
        const exists = withoutTemp.some((p) => p.id === savedProduct.id);
        const replaced = withoutTemp.map((product) => (product.id === savedProduct.id ? savedProduct : product));
        return exists ? replaced : [...replaced, savedProduct];
      });
      setEditingProductId(null);
      setProductDraft(null);
      setMemoryPickerFor(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save product";
      setProductSaveError(message);
      onError?.(message);
    } finally {
      setProductSaveBusy(false);
    }
  }, [capsuleId, currency, onError, productDraft, products, setProductSaveBusy, setProductSaveError, setProducts]);

  const persistProductSnapshot = React.useCallback(
    async (product: StoreProduct) => {
      if (!capsuleId) throw new Error("Capsule is not available.");
      const payload = {
        capsuleId,
        product: {
          id: product.id,
          title: product.title,
          description: product.description ?? "",
          price: Math.max(0, product.price),
          currency: (product.currency || currency || "USD").toLowerCase(),
          active: product.active,
          inventoryCount: product.inventoryCount,
          fulfillmentKind: product.fulfillmentKind,
          fulfillmentUrl: product.fulfillmentUrl,
          imageUrl: product.imageUrl,
          memoryId: product.memoryId ?? null,
          featured: product.featured,
          sortOrder: product.order,
          sku: product.sku ?? null,
          kind: product.kind,
          variants: product.variants.map((variant, index) => ({
            id: variant.id,
            label: variant.label.trim() || "Option",
            price: typeof variant.price === "number" && Number.isFinite(variant.price) ? variant.price : null,
            inventoryCount:
              variant.inventoryCount === null || variant.inventoryCount === undefined
                ? null
                : Math.max(0, variant.inventoryCount),
            sku: variant.sku ?? null,
            printfulVariantId: variant.printfulVariantId ?? null,
            sortOrder: index,
          })),
        },
      };
      const response = await fetch("/api/store/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save product changes");
      }
      const data: { product: StoreProduct; variants: StoreProductVariant[] } = await response.json();
      const savedProduct: StoreProduct = {
        ...data.product,
        order: data.product.order ?? product.order,
        price: data.product.price,
        variants: data.variants.map((variant) => ({ ...variant })),
      };
      return savedProduct;
    },
    [capsuleId, currency],
  );

  const deleteProductOnServer = React.useCallback(
    async (productId: string) => {
      if (!capsuleId) throw new Error("Capsule is not available.");
      const response = await fetch("/api/store/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capsuleId, productId }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to delete product");
      }
    },
    [capsuleId],
  );

  const openImagePicker = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const toggleFeatured = React.useCallback(
    (productId: string) => {
      let previousProduct: StoreProduct | null = null;
      let updatedProduct: StoreProduct | null = null;
      setProducts((previous) =>
        previous.map((product) => {
          if (product.id !== productId) return product;
          previousProduct = product;
          updatedProduct = { ...product, featured: !product.featured };
          return updatedProduct;
        }),
      );
      if (!updatedProduct || !previousProduct) return;
      void persistProductSnapshot(updatedProduct)
        .then((saved) => {
          setProducts((prev) => prev.map((product) => (product.id === saved.id ? saved : product)));
        })
        .catch((error) => {
          onError?.(error instanceof Error ? error.message : "Failed to update product");
          setProducts((prev) =>
            prev.map((product) => (product.id === productId && previousProduct ? previousProduct : product)),
          );
        });
    },
    [onError, persistProductSnapshot, setProducts],
  );

  const toggleActive = React.useCallback(
    (productId: string) => {
      let previousProduct: StoreProduct | null = null;
      let updatedProduct: StoreProduct | null = null;
      setProducts((previous) =>
        previous.map((product) => {
          if (product.id !== productId) return product;
          previousProduct = product;
          updatedProduct = { ...product, active: !product.active };
          return updatedProduct;
        }),
      );
      if (!updatedProduct || !previousProduct) return;
      void persistProductSnapshot(updatedProduct)
        .then((saved) => {
          setProducts((prev) => prev.map((product) => (product.id === saved.id ? saved : product)));
        })
        .catch((error) => {
          onError?.(error instanceof Error ? error.message : "Failed to update product");
          setProducts((prev) =>
            prev.map((product) => (product.id === productId && previousProduct ? previousProduct : product)),
          );
        });
    },
    [onError, persistProductSnapshot, setProducts],
  );

  const moveProduct = React.useCallback(
    (productId: string, direction: "up" | "down") => {
      let updatedList: StoreProduct[] | null = null;
      let changedIds: string[] = [];
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

        const swapped = previous.map((product) => {
          if (product.id === first.id) return { ...product, order: second.order };
          if (product.id === second.id) return { ...product, order: first.order };
          return product;
        });
        changedIds = [first.id, second.id];
        const normalized = swapped
          .sort((a, b) => {
            if (a.featured !== b.featured) return a.featured ? -1 : 1;
            return a.order - b.order;
          })
          .map((product, idx) => ({ ...product, order: idx }));
        updatedList = normalized;
        return normalized;
      });
      const listToPersist: StoreProduct[] = Array.isArray(updatedList) ? updatedList : [];
      const changed = listToPersist.filter((product: StoreProduct) => changedIds.includes(product.id));
      void Promise.all(changed.map((product) => persistProductSnapshot(product))).catch((error) => {
        onError?.(error instanceof Error ? error.message : "Failed to reorder products");
      });
    },
    [onError, persistProductSnapshot, setProducts],
  );

  const setHeroFromProduct = React.useCallback((productId: string) => {
    setHeroProductId(productId);
  }, []);

  const handleDragStart = React.useCallback((productId: string) => {
    setDraggingProductId(productId);
  }, []);

  const handleDragEnd = React.useCallback(() => {
    setDraggingProductId(null);
    if (!reorderMode) return;
    const productsToPersist = products;
    void Promise.all(productsToPersist.map((product) => persistProductSnapshot(product))).catch((error) => {
      onError?.(error instanceof Error ? error.message : "Failed to save new order");
    });
  }, [onError, persistProductSnapshot, products, reorderMode]);

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
    [draggingProductId, reorderMode, setProducts],
  );

  const deleteProduct = React.useCallback(
    (productId: string) => {
      let removed: StoreProduct | null = null;
      setProducts((previous) => {
        removed = previous.find((product) => product.id === productId) ?? null;
        return previous.filter((product) => product.id !== productId);
      });
      if (editingProductId === productId) {
        setEditingProductId(null);
        setProductDraft(null);
      }
      void deleteProductOnServer(productId).catch((error) => {
        onError?.(error instanceof Error ? error.message : "Failed to delete product");
        if (removed) {
          setProducts((previous) => [...previous, removed!].sort((a, b) => a.order - b.order));
        }
      });
    },
    [deleteProductOnServer, editingProductId, onError, setProducts],
  );

  return {
    editingProductId,
    productDraft,
    memoryPickerFor,
    memoryUploads,
    memoryAssets,
    memoryUser,
    memoryLoading,
    memoryError,
    memoryUploadsHasMore: Boolean(memoryHasMore),
    memoryAssetsHasMore: Boolean(memoryAssetsHasMore),
    onLoadMoreMemoryUploads: loadMoreMemoryUploads,
    onLoadMoreMemoryAssets: loadMoreMemoryAssets,
    onSearchMemories: searchMemoriesForPicker,
    memoryAssetsLoading,
    memoryAssetsError,
    memoryPickerTab,
    onMemoryTabChange: setMemoryPickerTab,
    onRefreshMemories: refreshAllMemories,
    reorderMode,
    draggingProductId,
    heroProductId,
    onToggleReorder: () => setReorderMode((state) => !state),
    onStartNewProduct: startNewProduct,
    onBeginEditingProduct: beginEditingProduct,
    onCancelEditingProduct: cancelEditingProduct,
    onSaveProductDraft: saveProductDraft,
    onAddDraftVariant: addDraftVariant,
    onUpdateDraftVariant: updateDraftVariant,
    onRemoveDraftVariant: removeDraftVariant,
    onUpdateDraftField: updateDraftFieldAny,
    onFileInputChange: handleFileInputChange,
    onOpenImagePicker: openImagePicker,
    onHandleMemorySelect: handleMemorySelect,
    onSetMemoryPickerFor: setMemoryPickerTarget,
    onToggleFeatured: toggleFeatured,
    onToggleActive: toggleActive,
    onDeleteProduct: deleteProduct,
    onMoveProduct: moveProduct,
    onSetHeroFromProduct: setHeroFromProduct,
    onHandleDragStart: handleDragStart,
    onHandleDragEnd: handleDragEnd,
    onHandleDragOver: handleDragOver,
    onClearDraftImage: clearDraftImage,
    fileInputRef,
    savingProduct: productSaveBusy,
    saveError: productSaveError,
  };
}

export { CapsuleStoreView };
