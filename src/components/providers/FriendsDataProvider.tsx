"use client";

import * as React from "react";

import { useFriendsData } from "@/hooks/useFriendsData";

type FriendsDataValue = ReturnType<typeof useFriendsData>;

const FriendsDataContext = React.createContext<FriendsDataValue | null>(null);

export function FriendsDataProvider({ children }: { children: React.ReactNode }) {
  const value = useFriendsData();
  return <FriendsDataContext.Provider value={value}>{children}</FriendsDataContext.Provider>;
}

export function useOptionalFriendsDataContext(): FriendsDataValue | null {
  return React.useContext(FriendsDataContext);
}

export function useFriendsDataContext(): FriendsDataValue {
  const context = React.useContext(FriendsDataContext);
  if (!context) {
    throw new Error("useFriendsDataContext must be used within a FriendsDataProvider");
  }
  return context;
}
