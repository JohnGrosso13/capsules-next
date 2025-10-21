"use client";

import * as React from "react";

import type { PrompterAction } from "@/components/ai-prompter-stage";
import { useCapsuleCustomizerCopy } from "./useCapsuleCustomizerCopy";
import { useCapsuleCustomizerSelection } from "./useCapsuleCustomizerSelection";
import { useCapsuleCustomizerPreview } from "./useCapsuleCustomizerPreview";
import { useCapsuleCustomizerChat } from "./useCapsuleCustomizerChat";
import { useCapsuleCustomizerMemory } from "./useCapsuleCustomizerMemory";
import {
  type BannerCrop,
  type CapsuleCustomizerMode,
  type ChatBannerOption,
  type ChatMessage,
  type CroppableBanner,
  type PromptHistorySnapshot,
  type SelectedBanner,
} from "./capsuleCustomizerTypes";

export type {
  CapsuleCustomizerMode,
  BannerCrop,
  SelectedBanner,
  ChatMessage,
  ChatBannerOption,
  PromptHistorySnapshot,
} from "./capsuleCustomizerTypes";

export type CapsuleCustomizerSaveResult =
  | { type: "banner"; bannerUrl: string | null }
  | { type: "storeBanner"; storeBannerUrl: string | null }
  | { type: "tile"; tileUrl: string | null }
  | { type: "logo"; logoUrl: string | null }
  | { type: "avatar"; avatarUrl: string | null };

type MemoryHookReturn = ReturnType<typeof useCapsuleCustomizerMemory>;

function describeSource(source: SelectedBanner | null, label: string): string {
  if (!source) {
    return `No ${label} selected yet. Upload an image, pick a memory, or describe one below.`;
  }
  if (source.kind === "upload") return `Uploaded - ${source.name}`;
  if (source.kind === "memory") return `Memory - ${source.title?.trim() || "Untitled memory"}`;
  return `AI prompt - "${source.prompt}"`;
}


function buildPromptEnvelope(base: string, refinements: string[], latest: string): string {
  const segments = [base, ...refinements, latest]
    .map((segment) => segment.trim())
    .filter((segment) => segment.length);
  if (!segments.length) return latest;
  return segments
    .map((segment, index) => (index === 0 ? segment : `Refine with: ${segment}`))
    .join("\n\n");
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

export type UseCapsuleCustomizerStateReturn = {
  open: boolean;
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
  chat: CapsuleChatState;
  memory: CapsuleMemoryState;
  preview: CapsulePreviewState;
  uploads: CapsuleUploadState;
  save: CapsuleSaveState;
  handleClose: () => void;
  overlayClick: React.MouseEventHandler<HTMLDivElement>;
  describeSelection: (selection: SelectedBanner | null) => string;
};

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
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadObjectUrlRef = React.useRef<string | null>(null);
  const [savePending, setSavePending] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const clearSaveError = React.useCallback(() => {
    setSaveError(null);
  }, []);

  const fetchMemoryAssetRef = React.useRef<(memoryId: string) => Promise<string>>(
    async () => {
      throw new Error("Memory asset fetch not ready.");
    },
  );
  const cropUpdateRef = React.useRef<(banner: CroppableBanner) => void>(() => {});

  const {
    previewState,
    updateSelectedBanner,
    composeAssetImage,
  } = useCapsuleCustomizerPreview({
    assetLabel,
    customizerMode,
    open,
    selectedBanner,
    setSelectedBanner,
    onCropUpdate: (banner) => cropUpdateRef.current(banner),
    resetSaveError: clearSaveError,
    fetchMemoryAssetUrl: (memoryId) => fetchMemoryAssetRef.current(memoryId),
  });

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
    fetchMemoryAssetUrl: (memoryId) => fetchMemoryAssetRef.current(memoryId),
  });

  cropUpdateRef.current = syncBannerCropToMessages;

  const memory = useCapsuleCustomizerMemory({
    open,
    onClose,
    updateSelectedBanner,
    onResetPromptHistory: resetPromptHistory,
  });

  fetchMemoryAssetRef.current = memory.fetchMemoryAssetUrl;

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
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = null;
    }
  }, [assistantIntro, open, resetConversation]);

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
  }, [messages, open]);

  React.useEffect(
    () => () => {
      if (uploadObjectUrlRef.current) {
        URL.revokeObjectURL(uploadObjectUrlRef.current);
        uploadObjectUrlRef.current = null;
      }
    },
    [],
  );

  const handleClose = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const handleUploadClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (uploadObjectUrlRef.current) {
        URL.revokeObjectURL(uploadObjectUrlRef.current);
        uploadObjectUrlRef.current = null;
      }

      const objectUrl = URL.createObjectURL(file);
      uploadObjectUrlRef.current = objectUrl;
      updateSelectedBanner({
        kind: "upload",
        name: file.name,
        url: objectUrl,
        file,
        crop: { offsetX: 0, offsetY: 0 },
      });
      resetPromptHistory();
      event.target.value = "";
    },
    [resetPromptHistory, updateSelectedBanner],
  );


  const handleSaveAsset = React.useCallback(async () => {
    if (customizerMode !== "avatar" && !capsuleId) {
      setSaveError("Capsule not ready. Please refresh and try again.");
      return;
    }
    if (!selectedBanner) {
      setSaveError(`Choose an image before saving your ${assetLabel}.`);
      return;
    }

    const aiPrompt = selectedBanner.kind === "ai" ? selectedBanner.prompt : null;
    if (selectedBanner.kind === "ai") {
      setSaveError(`Choose an image before saving your ${assetLabel}.`);
      return;
    }

    setSavePending(true);
    setSaveError(null);
    try {
      const exportResult = await composeAssetImage();
      const safeSlug = normalizedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
      const fileNamePrefix =
        customizerMode === "avatar"
          ? "profile"
          : customizerMode === "logo"
            ? "capsule-logo"
            : customizerMode === "storeBanner"
              ? "capsule-store"
              : safeSlug || "capsule";
      const fileName = `${fileNamePrefix}-${customizerMode}-${Date.now()}.jpg`;
      const bannerFile = new File([exportResult.blob], fileName, { type: exportResult.mimeType });

      const arrayBuffer = await exportResult.blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const imageData = btoa(binary);

      const endpoint =
        customizerMode === "tile"
          ? `/api/capsules/${capsuleId}/tile`
          : customizerMode === "logo"
            ? `/api/capsules/${capsuleId}/logo`
            : customizerMode === "avatar"
              ? "/api/account/avatar"
              : customizerMode === "storeBanner"
                ? `/api/capsules/${capsuleId}/store-banner`
                : `/api/capsules/${capsuleId}/banner`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData,
          filename: bannerFile.name,
          mimeType: bannerFile.type,
          crop: selectedBanner.crop ?? { offsetX: 0, offsetY: 0 },
          source: selectedBanner.kind,
          originalUrl:
            selectedBanner.kind === "memory"
              ? (selectedBanner.fullUrl ?? selectedBanner.url)
              : selectedBanner.kind === "upload"
                ? null
                : null,
          originalName:
            selectedBanner.kind === "upload"
              ? selectedBanner.name
              : selectedBanner.kind === "memory"
                ? (selectedBanner.title ?? null)
                : null,
          prompt: aiPrompt,
          memoryId: selectedBanner.kind === "memory" ? selectedBanner.id : null,
          width: exportResult.width,
          height: exportResult.height,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `Failed to save ${assetLabel}.`);
      }

      const payload = (await response.json()) as {
        bannerUrl?: string | null;
        storeBannerUrl?: string | null;
        tileUrl?: string | null;
        logoUrl?: string | null;
        avatarUrl?: string | null;
      };
      if (customizerMode === "tile") {
        onSaved?.({ type: "tile", tileUrl: payload.tileUrl ?? null });
      } else if (customizerMode === "logo") {
        onSaved?.({ type: "logo", logoUrl: payload.logoUrl ?? null });
      } else if (customizerMode === "avatar") {
        const nextAvatarUrl = payload.avatarUrl ?? null;
        onSaved?.({ type: "avatar", avatarUrl: nextAvatarUrl });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("capsules:avatar-updated", {
              detail: { avatarUrl: nextAvatarUrl },
            }),
          );
        }
      } else if (customizerMode === "storeBanner") {
        onSaved?.({ type: "storeBanner", storeBannerUrl: payload.storeBannerUrl ?? null });
      } else {
        onSaved?.({ type: "banner", bannerUrl: payload.bannerUrl ?? null });
      }
      await refresh().catch(() => {});
      updateSelectedBanner(null);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : `Failed to save ${assetLabel}.`);
    } finally {
      setSavePending(false);
    }
  }, [
    assetLabel,
    capsuleId,
    composeAssetImage,
    customizerMode,
    normalizedName,
    onClose,
    onSaved,
    selectedBanner,
    updateSelectedBanner,
    refresh,
  ]);

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
      selected: selectedBanner,
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
    uploads: {
      onUploadClick: handleUploadClick,
      onFileChange: handleFileChange,
      fileInputRef,
    },
    save: {
      pending: savePending,
      error: saveError,
      onSave: handleSaveAsset,
    },
    handleClose,
    overlayClick,
    describeSelection,
  };
}
