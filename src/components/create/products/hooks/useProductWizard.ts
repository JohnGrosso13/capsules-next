"use client";

import * as React from "react";

import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import type { MemoryPickerTab } from "@/components/composer/components/ComposerMemoryPicker";
import { PRODUCT_STEPS } from "../constants";
import type { ProductFormState, ProductPreviewModel, ProductStepId } from "../types";
import type { ProductTemplate } from "../templates";

type UseProductWizardArgs = {
  capsuleId: string;
  capsuleName: string;
  template: ProductTemplate;
};

type VariantDraft = {
  label: string;
  price: number;
  printfulVariantId?: string | number | null;
  active?: boolean;
  sortOrder?: number;
};

function normalizeSelection(options?: string[] | null): string[] {
  return (options ?? []).filter((value) => Boolean(value && value.trim().length));
}

export function useProductWizard({ capsuleId, capsuleName, template }: UseProductWizardArgs) {
  const initialColors = React.useMemo(() => normalizeSelection(template.colors), [template.colors]);
const initialSizes = React.useMemo(() => normalizeSelection(template.sizes), [template.sizes]);
  const [form, setForm] = React.useState<ProductFormState>(() => ({
    templateId: template.id,
    title: `${template.label} design`,
    summary: "",
    price: 32,
    currency: "usd",
    featured: true,
    publish: true,
    designUrl: "",
    designPrompt: "",
    mockScale: 0.75,
    mockOffsetX: 0,
    mockOffsetY: 0,
    availableColors: initialColors,
    availableSizes: initialSizes,
    selectedColors: initialColors,
    selectedSizes: initialSizes,
  }));

  const [activeStep, setActiveStep] = React.useState<ProductStepId>("design");
  const [isSaving, setIsSaving] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [aiDraftBusy, setAiDraftBusy] = React.useState(false);
  const [imageBusy, setImageBusy] = React.useState(false);
  const [memoryPickerOpen, setMemoryPickerOpen] = React.useState(false);
  const [memoryPickerTab, setMemoryPickerTab] = React.useState<"uploads" | "assets">("uploads");
  const formContentRef = React.useRef<HTMLDivElement | null>(null);

  const {
    envelope: memoryEnvelope,
    items: memoryItems,
    loading: memoryLoading,
    error: memoryError,
    hasMore: memoryHasMore,
    loadMore: loadMoreMemories,
    refresh: refreshMemories,
  } = useMemoryUploads("upload", { enablePaging: true, pageSize: 24 });
  const {
    envelope: memoryAssetsEnvelope,
    items: memoryAssetItems,
    loading: memoryAssetsLoading,
    error: memoryAssetsError,
    hasMore: memoryAssetsHasMore,
    loadMore: loadMoreMemoryAssets,
    refresh: refreshMemoryAssets,
  } = useMemoryUploads(null, { enablePaging: true, pageSize: 24 });

  const cloudflareEnabled = React.useMemo(() => true, []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

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

  const extractApiMessage = React.useCallback((payload: unknown): string | null => {
    if (!payload || typeof payload !== "object") return null;
    const root = payload as Record<string, unknown>;
    const rootMessage = typeof root.message === "string" ? root.message : null;
    const nestedError = root.error;
    if (nestedError && typeof nestedError === "object") {
      const nested = nestedError as Record<string, unknown>;
      const nestedMessage = typeof nested.message === "string" ? nested.message : null;
      if (nestedMessage) return nestedMessage;
    }
    return rootMessage;
  }, []);

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
    }): Promise<{ items: DisplayMemoryUpload[]; hasMore: boolean; error?: string | null }> => {
      const envelope = memoryEnvelope ?? memoryAssetsEnvelope;
      if (!envelope) {
        return {
          items: [],
          hasMore: false,
          error: "Sign in to search memories.",
        };
      }

      try {
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
          return {
            items: [],
            hasMore: false,
            error: "Search failed. Try again.",
          };
        }

        const json = (await response.json()) as { items?: DisplayMemoryUpload[] };
        const rawItems = Array.isArray(json.items) ? json.items : [];
        const processed = computeDisplayUploads(rawItems, {
          origin: currentOrigin,
          cloudflareEnabled,
        });
        const filtered =
          tab === "uploads"
            ? processed.filter((item) => (item.kind ?? "").toLowerCase() === "upload")
            : processed.filter((item) => (item.kind ?? "").toLowerCase() !== "upload");

        return {
          items: filtered,
          hasMore: rawItems.length >= pageSize,
          error: null,
        };
      } catch (error) {
        return {
          items: [],
          hasMore: false,
          error: error instanceof Error ? error.message : "Search failed. Try again.",
        };
      }
    },
    [cloudflareEnabled, currentOrigin, memoryAssetsEnvelope, memoryEnvelope],
  );

  React.useEffect(() => {
    setForm((prev) => ({
      ...prev,
      templateId: template.id,
      availableColors: initialColors,
      availableSizes: initialSizes,
      selectedColors: initialColors,
      selectedSizes: initialSizes,
      title: prev.title && prev.templateId === template.id ? prev.title : `${template.label} design`,
    }));
  }, [initialColors, initialSizes, template.id, template.label]);

  const completionMap = React.useMemo<Record<ProductStepId, boolean>>(
    () => ({
      design: Boolean(form.designUrl && form.designUrl.trim().length),
      details: Boolean(form.title.trim().length && form.summary.trim().length),
      pricing: form.price > 0,
      review: Boolean(
        form.designUrl && form.designUrl.trim().length && form.title.trim().length && form.price > 0,
      ),
    }),
    [form.designUrl, form.price, form.summary, form.title],
  );

  const stepIds = React.useMemo(() => PRODUCT_STEPS.map((step) => step.id), []);
  const activeIndex = React.useMemo(() => stepIds.indexOf(activeStep), [activeStep, stepIds]);
  const previousStepId = activeIndex > 0 ? stepIds[activeIndex - 1] : null;
  const nextStepId = activeIndex >= 0 && activeIndex < stepIds.length - 1 ? stepIds[activeIndex + 1] : null;
  const nextStep = nextStepId ? PRODUCT_STEPS.find((step) => step.id === nextStepId) ?? null : null;

  const handleStepSelect = React.useCallback((id: ProductStepId) => {
    setActiveStep(id);
  }, []);

  const handlePreviousStep = React.useCallback(() => {
    if (!previousStepId) return;
    setActiveStep(previousStepId);
  }, [previousStepId]);

  const handleNextStep = React.useCallback(() => {
    if (!nextStepId) return;
    setActiveStep(nextStepId);
  }, [nextStepId]);

  const updateFormField = React.useCallback(<K extends keyof ProductFormState>(field: K, value: ProductFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleSelection = React.useCallback((field: "selectedColors" | "selectedSizes", value: string) => {
    setForm((prev) => {
      const set = new Set(prev[field]);
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      return { ...prev, [field]: Array.from(set) } as ProductFormState;
    });
  }, []);

  const buildVariantDrafts = React.useCallback((): VariantDraft[] => {
    const price = Number.isFinite(form.price) ? Math.max(0, form.price) : 0;
    const sizes = form.selectedSizes.length ? form.selectedSizes : [];
    const colors = form.selectedColors.length ? form.selectedColors : [];
    const drafts: VariantDraft[] = [];

    if (!sizes.length && !colors.length) {
      drafts.push({ label: template.label, price, active: true, sortOrder: 0 });
      return drafts;
    }

    if (!sizes.length && colors.length) {
      colors.forEach((color, index) => drafts.push({ label: color, price, active: true, sortOrder: index }));
      return drafts;
    }

    if (!colors.length && sizes.length) {
      sizes.forEach((size, index) => drafts.push({ label: size, price, active: true, sortOrder: index }));
      return drafts;
    }

    sizes.forEach((size, sIndex) => {
      colors.forEach((color, cIndex) => {
        drafts.push({ label: `${size} / ${color}`, price, active: true, sortOrder: sIndex * colors.length + cIndex });
      });
    });
    return drafts;
  }, [form.price, form.selectedColors, form.selectedSizes, template.label]);

  const previewModel: ProductPreviewModel = React.useMemo(
    () => ({
      title: form.title.trim().length ? form.title.trim() : template.label,
      summary:
        form.summary.trim().length || !template.note
          ? form.summary.trim()
          : template.note ?? "",
      price: form.price,
      currency: form.currency,
      imageUrl: form.designUrl && form.designUrl.trim().length ? form.designUrl.trim() : null,
      templateLabel: template.label,
      templateId: template.id,
      capsuleName,
      colors: form.selectedColors.length ? form.selectedColors : form.availableColors,
      sizes: form.selectedSizes.length ? form.selectedSizes : form.availableSizes,
      featured: form.featured,
      publish: form.publish,
      placementScale: form.mockScale,
      placementOffsetX: form.mockOffsetX,
      placementOffsetY: form.mockOffsetY,
    }),
    [
      capsuleName,
      form.availableColors,
      form.availableSizes,
      form.currency,
      form.designUrl,
      form.featured,
      form.price,
      form.publish,
      form.selectedColors,
      form.selectedSizes,
      form.summary,
      form.title,
      form.mockOffsetX,
      form.mockOffsetY,
      form.mockScale,
      template.id,
      template.label,
      template.note,
    ],
  );

  const resetFormState = React.useCallback(() => {
    setForm({
      templateId: template.id,
      title: `${template.label} design`,
      summary: "",
      price: 32,
      currency: "usd",
      featured: true,
      publish: true,
      designUrl: "",
      designPrompt: "",
      mockScale: 0.75,
      mockOffsetX: 0,
      mockOffsetY: 0,
      availableColors: initialColors,
      availableSizes: initialSizes,
      selectedColors: initialColors,
      selectedSizes: initialSizes,
    });
    setActiveStep("design");
    setStatusMessage(null);
    setErrorMessage(null);
    setAiDraftBusy(false);
    setImageBusy(false);
  }, [initialColors, initialSizes, template.id, template.label]);

  const createProduct = React.useCallback(async () => {
    setIsSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const variants = buildVariantDrafts().map((variant) => ({
      label: variant.label,
      price: variant.price,
      currency: form.currency,
      inventoryCount: null,
      sku: null,
      printfulVariantId: variant.printfulVariantId ?? null,
      active: variant.active ?? true,
      sortOrder: variant.sortOrder ?? 0,
    }));

    const payload = {
      capsuleId,
      product: {
        title: form.title.trim() || template.label,
        description: form.summary.trim().length ? form.summary.trim() : null,
        price: form.price,
        currency: form.currency,
        active: form.publish,
        inventoryCount: null,
        fulfillmentKind: "ship",
        fulfillmentUrl: null,
        imageUrl: form.designUrl && form.designUrl.trim().length ? form.designUrl.trim() : null,
        memoryId: null,
        featured: form.featured,
        sortOrder: 0,
        sku: null,
        kind: "physical",
        variants,
      },
    };

    try {
      const res = await fetch("/api/store/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = body?.error?.message ?? body?.message ?? "Failed to save product";
        throw new Error(message);
      }
      setStatusMessage("Product saved to your Capsule store.");
      setActiveStep("review");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  }, [buildVariantDrafts, capsuleId, form.currency, form.designUrl, form.featured, form.price, form.publish, form.summary, form.title, template.label]);

  const requestAiDraft = React.useCallback(async () => {
    if (aiDraftBusy) return;
    setAiDraftBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const payload = {
        capsuleId,
        templateId: template.id,
        templateLabel: template.label,
        templateCategory: template.categoryLabel,
        templateBase: template.base ?? null,
        designPrompt: form.designPrompt || null,
        existingTitle: form.title || null,
        existingSummary: form.summary || null,
        currency: form.currency || "usd",
      };
      const res = await fetch("/api/store/product-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as unknown;
        const message = extractApiMessage(body) ?? "Capsule AI could not draft this product.";
        throw new Error(message);
      }
      const json = (await res.json()) as { title?: string; summary?: string; price?: number };
      setForm((previous) => ({
        ...previous,
        title: typeof json.title === "string" && json.title.trim().length ? json.title : previous.title,
        summary:
          typeof json.summary === "string" && json.summary.trim().length ? json.summary : previous.summary,
        price:
          typeof json.price === "number" && Number.isFinite(json.price) && json.price > 0
            ? json.price
            : previous.price,
      }));
      setStatusMessage("Capsule AI updated your title, summary, and price.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to get a draft from Capsule AI.");
    } finally {
      setAiDraftBusy(false);
    }
  }, [
    aiDraftBusy,
    capsuleId,
    extractApiMessage,
    form.currency,
    form.designPrompt,
    form.summary,
    form.title,
    template.base,
    template.categoryLabel,
    template.id,
    template.label,
  ]);

  const generateDesignImage = React.useCallback(async () => {
    if (imageBusy) return;
    const parts: string[] = [];
    parts.push(`Merch design for ${template.label}`);
    if (template.base) parts.push(`Base product: ${template.base}`);
    if (capsuleName) parts.push(`Capsule: ${capsuleName}`);
    const detail = form.designPrompt.trim() || form.summary.trim() || form.title.trim();
    if (detail) parts.push(`Design details: ${detail}`);
    const prompt = parts.join(". ");
    if (!prompt.trim().length) {
      setErrorMessage("Add a short design prompt or summary before asking Capsule AI to generate art.");
      return;
    }
    setImageBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/ai/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, options: { quality: "standard" } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as unknown;
        const message = extractApiMessage(body) ?? "Image generation failed.";
        throw new Error(message);
      }
      const json = (await res.json()) as { url?: string };
      const url = typeof json.url === "string" ? json.url.trim() : "";
      if (!url.length) {
        throw new Error("Image generation response did not include a URL.");
      }
      setForm((previous) => ({ ...previous, designUrl: url }));
      setStatusMessage("Capsule AI generated art for this product.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to generate product art.");
    } finally {
      setImageBusy(false);
    }
  }, [capsuleName, extractApiMessage, form.designPrompt, form.summary, form.title, imageBusy, template.base, template.label]);

  const handleMemorySelect = React.useCallback(
    (upload: DisplayMemoryUpload) => {
      const url =
        upload.displayUrl?.trim() ||
        upload.fullUrl?.trim() ||
        upload.media_url?.trim() ||
        "";
      if (!url) {
        setErrorMessage("Selected memory does not have a usable image URL.");
        return;
      }
      setForm((previous) => ({
        ...previous,
        designUrl: url,
      }));
      setMemoryPickerOpen(false);
    },
    [],
  );

  const openMemoryPicker = React.useCallback(() => {
    setMemoryPickerOpen(true);
    void refreshAllMemories();
  }, [refreshAllMemories]);

  return {
    activeStep,
    completionMap,
    previousStepId,
    nextStep,
    nextStepId,
    form,
    formContentRef,
    statusMessage,
    errorMessage,
    isSaving,
    previewModel,
    setActiveStep: handleStepSelect,
    handleStepSelect,
    handlePreviousStep,
    handleNextStep,
    updateFormField,
    toggleSelection,
    resetFormState,
    createProduct,
    requestAiDraft,
    generateDesignImage,
    aiDraftBusy,
    imageBusy,
    memory: {
      open: memoryPickerOpen,
      tab: memoryPickerTab,
      setTab: setMemoryPickerTab,
      uploads: memoryUploads,
      uploadsLoading: memoryLoading,
      uploadsError: memoryError,
      uploadsHasMore: memoryHasMore,
      loadMoreUploads: loadMoreMemories,
      assets: memoryAssets,
      assetsLoading: memoryAssetsLoading,
      assetsError: memoryAssetsError,
      assetsHasMore: memoryAssetsHasMore,
      loadMoreAssets: loadMoreMemoryAssets,
      onSelect: handleMemorySelect,
      openPicker: openMemoryPicker,
      closePicker: () => setMemoryPickerOpen(false),
      searchMemories: searchMemoriesForPicker,
    },
  };
}
