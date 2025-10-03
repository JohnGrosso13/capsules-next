"use client";

import * as React from "react";

type SetStateAction<T> = React.SetStateAction<T>;

type Dispatch<T> = React.Dispatch<SetStateAction<T>>;

type MutableRef<T> = React.MutableRefObject<T>;

export type FeedRefreshState<T> = {
  items: T;
  setItems: Dispatch<T>;
  itemsRef: MutableRef<T>;
  beginRefresh: () => number;
  completeRefresh: (token: number, nextItems: T) => boolean;
  failRefresh: (token: number) => boolean;
  hasFetched: boolean;
  isRefreshing: boolean;
};

export function useFeedRefreshState<T>(initialItems: T): FeedRefreshState<T> {
  const [items, setItems] = React.useState(initialItems);
  const itemsRef = React.useRef(items);
  const [hasFetched, setHasFetched] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const refreshGeneration = React.useRef(0);

  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const beginRefresh = React.useCallback(() => {
    const nextToken = refreshGeneration.current + 1;
    refreshGeneration.current = nextToken;
    setIsRefreshing(true);
    return nextToken;
  }, []);

  const completeRefresh = React.useCallback(
    (token: number, nextItems: T) => {
      if (refreshGeneration.current !== token) {
        return false;
      }
      setItems(nextItems);
      itemsRef.current = nextItems;
      setIsRefreshing(false);
      setHasFetched(true);
      return true;
    },
    [],
  );

  const failRefresh = React.useCallback((token: number) => {
    if (refreshGeneration.current !== token) {
      return false;
    }
    setIsRefreshing(false);
    return true;
  }, []);

  return {
    items,
    setItems,
    itemsRef,
    beginRefresh,
    completeRefresh,
    failRefresh,
    hasFetched,
    isRefreshing,
  };
}
