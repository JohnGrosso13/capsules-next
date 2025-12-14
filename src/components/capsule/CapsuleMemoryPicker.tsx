"use client";

import * as React from "react";

import { ComposerMemoryPicker } from "@/components/composer/components/ComposerMemoryPicker";
import {
  useCapsuleCustomizerMemory,
  useCapsuleCustomizerPreview,
} from "./hooks/capsuleCustomizerContext";

export function CapsuleMemoryPicker() {
  const memory = useCapsuleCustomizerMemory();
  const preview = useCapsuleCustomizerPreview();

  return (
    <ComposerMemoryPicker
      open={memory.isPickerOpen}
      activeTab={memory.tab === "assets" ? "assets" : "uploads"}
      onTabChange={memory.setTab}
      uploads={memory.processedUploads}
      uploadsLoading={memory.uploadsLoading}
      uploadsError={memory.uploadsError}
      uploadsHasMore={memory.uploadsHasMore}
      onLoadMoreUploads={memory.loadMoreUploads}
      assets={memory.processedAssets}
      assetsLoading={memory.assetsLoading}
      assetsError={memory.assetsError}
      assetsHasMore={memory.assetsHasMore}
      onLoadMoreAssets={memory.loadMoreAssets}
      searchEnabled
      searchPageSize={24}
      onSearch={memory.searchMemories}
      onSelect={(selected) => {
        const isCurrent =
          preview.selected?.kind === "memory" && preview.selected.id === selected.id;
        if (!isCurrent) {
          memory.onPickMemory(selected);
        } else {
          memory.closePicker();
        }
      }}
      onClose={memory.closePicker}
    />
  );
}
