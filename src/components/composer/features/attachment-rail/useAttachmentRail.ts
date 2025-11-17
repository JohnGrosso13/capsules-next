"use client";

import * as React from "react";

import { useAttachmentUpload, type LocalAttachment } from "@/hooks/useAttachmentUpload";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import {
  buildImageVariants,
  pickBestDisplayVariant,
  pickBestFullVariant,
  type CloudflareImageVariantSet,
} from "@/lib/cloudflare/images";
import { buildLocalImageVariants, shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import type { ComposerDraft } from "@/lib/composer/draft";

import type { MemoryPickerTab } from "../../components/ComposerMemoryPicker";

export type AttachmentMemoryItem = DisplayMemoryUpload;

type UseAttachmentRailParams = {
  draft: ComposerDraft;
  onDraftChange(partial: Partial<ComposerDraft>): void;
  capsuleId?: string | null;
  assistantCaption?: string | null;
};

export type AttachmentMemoryPickerState = {
  open: boolean;
  tab: MemoryPickerTab;
  uploads: DisplayMemoryUpload[];
  uploadsLoading: boolean;
  uploadsError: string | null;
  assets: DisplayMemoryUpload[];
  assetsLoading: boolean;
  assetsError: string | null;
  openPicker(tab?: MemoryPickerTab): void;
  closePicker(): void;
  onTabChange(tab: MemoryPickerTab): void;
};

export type AttachmentRailController = {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleAttachClick(): void;
  handleAttachmentSelect(event: React.ChangeEvent<HTMLInputElement>): Promise<void>;
  handleAttachmentFile(file: File | null | undefined): Promise<void>;
  attachRemoteAttachment(options: {
    url: string;
    name?: string | null;
    mimeType?: string | null;
    thumbUrl?: string | null;
    size?: number | null;
  }): void;
  attachmentUploading: boolean;
  readyAttachment: LocalAttachment | null;
  displayAttachment: LocalAttachment | null;
  attachmentKind: "image" | "video" | null;
  attachmentStatusLabel: string | null;
  attachmentPreviewUrl: string | null;
  attachmentDisplayUrl: string | null;
  attachmentFullUrl: string | null;
  attachmentProgressPct: number;
  removeAttachment(): void;
  vibeSuggestions: Array<{ label: string; prompt: string }>;
  cloudflareEnabled: boolean;
  memoryPicker: AttachmentMemoryPickerState;
  attachmentCaption: string | null;
  attachmentMemoryPrompt: string | null;
};

export function useAttachmentRail({
  draft,
  onDraftChange,
  capsuleId,
  assistantCaption,
}: UseAttachmentRailParams): AttachmentRailController {
  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading: attachmentUploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
    handleAttachmentFile,
    attachRemoteAttachment,
  } = useAttachmentUpload(undefined, {
    metadata: () => (capsuleId ? { capsule_id: capsuleId } : null),
  });

  const [memoryPickerOpen, setMemoryPickerOpen] = React.useState(false);
  const [memoryPickerTab, setMemoryPickerTab] = React.useState<MemoryPickerTab>("uploads");
  const memoryUploads = useMemoryUploads("upload");
  const memoryAssets = useMemoryUploads(null);

  const cloudflareBypass = React.useMemo(() => shouldBypassCloudflareImages(), []);
  const cloudflareEnabled = React.useMemo(() => !cloudflareBypass, [cloudflareBypass]);
  const memoryOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const uploadMemories = React.useMemo(
    () => computeDisplayUploads(memoryUploads.items, { origin: memoryOrigin, cloudflareEnabled }),
    [cloudflareEnabled, memoryOrigin, memoryUploads.items],
  );
  const filteredAssetItems = React.useMemo(
    () => memoryAssets.items.filter((item) => (item.kind ?? "").toLowerCase() !== "upload"),
    [memoryAssets.items],
  );
  const assetMemories = React.useMemo(
    () => computeDisplayUploads(filteredAssetItems, { origin: memoryOrigin, cloudflareEnabled }),
    [cloudflareEnabled, filteredAssetItems, memoryOrigin],
  );

  const refreshUploads = memoryUploads.refresh;
  const refreshAssets = memoryAssets.refresh;

  React.useEffect(() => {
    if (!memoryPickerOpen) return;
    void refreshUploads();
    void refreshAssets();
  }, [memoryPickerOpen, refreshAssets, refreshUploads]);

  const displayAttachment = React.useMemo<LocalAttachment | null>(() => {
    if (attachment) return attachment;
    if (draft.mediaUrl) {
      const inferredKind = (draft.kind ?? "").toLowerCase();
      let inferredMime = "application/octet-stream";
      if (inferredKind.startsWith("video")) inferredMime = "video/*";
      else if (inferredKind.startsWith("image")) inferredMime = "image/*";
      else if (inferredKind.startsWith("audio")) inferredMime = "audio/*";
      else if (inferredKind.startsWith("text")) inferredMime = "text/plain";
      else if (inferredKind.startsWith("document")) inferredMime = "application/octet-stream";
      const derivedName =
        draft.mediaPrompt?.trim() ||
        draft.title?.trim() ||
        draft.mediaUrl.split("/").pop() ||
        "Attached media";
      return {
        id: "draft-media",
        name: derivedName,
        size: 0,
        mimeType: inferredMime,
        status: "ready",
        url: draft.mediaUrl ?? draft.mediaPlaybackUrl ?? null,
        progress: 1,
        thumbUrl: draft.mediaThumbnailUrl ?? null,
        role: "reference",
        source: "ai",
      };
    }
    return null;
  }, [
    attachment,
    draft.kind,
    draft.mediaPlaybackUrl,
    draft.mediaPrompt,
    draft.mediaThumbnailUrl,
    draft.mediaUrl,
    draft.title,
  ]);

  const attachmentStatusLabel = React.useMemo(() => {
    if (!displayAttachment) return null;
    if (displayAttachment.status === "uploading") {
      if (displayAttachment.phase === "finalizing") {
        return "Finishing upload...";
      }
      const pct = Math.round((displayAttachment.progress ?? 0) * 100);
      return pct > 0 ? `Uploading ${pct}%` : "Uploading...";
    }
    if (displayAttachment.status === "error") {
      return displayAttachment.error ?? "Upload failed";
    }
    return null;
  }, [displayAttachment]);

  const attachmentPreviewUrl = React.useMemo(() => {
    if (!displayAttachment) return null;
    if (displayAttachment.thumbUrl) return displayAttachment.thumbUrl;
    if (displayAttachment.url && displayAttachment.mimeType.startsWith("image/")) {
      return displayAttachment.url;
    }
    return null;
  }, [displayAttachment]);

  const hasAttachment = Boolean(displayAttachment);
  const attachmentMime = displayAttachment?.mimeType ?? "";
  const attachmentUrl = displayAttachment?.url ?? null;
  const attachmentThumb = displayAttachment?.thumbUrl ?? attachmentPreviewUrl ?? null;
  const attachmentProgress = displayAttachment?.progress ?? 0;
  const attachmentMemoryPrompt =
    typeof draft.mediaPrompt === "string" && draft.mediaPrompt.trim().length
      ? draft.mediaPrompt.trim()
      : null;
  const attachmentCaption =
    typeof assistantCaption === "string" && assistantCaption.trim().length
      ? assistantCaption.trim()
      : null;

  const attachmentKind = React.useMemo<"image" | "video" | null>(
    () => (attachmentMime.startsWith("video/") ? "video" : attachmentMime ? "image" : null),
    [attachmentMime],
  );

  const attachmentProgressPct = React.useMemo(
    () => Math.round((attachmentProgress ?? 0) * 100),
    [attachmentProgress],
  );

  const attachmentVariants = React.useMemo<CloudflareImageVariantSet | null>(() => {
    if (!hasAttachment || attachmentKind !== "image" || !attachmentUrl) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : null;
    if (cloudflareBypass) {
      return buildLocalImageVariants(attachmentUrl, attachmentThumb, origin);
    }
    return buildImageVariants(attachmentUrl, {
      thumbnailUrl: attachmentThumb,
      origin,
    });
  }, [attachmentKind, attachmentThumb, attachmentUrl, cloudflareBypass, hasAttachment]);

  const attachmentDisplayUrl = React.useMemo(() => {
    if (!hasAttachment) return null;
    if (attachmentKind === "video") {
      return attachmentUrl;
    }
    const variantUrl = pickBestDisplayVariant(attachmentVariants);
    return variantUrl ?? attachmentPreviewUrl ?? attachmentUrl;
  }, [attachmentKind, attachmentPreviewUrl, attachmentUrl, attachmentVariants, hasAttachment]);

  const attachmentFullUrl = React.useMemo(() => {
    if (!hasAttachment) return null;
    if (attachmentKind === "video") {
      return attachmentUrl;
    }
    const variantUrl = pickBestFullVariant(attachmentVariants);
    return variantUrl ?? attachmentUrl;
  }, [attachmentKind, attachmentUrl, attachmentVariants, hasAttachment]);

  const removeAttachment = React.useCallback(() => {
    const currentKind = (draft.kind ?? "text").toLowerCase();
    const partial: Partial<ComposerDraft> = {
      mediaUrl: null,
      mediaPrompt: null,
      mediaThumbnailUrl: null,
      mediaPlaybackUrl: null,
      mediaDurationSeconds: null,
      muxPlaybackId: null,
      muxAssetId: null,
    };
    if (currentKind === "image" || currentKind === "video") {
      partial.kind = "text";
    }
    onDraftChange(partial);
    clearAttachment();
  }, [clearAttachment, draft.kind, onDraftChange]);

  const vibeSuggestions = React.useMemo(() => {
    if (!displayAttachment || displayAttachment.status !== "ready" || !displayAttachment.url) {
      return [] as Array<{ label: string; prompt: string }>;
    }
    const isVideo = displayAttachment.mimeType.startsWith("video/");
    if (isVideo) {
      return [
        {
          label: "Summarize this clip",
          prompt: "Summarize this video and call out the key beats.",
        },
        { label: "Suggest edits", prompt: "Suggest ways we could edit or enhance this video." },
        {
          label: "Remove distractions",
          prompt: "Remove background distractions and keep the focus on the key people in this clip.",
        },
        {
          label: "Tighten the cut",
          prompt: "Trim this video to the most impactful 20 seconds and smooth the transitions.",
        },
        { label: "Prep a post", prompt: "Draft a social post that spotlights this video." },
      ];
    }
    return [
      { label: "Describe this image", prompt: "Describe this image in vivid detail." },
      {
        label: "Create a post",
        prompt: "Draft a social post that uses this image as the hero visual.",
      },
      { label: "Edit ideas", prompt: "Suggest edits or variations for this image." },
    ];
  }, [displayAttachment]);

  React.useEffect(() => {
    if (!readyAttachment?.url) return;
    if (readyAttachment.url === draft.mediaUrl) return;
    const nextKind = readyAttachment.mimeType.startsWith("video/") ? "video" : "image";
    const currentKind = (draft.kind ?? "text").toLowerCase();
    const partial: Partial<ComposerDraft> = {
      mediaUrl: readyAttachment.url,
      mediaPrompt: null,
      mediaThumbnailUrl: readyAttachment.thumbUrl ?? null,
      mediaPlaybackUrl: readyAttachment.url,
      mediaDurationSeconds: null,
      muxPlaybackId: null,
      muxAssetId: null,
    };
    if (
      currentKind === "text" ||
      currentKind === "image" ||
      currentKind === "video" ||
      !currentKind
    ) {
      partial.kind = nextKind;
    }
    onDraftChange(partial);
  }, [draft.kind, draft.mediaUrl, onDraftChange, readyAttachment]);

  React.useEffect(() => {
    if (attachment && attachment.status === "uploading" && draft.mediaUrl) {
      const currentKind = (draft.kind ?? "text").toLowerCase();
      const partial: Partial<ComposerDraft> = {
        mediaUrl: null,
        mediaPrompt: null,
        mediaThumbnailUrl: null,
        mediaPlaybackUrl: null,
        mediaDurationSeconds: null,
        muxPlaybackId: null,
        muxAssetId: null,
      };
      if (currentKind === "image" || currentKind === "video") {
        partial.kind = "text";
      }
      onDraftChange(partial);
    }
  }, [attachment, draft.kind, draft.mediaUrl, onDraftChange]);

  const openMemoryPicker = React.useCallback((tab: MemoryPickerTab = "uploads") => {
    setMemoryPickerTab(tab);
    setMemoryPickerOpen(true);
  }, []);

  const closeMemoryPicker = React.useCallback(() => setMemoryPickerOpen(false), []);

  const handleMemoryTabChange = React.useCallback((tab: MemoryPickerTab) => {
    setMemoryPickerTab(tab);
  }, []);

  return {
    fileInputRef,
    handleAttachClick,
    handleAttachmentSelect,
    handleAttachmentFile,
    attachRemoteAttachment,
    attachmentUploading,
    readyAttachment,
    displayAttachment,
    attachmentKind,
    attachmentStatusLabel,
    attachmentPreviewUrl,
    attachmentDisplayUrl,
    attachmentFullUrl,
    attachmentProgressPct,
    attachmentCaption,
    attachmentMemoryPrompt,
    removeAttachment,
    vibeSuggestions,
    cloudflareEnabled,
    memoryPicker: {
      open: memoryPickerOpen,
      tab: memoryPickerTab,
      uploads: uploadMemories,
      uploadsLoading: memoryUploads.loading,
      uploadsError: memoryUploads.error,
      assets: assetMemories,
      assetsLoading: memoryAssets.loading,
      assetsError: memoryAssets.error,
      openPicker: openMemoryPicker,
      closePicker: closeMemoryPicker,
      onTabChange: handleMemoryTabChange,
    },
  };
}
