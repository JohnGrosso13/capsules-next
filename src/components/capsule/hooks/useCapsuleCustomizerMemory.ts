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
  const { user, envelope, items, loading, error, refresh } = useMemoryUploads("upload");
  const memoryButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const origin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const processedMemories = React.useMemo<DisplayMemoryUpload[]>(
    () => computeDisplayUploads(items, { origin, cloudflareEnabled }),
    [cloudflareEnabled, items, origin],
  );

  const recentMemories = React.useMemo<DisplayMemoryUpload[]>(
    () => processedMemories.slice(0, 4),
    [processedMemories],
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
    const firstMemory = processedMemories[0];
    if (firstMemory) {
      handleMemoryPick(firstMemory);
    }
  }, [handleMemoryPick, processedMemories]);

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

  React.useEffect(() => {
    if (!open) {
      setMemoryPickerOpen(false);
    }
  }, [open]);

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
    fetchMemoryAssetUrl,
  } as const;
}
