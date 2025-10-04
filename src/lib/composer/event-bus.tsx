"use client";

import * as React from "react";

import type {
  ComposerEvent,
  ComposerEventMap,
  ComposerEventType,
} from "@/shared/types/artifacts";

type AnyListener = (event: ComposerEvent) => void;

type Listener<K extends ComposerEventType> = (event: ComposerEvent<K>) => void;

export interface ComposerEventBus {
  emit<K extends ComposerEventType>(
    type: K,
    payload: ComposerEventMap[K],
    origin?: ComposerEvent["origin"],
  ): void;
  subscribe<K extends ComposerEventType>(type: K, listener: Listener<K>): () => void;
  reset(): void;
}

class InMemoryComposerEventBus implements ComposerEventBus {
  private listeners = new Map<ComposerEventType, Set<AnyListener>>();

  emit<K extends ComposerEventType>(
    type: K,
    payload: ComposerEventMap[K],
    origin: ComposerEvent["origin"] = "local",
  ): void {
    const registry = this.listeners.get(type);
    if (!registry || registry.size === 0) return;
    const event: ComposerEvent = { type, payload, origin, timestamp: Date.now() };
    registry.forEach((listener) => {
      try {
        listener(event);
      } catch (listenerError) {
        console.error("composer event listener failed", listenerError);
      }
    });
  }

  subscribe<K extends ComposerEventType>(type: K, listener: Listener<K>): () => void {
    const registry = this.listeners.get(type) ?? new Set<AnyListener>();
    if (!this.listeners.has(type)) {
      this.listeners.set(type, registry);
    }
    registry.add(listener as AnyListener);
    return () => {
      const current = this.listeners.get(type);
      if (!current) return;
      current.delete(listener as AnyListener);
      if (!current.size) {
        this.listeners.delete(type);
      }
    };
  }

  reset(): void {
    this.listeners.clear();
  }
}

export function createComposerEventBus(): ComposerEventBus {
  return new InMemoryComposerEventBus();
}

const ComposerEventBusContext = React.createContext<ComposerEventBus | null>(null);

export type ComposerEventBusProviderProps = {
  bus?: ComposerEventBus;
  children: React.ReactNode;
};

export function ComposerEventBusProvider({ bus, children }: ComposerEventBusProviderProps) {
  const memoizedBus = React.useMemo(() => bus ?? createComposerEventBus(), [bus]);
  return (
    <ComposerEventBusContext.Provider value={memoizedBus}>
      {children}
    </ComposerEventBusContext.Provider>
  );
}

export function useComposerEventBus(): ComposerEventBus | null {
  return React.useContext(ComposerEventBusContext);
}

export function useEnsureComposerEventBus(): ComposerEventBus {
  const bus = useComposerEventBus();
  return React.useMemo(() => bus ?? createComposerEventBus(), [bus]);
}
