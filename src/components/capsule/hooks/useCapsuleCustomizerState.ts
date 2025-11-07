"use client";

import * as React from "react";
import { z } from "zod";

import type { PrompterAction } from "@/components/ai-prompter-stage";
import { useCapsuleCustomizerCopy } from "./useCapsuleCustomizerCopy";
import { useCapsuleCustomizerSelection } from "./useCapsuleCustomizerSelection";
import { useCapsuleCustomizerPreview } from "./useCapsuleCustomizerPreview";
import { useCapsuleCustomizerSave } from "./useCapsuleCustomizerSave";
import { useCapsuleCustomizerChat } from "./useCapsuleCustomizerChat";
import { useCapsuleCustomizerMemory } from "./useCapsuleCustomizerMemory";
import {
  type CapsuleCustomizerMode,
  type CapsuleCustomizerSaveResult,
  type CapsulePromptClarifier,
  type ChatBannerOption,
  type ChatMessage,
  type CroppableBanner,
  type SelectedBanner,
  type CapsuleVariantState,
  type CapsuleVariant,
  type CapsuleStylePersona,
  type CapsulePersonaState,
  type CapsuleAdvancedOptionsState,
  capsuleVariantSchema,
} from "./capsuleCustomizerTypes";

export type {
  CapsuleCustomizerMode,
  SelectedBanner,
  ChatMessage,
  ChatBannerOption,
  CapsuleCustomizerSaveResult,
  CapsuleVariant,
  CapsuleVariantState,
  CapsuleStylePersona,
  CapsulePersonaState,
  CapsuleAdvancedOptionsState,
} from "./capsuleCustomizerTypes";

type MemoryHookReturn = ReturnType<typeof useCapsuleCustomizerMemory>;

const stylePersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  palette: z.string().nullable(),
  medium: z.string().nullable(),
  camera: z.string().nullable(),
  notes: z.string().nullable(),
  capsuleId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const stylePersonaListSchema = z.object({
  personas: z.array(stylePersonaSchema),
});

function describeSource(source: SelectedBanner | null, label: string): string {
  if (!source) {
    return `No ${label} selected yet. Upload an image, pick a memory, or describe one below.`;
  }
  if (source.kind === "upload") return `Uploaded - ${source.name}`;
  if (source.kind === "memory") return `Memory - ${source.title?.trim() || "Untitled memory"}`;
  return `AI prompt - "${source.prompt}"`;
}

const DEFAULT_PROMPTER_CHIPS = [
  "Bold gradient hero with soft glow lighting",
  "Minimal collage banner with generous white space",
  "Photo-forward hero featuring community moments",
  "Neon synthwave grid hero with holographic text",
];

const CUSTOMIZER_CLARIFIERS: Record<CapsuleCustomizerMode, CapsulePromptClarifier> = {
  banner: {
    prompt: "Want the hero to feel bold, minimal, photo-first, or neon?",
    suggestions: [
      "Bold gradient hero",
      "Minimal collage layout",
      "Photo-forward hero",
      "Neon grid energy",
    ],
    prompterChips: [
      "Bold gradient hero with glass typography, centered logo",
      "Minimal collage hero mixing two monochrome photos and clean serif text",
      "Photo-forward hero featuring candid team shots with warm lighting",
      "Neon grid hero with holographic lines and synthwave accents",
    ],
  },
  storeBanner: {
    prompt: "Tap a store vibe to riff on or describe exactly what you imagine.",
    suggestions: [
      "Product spotlight hero",
      "Luxury boutique feel",
      "Neon marketplace energy",
      "Editorial collage",
    ],
    prompterChips: [
      "Product spotlight hero with floating cards and bold CTA",
      "Luxury boutique store banner with soft beige textures and serif copy",
      "Neon marketplace hero with animated grid and glitch lighting",
      "Editorial collage hero mixing cutout product photos and headline text",
    ],
  },
  tile: {
    prompt: "Need the promo tile to feel typographic, cinematic, or collage-like?",
    suggestions: [
      "Bold typography tile",
      "Moodboard collage tile",
      "Portrait tile with depth",
      "High-contrast monochrome",
    ],
    prompterChips: [
      "Bold typography tile with stacked lettering and radial blur",
      "Moodboard collage tile mixing stickers, tape, and gritty textures",
      "Portrait tile with dramatic lighting and depth of field",
      "High-contrast monochrome tile with sharp angles and noise grain",
    ],
  },
  logo: {
    prompt: "Should this logo feel minimal, playful, retro, or sharp?",
    suggestions: [
      "Minimal monogram",
      "Playful bubble mark",
      "Retro badge logo",
      "Sharp geometric icon",
    ],
    prompterChips: [
      "Minimal monogram logo with rounded corners and subtle gradient",
      "Playful bubble wordmark with soft shadows",
      "Retro badge logo with bold outline and capsule lettering",
      "Sharp geometric icon with intersecting lines and negative space",
    ],
  },
  avatar: {
    prompt: "Do you want the avatar realistic, illustrated, dreamy, or futuristic?",
    suggestions: [
      "Realistic portrait",
      "Cartoon cel-shaded",
      "Dreamy watercolor",
      "Neon hologram",
    ],
    prompterChips: [
      "Realistic portrait with studio lighting and subtle depth of field",
      "Cartoon cel-shaded avatar with bold outlines and expressive eyes",
      "Dreamy watercolor avatar with pastel washes and soft focus",
      "Neon hologram avatar with chrome highlights and holographic glow",
    ],
  },
};

export type UseCapsuleCustomizerOptions = {
  open?: boolean;
  capsuleId?: string | null;
  capsuleName?: string | null;
  onClose: () => void;
  onSaved?: (result: CapsuleCustomizerSaveResult) => void;
  mode?: CapsuleCustomizerMode;
};

export type CapsuleChatState = {
  messages: ChatMessage[];
  busy: boolean;
  prompterSession: number;
  onPrompterAction: (action: PrompterAction) => void;
  onBannerSelect: (option: ChatBannerOption) => void;
  onSuggestionSelect: (value: string) => void;
  logRef: React.RefObject<HTMLDivElement | null>;
};

export type CapsuleMemoryState = {
  user: MemoryHookReturn["user"];
  loading: MemoryHookReturn["loading"];
  error: MemoryHookReturn["error"];
  processedMemories: MemoryHookReturn["processedMemories"];
  recentMemories: MemoryHookReturn["recentMemories"];
  isPickerOpen: MemoryHookReturn["memoryPickerOpen"];
  openPicker: MemoryHookReturn["openMemoryPicker"];
  closePicker: MemoryHookReturn["closeMemoryPicker"];
  onSelectMemory: MemoryHookReturn["handleMemorySelect"];
  onPickMemory: MemoryHookReturn["handleMemoryPick"];
  onQuickPick: MemoryHookReturn["handleQuickPick"];
  refresh: MemoryHookReturn["refresh"];
  buttonRef: MemoryHookReturn["memoryButtonRef"];
};

export type CapsulePreviewState = {
  selected: SelectedBanner | null;
  previewOffset: { x: number; y: number };
  previewDraggable: boolean;
  previewPannable: boolean;
  previewCanPan: boolean;
  previewScale: number;
  isDragging: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onImageLoad: () => void;
};

export type CapsuleUploadState = {
  onUploadClick: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export type CapsuleSaveState = {
  pending: boolean;
  error: string | null;
  onSave: () => Promise<void>;
};

export type CapsuleCustomizerMeta = {
  mode: CapsuleCustomizerMode;
  assetLabel: string;
  headerTitle: string;
  headerSubtitle: string;
  prompterPlaceholder: string;
  prompterChips: string[];
  stageAriaLabel: string;
  footerDefaultHint: string;
  recentDescription: string;
  previewAlt: string;
  normalizedName: string;
};

export type CapsuleCustomizerActions = {
  handleClose: () => void;
  overlayClick: React.MouseEventHandler<HTMLDivElement>;
  describeSelection: (selection: SelectedBanner | null) => string;
};

export type CapsuleCustomizerCoordinator = {
  open: boolean;
  meta: CapsuleCustomizerMeta;
  chat: CapsuleChatState;
  memory: CapsuleMemoryState;
  preview: CapsulePreviewState;
  uploads: CapsuleUploadState;
  save: CapsuleSaveState;
  actions: CapsuleCustomizerActions;
  variants: CapsuleVariantState;
  personas: CapsulePersonaState;
  advanced: CapsuleAdvancedOptionsState;
};

export type UseCapsuleCustomizerStateReturn = CapsuleCustomizerCoordinator;

export function useCapsuleCustomizerState(
  options: UseCapsuleCustomizerOptions,
): UseCapsuleCustomizerStateReturn {
  const { open = false, capsuleId, capsuleName, onClose, onSaved, mode = "banner" } = options;

  const normalizedName = React.useMemo(() => {
    const trimmed = capsuleName?.trim();
    if (!trimmed) return "Your capsule";
    return trimmed.length > 48 ? `${trimmed.slice(0, 47)}...` : trimmed;
  }, [capsuleName]);

  const customizerMode: CapsuleCustomizerMode = mode ?? "banner";

  const variantSchema = React.useMemo(() => capsuleVariantSchema, []);
  const [variants, setVariants] = React.useState<CapsuleVariant[]>([]);
  const [variantLoading, setVariantLoading] = React.useState(false);
  const [variantError, setVariantError] = React.useState<string | null>(null);

  const assetKindForVariants = React.useMemo(() => {
    if (customizerMode === "avatar") return "avatar";
    if (customizerMode === "logo") return "logo";
    if (customizerMode === "banner" || customizerMode === "storeBanner") return "banner";
    return null;
  }, [customizerMode]);

  const clarifierPreset = React.useMemo<CapsulePromptClarifier | null>(() => {
    const preset = CUSTOMIZER_CLARIFIERS[customizerMode];
    if (!preset) return null;
    return {
      prompt: preset.prompt,
      suggestions: [...preset.suggestions],
      ...(preset.prompterChips ? { prompterChips: [...preset.prompterChips] } : {}),
    };
  }, [customizerMode]);

  const prompterChips = React.useMemo<string[]>(() => {
    if (clarifierPreset?.prompterChips?.length) {
      return clarifierPreset.prompterChips;
    }
    if (clarifierPreset?.suggestions?.length) {
      return clarifierPreset.suggestions;
    }
    return DEFAULT_PROMPTER_CHIPS;
  }, [clarifierPreset]);

  const [personas, setPersonas] = React.useState<CapsuleStylePersona[]>([]);
  const [personasLoading, setPersonasLoading] = React.useState(false);
  const [personasError, setPersonasError] = React.useState<string | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = React.useState<string | null>(null);
  const [advancedSeed, setAdvancedSeed] = React.useState<number | null>(null);
  const [advancedGuidance, setAdvancedGuidance] = React.useState<number | null>(null);

  const setAdvancedSeedValue = React.useCallback((value: number | null) => {
    if (value === null || Number.isFinite(value)) {
      const sanitized = value === null ? null : Math.max(0, Math.floor(value));
      setAdvancedSeed(sanitized);
    }
  }, []);

  const setAdvancedGuidanceValue = React.useCallback((value: number | null) => {
    if (value === null || Number.isFinite(value)) {
      const sanitized = value === null ? null : Math.max(0, Math.min(30, Number(value)));
      setAdvancedGuidance(sanitized);
    }
  }, []);


  const loadPersonas = React.useCallback(async () => {
    setPersonasLoading(true);
    setPersonasError(null);
    try {
      const params = new URLSearchParams();
      if (capsuleId) params.set("capsuleId", capsuleId);
      const query = params.toString();
      const url = query.length ? `/api/ai/style-personas?${query}` : "/api/ai/style-personas";
      const response = await fetch(url, { method: "GET", credentials: "include" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json) {
        throw new Error("Failed to load style personas.");
      }
      const parsed = stylePersonaListSchema.parse(json);
      setPersonas(parsed.personas);
      if (selectedPersonaId && !parsed.personas.some((persona) => persona.id === selectedPersonaId)) {
        setSelectedPersonaId(null);
      }
    } catch (error) {
      console.warn("capsule style personas load failed", error);
      setPersonasError(error instanceof Error ? error.message : "Failed to load style personas.");
    } finally {
      setPersonasLoading(false);
    }
  }, [capsuleId, selectedPersonaId]);

  const selectPersona = React.useCallback((personaId: string | null) => {
    setSelectedPersonaId(personaId);
  }, []);

  const createPersona = React.useCallback(
    async (input: {
      name: string;
      palette?: string | null;
      medium?: string | null;
      camera?: string | null;
      notes?: string | null;
    }) => {
      setPersonasError(null);
      setPersonasLoading(true);
      try {
        const payload = {
          name: input.name.trim(),
          palette: input.palette?.trim() || null,
          medium: input.medium?.trim() || null,
          camera: input.camera?.trim() || null,
          notes: input.notes?.trim() || null,
          ...(capsuleId ? { capsuleId } : {}),
        };
        const response = await fetch("/api/ai/style-personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json) {
          throw new Error("Failed to save style persona.");
        }
        const persona = stylePersonaSchema.parse(json);
        setPersonas((previous) => [persona, ...previous]);
        setSelectedPersonaId(persona.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save style persona.";
        setPersonasError(message);
        throw error;
      } finally {
        setPersonasLoading(false);
      }
    },
    [capsuleId],
  );

  const removePersona = React.useCallback(async (personaId: string) => {
    setPersonasError(null);
    try {
      const response = await fetch(`/api/ai/style-personas/${personaId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to delete style persona.");
      }
      setPersonas((previous) => previous.filter((persona) => persona.id !== personaId));
      setSelectedPersonaId((current) => (current === personaId ? null : current));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete style persona.";
      setPersonasError(message);
      throw error;
    }
  }, []);

  const upsertVariant = React.useCallback((variant: CapsuleVariant | null) => {
    if (!variant) return;
    setVariants((previous) => {
      const filtered = previous.filter((entry) => entry.id !== variant.id);
      const next = [variant, ...filtered];
      next.sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        const aTime = Date.parse(a.createdAt);
        const bTime = Date.parse(b.createdAt);
        return Number.isFinite(bTime) && Number.isFinite(aTime) ? bTime - aTime : 0;
      });
      return next;
    });
  }, []);

  const loadVariants = React.useCallback(async () => {
    if (!assetKindForVariants) {
      setVariants([]);
      return;
    }
    setVariantLoading(true);
    setVariantError(null);
    try {
      const params = new URLSearchParams({ assetKind: assetKindForVariants, limit: "20" });
      if (capsuleId) params.set("capsuleId", capsuleId);
      const response = await fetch(`/api/ai/variants?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json) {
        throw new Error("Failed to load image variants.");
      }
      const parsed = z.object({ variants: z.array(variantSchema) }).parse(json);
      setVariants(parsed.variants);
    } catch (error) {
      console.warn("capsule variants load failed", error);
      setVariantError(error instanceof Error ? error.message : "Failed to load variants.");
    } finally {
      setVariantLoading(false);
    }
  }, [assetKindForVariants, capsuleId, variantSchema]);

  React.useEffect(() => {
    if (!open) return;
    void loadVariants();
  }, [open, loadVariants]);

  React.useEffect(() => {
    if (!open) return;
    void loadPersonas();
  }, [loadPersonas, open]);

  const {
    assetLabel,
    previewAlt,
    headerTitle,
    headerSubtitle,
    prompterPlaceholder,
    aiWorkingMessage,
    assistantIntro,
    footerDefaultHint,
    stageAriaLabel,
    recentDescription,
  } = useCapsuleCustomizerCopy(customizerMode, normalizedName);

  const {
    selectedBanner,
    setSelectedBanner,
    selectedBannerRef,
  } = useCapsuleCustomizerSelection();

  const fetchMemoryAssetRef = React.useRef<(memoryId: string) => Promise<string>>(
    async () => {
      throw new Error("Memory asset fetch not ready.");
    },
  );
  const refreshMemoriesRef = React.useRef<() => Promise<void>>(async () => {});
  const cropUpdateRef = React.useRef<(banner: CroppableBanner) => void>(() => {});
  const resetSaveErrorRef = React.useRef<() => void>(() => {});
  const resetPromptHistoryRef = React.useRef<() => void>(() => {});

  const handleCropUpdate = React.useCallback((banner: CroppableBanner) => {
    cropUpdateRef.current(banner);
  }, []);

  const invokeResetSaveError = React.useCallback(() => {
    resetSaveErrorRef.current();
  }, []);

  const { previewState, updateSelectedBanner } = useCapsuleCustomizerPreview({
    open,
    selectedBanner,
    setSelectedBanner,
    onCropUpdate: handleCropUpdate,
    resetSaveError: invokeResetSaveError,
  });

  const resolveMemoryAssetUrl = React.useCallback(
    (memoryId: string) => fetchMemoryAssetRef.current(memoryId),
    [],
  );

  const {
    uploads,
    save: saveState,
    setSaveError,
    clearSaveError,
    clearUploadArtifacts,
  } = useCapsuleCustomizerSave({
    assetLabel,
    capsuleId: capsuleId ?? null,
    customizerMode,
    normalizedName,
    open,
    selectedBanner,
    updateSelectedBanner,
    fetchMemoryAssetUrl: resolveMemoryAssetUrl,
    refreshMemories: () => refreshMemoriesRef.current(),
    resetPromptHistory: () => resetPromptHistoryRef.current(),
    onClose,
    ...(onSaved ? { onSaved } : {}),
  });

  resetSaveErrorRef.current = clearSaveError;

  const {
    messages,
    chatBusy,
    prompterSession,
    chatLogRef,
    handlePrompterAction,
    handleBannerOptionSelect,
    handleSuggestionSelect,
    resetPromptHistory,
    resetConversation,
    syncBannerCropToMessages,
  } = useCapsuleCustomizerChat({
    aiWorkingMessage,
    assistantIntro,
    assetLabel,
    normalizedName,
    customizerMode,
    updateSelectedBanner,
    setSelectedBanner,
    selectedBannerRef,
    setSaveError,
    fetchMemoryAssetUrl: resolveMemoryAssetUrl,
    onVariantReceived: upsertVariant,
    onVariantRefreshRequested: loadVariants,
    stylePersonaId: selectedPersonaId,
    seed: advancedSeed,
    guidance: advancedGuidance,
    clarifier: clarifierPreset,
  });

  cropUpdateRef.current = syncBannerCropToMessages;
  resetPromptHistoryRef.current = resetPromptHistory;

  const handleVariantSelect = React.useCallback(
    (variant: CapsuleVariant) => {
      const metadata = (variant.metadata ?? {}) as Record<string, unknown>;
      const resolvedPrompt =
        typeof metadata.resolvedPrompt === "string" && metadata.resolvedPrompt.trim().length
          ? metadata.resolvedPrompt.trim()
          : null;

      updateSelectedBanner({
        kind: "memory",
        id: variant.id,
        title: resolvedPrompt || `Variant v${variant.version}`,
        url: variant.imageUrl,
        fullUrl: variant.imageUrl,
        crop: { offsetX: 0, offsetY: 0 },
      });
      resetPromptHistory();
    },
    [resetPromptHistory, updateSelectedBanner],
  );

  const memory = useCapsuleCustomizerMemory({
    open,
    onClose,
    updateSelectedBanner,
    onResetPromptHistory: resetPromptHistory,
  });

  const variantContextValue = React.useMemo<CapsuleVariantState>(
    () => ({
      items: variants,
      loading: variantLoading,
      error: variantError,
      refresh: loadVariants,
      select: handleVariantSelect,
    }),
    [variants, variantLoading, variantError, loadVariants, handleVariantSelect],
  );

  const advancedContextValue = React.useMemo<CapsuleAdvancedOptionsState>(
    () => ({
      seed: advancedSeed,
      guidance: advancedGuidance,
      setSeed: setAdvancedSeedValue,
      setGuidance: setAdvancedGuidanceValue,
      clear: () => {
        setAdvancedSeed(null);
        setAdvancedGuidance(null);
      },
    }),
    [advancedGuidance, advancedSeed, setAdvancedGuidanceValue, setAdvancedSeedValue],
  );

  const personaContextValue = React.useMemo<CapsulePersonaState>(
    () => ({
      items: personas,
      loading: personasLoading,
      error: personasError,
      selectedId: selectedPersonaId,
      refresh: loadPersonas,
      select: selectPersona,
      create: createPersona,
      remove: removePersona,
    }),
    [
      createPersona,
      loadPersonas,
      personas,
      personasError,
      personasLoading,
      removePersona,
      selectPersona,
      selectedPersonaId,
    ],
  );

  fetchMemoryAssetRef.current = memory.fetchMemoryAssetUrl;
  refreshMemoriesRef.current = memory.refresh;

  const {
    user,
    loading,
    error,
    processedMemories,
    recentMemories,
    memoryPickerOpen,
    openMemoryPicker,
    closeMemoryPicker,
    handleMemorySelect,
    handleMemoryPick,
    handleQuickPick,
    refresh,
    memoryButtonRef,
  } = memory;

  React.useEffect(() => {
    if (!open) return;
    resetConversation(assistantIntro, clarifierPreset);
    clearUploadArtifacts();
  }, [assistantIntro, clarifierPreset, clearUploadArtifacts, open, resetConversation]);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const node = chatLogRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [chatLogRef, messages, open]);

  const handleClose = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const overlayClick = React.useCallback<React.MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.target === event.currentTarget) {
        handleClose();
      }
    },
    [handleClose],
  );

  const describeSelection = React.useCallback(
    (selection: SelectedBanner | null) => describeSource(selection, assetLabel),
    [assetLabel],
  );

  return {
    open,
    meta: {
      mode: customizerMode,
      assetLabel,
      headerTitle,
      headerSubtitle,
      prompterPlaceholder,
      prompterChips,
      stageAriaLabel,
      footerDefaultHint,
      recentDescription,
      previewAlt,
      normalizedName,
    },
    chat: {
      messages,
      busy: chatBusy,
      prompterSession,
      onPrompterAction: handlePrompterAction,
      onBannerSelect: handleBannerOptionSelect,
      onSuggestionSelect: handleSuggestionSelect,
      logRef: chatLogRef,
    },
    memory: {
      user,
      loading,
      error,
      processedMemories,
      recentMemories,
      isPickerOpen: memoryPickerOpen,
      openPicker: openMemoryPicker,
      closePicker: closeMemoryPicker,
      onSelectMemory: handleMemorySelect,
      onPickMemory: handleMemoryPick,
      onQuickPick: handleQuickPick,
      refresh,
      buttonRef: memoryButtonRef,
    },
    preview: {
      selected: previewState.selected,
      previewOffset: previewState.previewOffset,
      previewDraggable: previewState.previewDraggable,
      previewPannable: previewState.previewPannable,
      previewCanPan: previewState.previewCanPan,
      previewScale: previewState.previewScale,
      isDragging: previewState.isDraggingPreview,
      stageRef: previewState.stageRef,
      imageRef: previewState.imageRef,
      onPointerDown: previewState.onPointerDown,
      onImageLoad: previewState.onImageLoad,
    },
    uploads,
    personas: personaContextValue,
    advanced: advancedContextValue,
    variants: variantContextValue,
    save: saveState,
    actions: {
      handleClose,
      overlayClick,
      describeSelection,
    },
  };
}
