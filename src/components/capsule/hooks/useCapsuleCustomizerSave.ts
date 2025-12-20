"use client";

import * as React from "react";

import {
  type CapsuleCustomizerMode,
  type CapsuleCustomizerSaveResult,
  type SelectedBanner,
} from "./capsuleCustomizerTypes";
import { blobToBase64, loadImageElement } from "./capsuleImageUtils";

type UseCustomizerSaveOptions = {
  assetLabel: string;
  capsuleId?: string | null;
  customizerMode: CapsuleCustomizerMode;
  normalizedName: string;
  open: boolean;
  selectedBanner: SelectedBanner | null;
  updateSelectedBanner: (banner: SelectedBanner | null) => void;
  fetchMemoryAssetUrl: (memoryId: string) => Promise<string>;
  refreshMemories: () => Promise<void>;
  resetPromptHistory: () => void;
  onClose: () => void;
  onSaved?: (result: CapsuleCustomizerSaveResult) => void;
};

type ComposeAssetResult = {
  blob: Blob;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const clampBias = (value: number) => clamp(value, -1, 1);

const MODE_ASPECT_RATIO: Record<CapsuleCustomizerMode, number> = {
  banner: 16 / 9,
  storeBanner: 16 / 9,
  tile: 9 / 16,
  logo: 1,
  avatar: 1,
};

const MODE_EXPORT_LIMITS: Record<
  CapsuleCustomizerMode,
  { maxWidth: number; maxHeight: number; aspectRatio: number }
> = {
  banner: { maxWidth: 1600, maxHeight: 900, aspectRatio: MODE_ASPECT_RATIO.banner },
  storeBanner: { maxWidth: 1600, maxHeight: 900, aspectRatio: MODE_ASPECT_RATIO.storeBanner },
  tile: { maxWidth: 1080, maxHeight: 1920, aspectRatio: MODE_ASPECT_RATIO.tile },
  logo: { maxWidth: 1024, maxHeight: 1024, aspectRatio: MODE_ASPECT_RATIO.logo },
  avatar: { maxWidth: 1024, maxHeight: 1024, aspectRatio: MODE_ASPECT_RATIO.avatar },
};

const getFileNamePrefix = (mode: CapsuleCustomizerMode, normalizedName: string) => {
  const safeSlug = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  if (mode === "avatar") return "profile";
  if (mode === "logo") return "capsule-logo";
  if (mode === "storeBanner") return "capsule-store";
  if (mode === "tile") return safeSlug || "capsule";
  return safeSlug || "capsule";
};

async function composeAssetImage({
  assetLabel,
  customizerMode,
  selectedBanner,
  fetchMemoryAssetUrl,
}: {
  assetLabel: string;
  customizerMode: CapsuleCustomizerMode;
  selectedBanner: SelectedBanner;
  fetchMemoryAssetUrl: (memoryId: string) => Promise<string>;
}): Promise<ComposeAssetResult> {
  if (selectedBanner.kind === "ai") {
    throw new Error(`Choose an image before saving your ${assetLabel}.`);
  }

  const crop = selectedBanner.crop ?? { offsetX: 0, offsetY: 0 };

  const candidateUrls: string[] = [];
  const revokeUrls: string[] = [];
  let allowCrossOrigin = true;

  if (selectedBanner.kind === "memory" && selectedBanner.id) {
    try {
      const proxiedUrl = await fetchMemoryAssetUrl(selectedBanner.id);
      if (proxiedUrl) {
        candidateUrls.push(proxiedUrl);
        revokeUrls.push(proxiedUrl);
      }
    } catch (error) {
      console.warn("memory proxy fetch failed", error);
    }
  }

  if (selectedBanner.kind === "upload" && selectedBanner.file instanceof File) {
    const objectUrl = URL.createObjectURL(selectedBanner.file);
    candidateUrls.push(objectUrl);
    revokeUrls.push(objectUrl);
    allowCrossOrigin = false;
  } else if (selectedBanner.kind === "memory") {
    if (selectedBanner.fullUrl) candidateUrls.push(selectedBanner.fullUrl);
    if (selectedBanner.url && selectedBanner.url !== selectedBanner.fullUrl) {
      candidateUrls.push(selectedBanner.url);
    }
  } else if (selectedBanner.url) {
    candidateUrls.push(selectedBanner.url);
  }

  if (!candidateUrls.length) {
    throw new Error(`No ${assetLabel} image available.`);
  }

  let img: HTMLImageElement | null = null;
  let lastError: unknown = null;

  for (const candidate of candidateUrls) {
    const isBlob =
      candidate.startsWith("blob:") || candidate.startsWith("data:") || candidate.startsWith("file:");
    try {
      img = await loadImageElement(candidate, {
        allowCrossOrigin: allowCrossOrigin && !isBlob,
        label: assetLabel,
      });
      break;
    } catch (error) {
      lastError = error;
      if (!isBlob) {
        try {
          const response = await fetch(candidate, { mode: "cors" });
          if (!response.ok) {
            throw new Error(`Image fetch failed with status ${response.status}`);
          }
          const fetchedBlob = await response.blob();
          const fetchedUrl = URL.createObjectURL(fetchedBlob);
          revokeUrls.push(fetchedUrl);
          img = await loadImageElement(fetchedUrl, { allowCrossOrigin: false, label: assetLabel });
          break;
        } catch (fetchError) {
          lastError = fetchError;
        }
      }
    }
  }

  if (!img) {
    revokeUrls.forEach((url) => URL.revokeObjectURL(url));
    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to load image for ${assetLabel.toLowerCase()} preview.`);
  }

  if (revokeUrls.length) {
    queueMicrotask(() => {
      revokeUrls.forEach((url) => URL.revokeObjectURL(url));
    });
  }

  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;
  if (!naturalWidth || !naturalHeight) {
    throw new Error("Unable to read image dimensions.");
  }

  const { maxWidth, maxHeight, aspectRatio } = MODE_EXPORT_LIMITS[customizerMode];

  let targetWidth = Math.min(maxWidth, naturalWidth);
  let targetHeight = Math.round(targetWidth / aspectRatio);
  if (targetHeight > naturalHeight) {
    targetHeight = Math.min(maxHeight, naturalHeight);
    targetWidth = Math.round(targetHeight * aspectRatio);
  }
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    targetWidth = maxWidth;
  }
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    targetHeight = maxHeight;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(targetHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to prepare drawing context.");
  }

  const scale = Math.max(canvas.width / naturalWidth, canvas.height / naturalHeight);
  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;
  const maxOffsetX = Math.max(0, scaledWidth - canvas.width);
  const maxOffsetY = Math.max(0, scaledHeight - canvas.height);

  const offsetX = clamp(
    Math.round(maxOffsetX / 2 - (maxOffsetX / 2) * clampBias(crop.offsetX)),
    0,
    maxOffsetX,
  );
  const offsetY = clamp(
    Math.round(maxOffsetY / 2 - (maxOffsetY / 2) * clampBias(crop.offsetY)),
    0,
    maxOffsetY,
  );

  ctx.drawImage(
    img,
    offsetX,
    offsetY,
    canvas.width / scale,
    canvas.height / scale,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const targetMime: ComposeAssetResult["mimeType"] =
    customizerMode === "logo" || customizerMode === "avatar" ? "image/png" : "image/jpeg";

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("Failed to prepare asset export."));
    }, targetMime);
  });

  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    mimeType: targetMime,
  };
}

export function useCapsuleCustomizerSave({
  assetLabel,
  capsuleId,
  customizerMode,
  normalizedName,
  open,
  selectedBanner,
  updateSelectedBanner,
  fetchMemoryAssetUrl,
  refreshMemories,
  resetPromptHistory,
  onClose,
  onSaved,
}: UseCustomizerSaveOptions) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadObjectUrlRef = React.useRef<string | null>(null);
  const [savePending, setSavePending] = React.useState(false);
  const [saveError, setSaveErrorState] = React.useState<string | null>(null);

  const setSaveError = React.useCallback((message: string | null) => {
    setSaveErrorState(message);
  }, []);

  const clearSaveError = React.useCallback(() => {
    setSaveErrorState(null);
  }, []);

  const revokeUploadObjectUrl = React.useCallback(() => {
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = null;
    }
  }, []);

  const clearUploadArtifacts = React.useCallback(() => {
    revokeUploadObjectUrl();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [revokeUploadObjectUrl]);

  React.useEffect(() => {
    if (!open) return;
    revokeUploadObjectUrl();
  }, [open, revokeUploadObjectUrl]);

  React.useEffect(() => {
    return () => {
      revokeUploadObjectUrl();
    };
  }, [revokeUploadObjectUrl]);

  const handleUploadClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      revokeUploadObjectUrl();

      const objectUrl = URL.createObjectURL(file);
      uploadObjectUrlRef.current = objectUrl;
      updateSelectedBanner({
        kind: "upload",
        name: file.name,
        url: objectUrl,
        file,
        crop: { offsetX: 0, offsetY: 0 },
      });
      resetPromptHistory();
      clearSaveError();
      event.target.value = "";
    },
    [clearSaveError, resetPromptHistory, revokeUploadObjectUrl, updateSelectedBanner],
  );

  const handleSaveAsset = React.useCallback(async () => {
    if (customizerMode !== "avatar" && !capsuleId) {
      setSaveError("Capsule not ready. Please refresh and try again.");
      return;
    }
    if (!selectedBanner) {
      setSaveError(`Choose an image before saving your ${assetLabel}.`);
      return;
    }

    const aiPrompt = selectedBanner.kind === "ai" ? selectedBanner.prompt : null;
    if (selectedBanner.kind === "ai") {
      setSaveError(`Choose an image before saving your ${assetLabel}.`);
      return;
    }

    setSavePending(true);
    setSaveError(null);

    try {
      const exportResult = await composeAssetImage({
        assetLabel,
        customizerMode,
        selectedBanner,
        fetchMemoryAssetUrl,
      });

      const fileNamePrefix = getFileNamePrefix(customizerMode, normalizedName);
      const extension = exportResult.mimeType === "image/png" ? "png" : "jpg";
      const fileName = `${fileNamePrefix}-${customizerMode}-${Date.now()}.${extension}`;
      const bannerFile = new File([exportResult.blob], fileName, { type: exportResult.mimeType });
      const imageData = await blobToBase64(exportResult.blob);

      const endpoint =
        customizerMode === "tile"
          ? `/api/capsules/${capsuleId}/tile`
          : customizerMode === "logo"
            ? `/api/capsules/${capsuleId}/logo`
            : customizerMode === "avatar"
              ? "/api/account/avatar"
              : customizerMode === "storeBanner"
                ? `/api/capsules/${capsuleId}/store-banner`
                : `/api/capsules/${capsuleId}/banner`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData,
          filename: bannerFile.name,
          mimeType: bannerFile.type,
          crop: selectedBanner.crop ?? { offsetX: 0, offsetY: 0 },
          source: selectedBanner.kind,
          originalUrl:
            selectedBanner.kind === "memory"
              ? selectedBanner.fullUrl ?? selectedBanner.url
              : null,
          originalName:
            selectedBanner.kind === "upload"
              ? selectedBanner.name
              : selectedBanner.kind === "memory"
                ? selectedBanner.title ?? null
                : null,
          prompt: aiPrompt,
          memoryId: selectedBanner.kind === "memory" ? selectedBanner.id : null,
          width: exportResult.width,
          height: exportResult.height,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `Failed to save ${assetLabel}.`);
      }

      const payload = (await response.json()) as {
        bannerUrl?: string | null;
        storeBannerUrl?: string | null;
        tileUrl?: string | null;
        logoUrl?: string | null;
        avatarUrl?: string | null;
      };

      if (customizerMode === "tile") {
        onSaved?.({ type: "tile", tileUrl: payload.tileUrl ?? null });
      } else if (customizerMode === "logo") {
        onSaved?.({ type: "logo", logoUrl: payload.logoUrl ?? null });
      } else if (customizerMode === "avatar") {
        const nextAvatarUrl = payload.avatarUrl ?? null;
        onSaved?.({ type: "avatar", avatarUrl: nextAvatarUrl });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("capsules:avatar-updated", {
              detail: { avatarUrl: nextAvatarUrl },
            }),
          );
        }
      } else if (customizerMode === "storeBanner") {
        onSaved?.({ type: "storeBanner", storeBannerUrl: payload.storeBannerUrl ?? null });
      } else {
        const nextBannerUrl = payload.bannerUrl ?? null;
        onSaved?.({ type: "banner", bannerUrl: nextBannerUrl });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("capsule:banner-updated", {
              detail: { capsuleId: capsuleId ?? null, bannerUrl: nextBannerUrl },
            }),
          );
        }
      }

      await refreshMemories().catch(() => {});
      updateSelectedBanner(null);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : `Failed to save ${assetLabel}.`);
    } finally {
      setSavePending(false);
    }
  }, [
    assetLabel,
    capsuleId,
    customizerMode,
    fetchMemoryAssetUrl,
    normalizedName,
    onClose,
    onSaved,
    refreshMemories,
    selectedBanner,
    setSaveError,
    updateSelectedBanner,
  ]);

  return {
    uploads: {
      onUploadClick: handleUploadClick,
      onFileChange: handleFileChange,
      fileInputRef,
    },
    save: {
      pending: savePending,
      error: saveError,
      onSave: handleSaveAsset,
    },
    setSaveError,
    clearSaveError,
    clearUploadArtifacts,
  } as const;
}
