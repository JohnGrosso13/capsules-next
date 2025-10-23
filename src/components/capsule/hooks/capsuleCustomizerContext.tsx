"use client";

import * as React from "react";

import type {
  CapsuleChatState,
  CapsuleCustomizerActions,
  CapsuleCustomizerCoordinator,
  CapsuleCustomizerMeta,
  CapsuleMemoryState,
  CapsulePreviewState,
  CapsuleSaveState,
  CapsuleUploadState,
  CapsuleVariantState,
  CapsulePersonaState,
  CapsuleAdvancedOptionsState,
} from "./useCapsuleCustomizerState";

export type CapsuleCustomizerContextValue = Omit<CapsuleCustomizerCoordinator, "open">;

const CapsuleCustomizerContext = React.createContext<CapsuleCustomizerContextValue | null>(null);

type CapsuleCustomizerProviderProps = {
  value: CapsuleCustomizerContextValue;
  children: React.ReactNode;
};

export function CapsuleCustomizerProvider({ value, children }: CapsuleCustomizerProviderProps) {
  return (
    <CapsuleCustomizerContext.Provider value={value}>
      {children}
    </CapsuleCustomizerContext.Provider>
  );
}

function useCapsuleCustomizerContext(): CapsuleCustomizerContextValue {
  const context = React.useContext(CapsuleCustomizerContext);
  if (!context) {
    throw new Error("CapsuleCustomizer context is not available outside its provider.");
  }
  return context;
}

export function useCapsuleCustomizerMeta(): CapsuleCustomizerMeta {
  return useCapsuleCustomizerContext().meta;
}

export function useCapsuleCustomizerChat(): CapsuleChatState {
  return useCapsuleCustomizerContext().chat;
}

export function useCapsuleCustomizerMemory(): CapsuleMemoryState {
  return useCapsuleCustomizerContext().memory;
}

export function useCapsuleCustomizerPreview(): CapsulePreviewState {
  return useCapsuleCustomizerContext().preview;
}

export function useCapsuleCustomizerUploads(): CapsuleUploadState {
  return useCapsuleCustomizerContext().uploads;
}

export function useCapsuleCustomizerPersonas(): CapsulePersonaState {
  return useCapsuleCustomizerContext().personas;
}

export function useCapsuleCustomizerAdvancedOptions(): CapsuleAdvancedOptionsState {
  return useCapsuleCustomizerContext().advanced;
}

export function useCapsuleCustomizerVariants(): CapsuleVariantState {
  return useCapsuleCustomizerContext().variants;
}

export function useCapsuleCustomizerSave(): CapsuleSaveState {
  return useCapsuleCustomizerContext().save;
}

export function useCapsuleCustomizerActions(): CapsuleCustomizerActions {
  return useCapsuleCustomizerContext().actions;
}

export function useCapsuleCustomizerDescribeSelection(): CapsuleCustomizerActions["describeSelection"] {
  return useCapsuleCustomizerContext().actions.describeSelection;
}
