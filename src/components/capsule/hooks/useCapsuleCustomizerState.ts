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

export type CapsulePreviewMaskState = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  hasMask: boolean;
  isDrawing: boolean;
  toggle: (enabled?: boolean) => void;
  clear: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
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
  mask: CapsulePreviewMaskState;
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
    resetConversation(assistantIntro);
    clearUploadArtifacts();
  }, [assistantIntro, clearUploadArtifacts, open, resetConversation]);

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
      mask: previewState.mask,
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
