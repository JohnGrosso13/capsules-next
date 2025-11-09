"use client";

import * as React from "react";

import { useSmartContextPersistence } from "@/components/composer/state/useSmartContextPersistence";

type SmartContextValue = {
  smartContextEnabled: boolean;
  setSmartContextEnabled(enabled: boolean): void;
};

const SmartContext = React.createContext<SmartContextValue | null>(null);

type ComposerSmartContextProviderProps = {
  children: React.ReactNode;
};

export function ComposerSmartContextProvider({
  children,
}: ComposerSmartContextProviderProps) {
  const [smartContextEnabled, setSmartContextEnabled] = React.useState(true);
  useSmartContextPersistence(smartContextEnabled, setSmartContextEnabled);

  const value = React.useMemo(
    () => ({ smartContextEnabled, setSmartContextEnabled }),
    [smartContextEnabled],
  );

  return <SmartContext.Provider value={value}>{children}</SmartContext.Provider>;
}

export function useComposerSmartContext(): SmartContextValue {
  const context = React.useContext(SmartContext);
  if (!context) {
    throw new Error("useComposerSmartContext must be used within ComposerSmartContextProvider");
  }
  return context;
}
