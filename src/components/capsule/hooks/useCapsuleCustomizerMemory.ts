"use client";

import * as React from "react";

import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import type { SelectedBanner } from "./capsuleCustomizerTypes";

type UseCustomizerMemoryOptions = {
  open: boolean;
  onClose: () => void;
  updateSelectedBanner: (banner: SelectedBanner | null) => void;
  onResetPromptHistory: () => void;
};

export function useCapsuleCustomizerMemory({
  open,
  onClose,
  updateSelectedBanner,
  onResetPromptHistory,
}: UseCustomizerMemoryOptions) {
  const {
    user,
    envelope,
    items,
    loading,
    error,
    refresh,
    hasMore: uploadsHasMore,
    loadMore: loadMoreUploads,
  } = useMemoryUploads("upload", { enablePaging: true, pageSize: 24 });
  const {
    envelope: assetsEnvelope,
    items: assetItems,
    loading: assetsLoading,
    error: assetsError,
    refresh: refreshAssets,
    hasMore: assetsHasMore,
    loadMore: loadMoreAssets,
  } = useMemoryUploads(null, { enablePaging: true, pageSize: 24 });
  const memoryButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [memoryPickerTab, setMemoryPickerTab] = React.useState<"uploads" | "assets">("uploads");

  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const origin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const processedUploads = React.useMemo<DisplayMemoryUpload[]>(
    () => computeDisplayUploads(items, { origin, cloudflareEnabled }),
    [cloudflareEnabled, items, origin],
  );
  const processedAssets = React.useMemo<DisplayMemoryUpload[]>(
    () =>
      computeDisplayUploads(
        assetItems.filter((item) => (item.kind ?? "").toLowerCase() !== "upload"),
        { origin, cloudflareEnabled },
      ),
    [assetItems, cloudflareEnabled, origin],
  );

  const recentMemories = React.useMemo<DisplayMemoryUpload[]>(
    () => processedUploads.slice(0, 4),
    [processedUploads],
  );

  const [memoryPickerOpen, setMemoryPickerOpen] = React.useState(false);

  const closeMemoryPicker = React.useCallback(() => {
    setMemoryPickerOpen((previous) => {
      if (!previous) return previous;
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          memoryButtonRef.current?.focus();
        }, 0);
      } else {
        memoryButtonRef.current?.focus();
      }
      return false;
    });
  }, []);

  const openMemoryPicker = React.useCallback(() => {
    if (!memoryPickerOpen && !loading && items.length === 0) {
      void refresh();
    }
    setMemoryPickerOpen(true);
  }, [items.length, loading, memoryPickerOpen, refresh]);

  const handleMemorySelect = React.useCallback(
    (memory: DisplayMemoryUpload) => {
      const url = memory.fullUrl || memory.displayUrl;
      updateSelectedBanner({
        kind: "memory",
        id: memory.id,
        title: memory.title?.trim() || memory.description?.trim() || null,
        url,
        fullUrl: memory.fullUrl || memory.displayUrl,
        crop: { offsetX: 0, offsetY: 0 },
      });
      onResetPromptHistory();
    },
    [onResetPromptHistory, updateSelectedBanner],
  );

  const handleMemoryPick = React.useCallback(
    (memory: DisplayMemoryUpload) => {
      handleMemorySelect(memory);
      closeMemoryPicker();
    },
    [closeMemoryPicker, handleMemorySelect],
  );

  const handleQuickPick = React.useCallback(() => {
    const firstMemory = processedUploads[0];
    if (firstMemory) {
      handleMemoryPick(firstMemory);
    }
  }, [handleMemoryPick, processedUploads]);

  const fetchMemoryAssetUrl = React.useCallback(
    async (memoryIdRaw: string): Promise<string> => {
      const trimmedId = memoryIdRaw.trim();
      if (!trimmedId.length) {
        throw new Error("Memory is missing its identifier.");
      }

      const payload: Record<string, unknown> = { memoryId: trimmedId };
      if (envelope) {
        payload.user = envelope;
      }

      const response = await fetch("/api/memory/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((error: unknown) => {
        throw error instanceof Error ? error : new Error("Failed to fetch memory image.");
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        let message = "";
        if (contentType.includes("application/json")) {
          const detail = (await response.json().catch(() => null)) as { error?: string } | null;
          if (detail && typeof detail.error === "string" && detail.error.trim().length) {
            message = detail.error.trim();
          }
        }
        if (!message) {
          message =
            response.status === 404
              ? "Memory image not available."
              : "Failed to fetch memory image.";
        }
        throw new Error(message);
      }

      if (contentType.includes("application/json")) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        const message =
          detail && typeof detail.error === "string" && detail.error.trim().length
            ? detail.error.trim()
            : "Failed to fetch memory image.";
        throw new Error(message);
      }

      const buffer = await response.arrayBuffer();
      const blob = new Blob([buffer], { type: contentType || "image/jpeg" });
      return URL.createObjectURL(blob);
    },
    [envelope],
  );

  const searchMemories = React.useCallback(
    async ({
      tab,
      query,
      page,
      pageSize,
    }: {
      tab: "uploads" | "assets";
      query: string;
      page: number;
      pageSize: number;
    }) => {
      const authEnvelope = envelope ?? assetsEnvelope;
      if (!authEnvelope) {
        return { items: [] as DisplayMemoryUpload[], hasMore: false, error: "Sign in to search memories." };
      }

      const response = await fetch("/api/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: authEnvelope,
          q: query,
          page,
          limit: pageSize,
          kind: tab === "uploads" ? "upload" : undefined,
        }),
      }).catch(() => null);

      if (!response || !response.ok) {
        return { items: [] as DisplayMemoryUpload[], hasMore: false, error: "Search failed. Try again." };
      }

      const json = (await response.json().catch(() => null)) as { items?: DisplayMemoryUpload[] } | null;
      const rawItems = Array.isArray(json?.items) ? json?.items : [];
      const processed = computeDisplayUploads(rawItems, { origin, cloudflareEnabled });
      const filtered =
        tab === "uploads"
          ? processed.filter((item) => (item.kind ?? "").toLowerCase() === "upload")
          : processed.filter((item) => (item.kind ?? "").toLowerCase() !== "upload");
      return {
        items: filtered,
        hasMore: rawItems.length >= pageSize,
        error: null,
      };
    },
    [assetsEnvelope, cloudflareEnabled, envelope, origin],
  );

  React.useEffect(() => {
    if (!open) {
      setMemoryPickerOpen(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!memoryPickerOpen) return;
    void refresh();
    void refreshAssets();
  }, [memoryPickerOpen, refresh, refreshAssets]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (memoryPickerOpen) return;
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [memoryPickerOpen, onClose, open]);

  React.useEffect(() => {
    if (!memoryPickerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMemoryPicker();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMemoryPicker, memoryPickerOpen]);

  return {
    user,
    envelope,
    loading,
    error,
    uploadsLoading: loading,
    uploadsError: error,
    assetsLoading,
    assetsError,
    uploadsHasMore,
    assetsHasMore,
    loadMoreUploads,
    loadMoreAssets,
    processedMemories: processedUploads,
    processedUploads,
    processedAssets,
    recentMemories,
    memoryPickerOpen,
    memoryPickerTab,
    setMemoryPickerTab,
    openMemoryPicker,
    closeMemoryPicker,
    handleMemorySelect,
    handleMemoryPick,
    handleQuickPick,
    refresh,
    refreshAssets,
    searchMemories,
    memoryButtonRef,
    fetchMemoryAssetUrl,
  } as const;
}
