"use client";

import * as React from "react";

type SupabaseSessionValue = {
  supabaseUserId: string | null;
};

const SupabaseSessionContext = React.createContext<SupabaseSessionValue | null>(null);

type SupabaseSessionProviderProps = {
  children: React.ReactNode;
  supabaseUserId?: string | null;
};

function normalizeSupabaseUserId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function SupabaseSessionProvider({
  children,
  supabaseUserId = null,
}: SupabaseSessionProviderProps) {
  const normalizedId = React.useMemo(
    () => normalizeSupabaseUserId(supabaseUserId),
    [supabaseUserId],
  );

  const contextValue = React.useMemo<SupabaseSessionValue>(
    () => ({
      supabaseUserId: normalizedId,
    }),
    [normalizedId],
  );

  return (
    <SupabaseSessionContext.Provider value={contextValue}>
      {children}
    </SupabaseSessionContext.Provider>
  );
}

export function useSupabaseSession(): SupabaseSessionValue | null {
  return React.useContext(SupabaseSessionContext);
}

export function useSupabaseUserId(): string | null {
  return React.useContext(SupabaseSessionContext)?.supabaseUserId ?? null;
}
