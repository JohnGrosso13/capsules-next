"use client";

import * as React from "react";

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
} from "./capsuleCustomizerTypes";

export type {
  CapsuleCustomizerMode,
  SelectedBanner,
  ChatMessage,
  ChatBannerOption,
  CapsuleCustomizerSaveResult,
} from "./capsuleCustomizerTypes";

type MemoryHookReturn = ReturnType<typeof useCapsuleCustomizerMemory>;

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
  });

  cropUpdateRef.current = syncBannerCropToMessages;
  resetPromptHistoryRef.current = resetPromptHistory;

  const memory = useCapsuleCustomizerMemory({
    open,
    onClose,
    updateSelectedBanner,
    onResetPromptHistory: resetPromptHistory,
  });

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
    uploads,
    save: saveState,
    actions: {
      handleClose,
      overlayClick,
      describeSelection,
    },
  };
}
