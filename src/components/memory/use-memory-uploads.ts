"use client";

import * as React from "react";

import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { useCurrentUser } from "@/services/auth/client";
import type { AuthClientUser } from "@/ports/auth-client";

import type { MemoryUploadItem } from "./uploads-types";

type UseMemoryUploadsResult = {
  user: AuthClientUser | null;
  envelope: ReturnType<typeof buildMemoryEnvelope>;
  items: MemoryUploadItem[];
  setItems: React.Dispatch<React.SetStateAction<MemoryUploadItem[]>>;
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  refresh: () => Promise<void>;
};

export function useMemoryUploads(kind = "upload"): UseMemoryUploadsResult {
  const { user } = useCurrentUser();
  const envelope = React.useMemo(() => (user ? buildMemoryEnvelope(user) : null), [user]);
  const [items, setItems] = React.useState<MemoryUploadItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!envelope) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: envelope, kind }),
      });
      if (!res.ok) throw new Error("Failed to fetch uploads");
      const json = (await res.json()) as { items?: MemoryUploadItem[] };
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      setError((err as Error)?.message || "Failed to load uploads");
    } finally {
      setLoading(false);
    }
  }, [envelope, kind]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    user,
    envelope,
    items,
    setItems,
    loading,
    error,
    setError,
    refresh,
  };
}
