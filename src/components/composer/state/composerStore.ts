"use client";

import * as React from "react";

export type SelectorStore<TState> = {
  getState(): TState;
  setState(updater: React.SetStateAction<TState>): TState;
  subscribe(listener: () => void): () => void;
};

export function createSelectorStore<TState>(initialState: TState): SelectorStore<TState> {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState() {
      return state;
    },
    setState(updater) {
      const nextState =
        typeof updater === "function"
          ? (updater as (prev: TState) => TState)(state)
          : updater;
      if (Object.is(state, nextState)) {
        return state;
      }
      state = nextState;
      listeners.forEach((listener) => listener());
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type EqualityChecker<Slice> = (a: Slice, b: Slice) => boolean;

export function useSelectorStore<TState, Slice>(
  store: SelectorStore<TState>,
  selector: (state: TState) => Slice,
  equality: EqualityChecker<Slice> = Object.is,
): Slice {
  const lastSliceRef = React.useRef<Slice | undefined>(undefined);

  const getSnapshot = React.useCallback(() => {
    const nextState = store.getState();
    const nextSlice = selector(nextState);
    const prevSlice = lastSliceRef.current;
    if (typeof prevSlice !== "undefined" && equality(nextSlice, prevSlice)) {
      return prevSlice;
    }
    lastSliceRef.current = nextSlice;
    return nextSlice;
  }, [store, selector, equality]);

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
