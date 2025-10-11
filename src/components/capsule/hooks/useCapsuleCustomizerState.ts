
"use client";

import * as React from "react";

import type { PrompterAction } from "@/components/ai-prompter-stage";
import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";

export type CapsuleCustomizerMode = "banner" | "tile" | "logo";

export type CapsuleCustomizerSaveResult =
  | { type: "banner"; bannerUrl: string | null }
  | { type: "tile"; tileUrl: string | null }
  | { type: "logo"; logoUrl: string | null };

type ChatRole = "assistant" | "user";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type BannerCrop = {
  offsetX: number;
  offsetY: number;
};

export type SelectedBanner =
  | ({ kind: "upload"; name: string; url: string; file: File | null } & { crop: BannerCrop })
  | ({
      kind: "memory";
      id: string;
      title: string | null;
      url: string;
      fullUrl: string | null;
    } & { crop: BannerCrop })
  | { kind: "ai"; prompt: string };

type DragState = {
  pointerId: number;
  cleanup: () => void;
};

type PreviewMetrics = {
  overflowX: number;
  overflowY: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

const PROMPT_CHIP_MAP: Record<CapsuleCustomizerMode, readonly string[]> = {
  banner: ["Bold neon gradients", "Soft sunrise palette", "Minimal dark mode"] as const,
  tile: ["Hero launch tile", "Vibrant gradient tile", "Cyberpunk feature art"] as const,
  logo: ["Minimal monogram logo", "Gradient orb icon", "Playful mascot badge"] as const,
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function base64ToFile(base64: string, mimeType: string, filename: string): File | null {
  if (typeof atob !== "function") {
    console.warn("capsule banner: base64 decoding not supported in this environment");
    return null;
  }
  try {
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      buffer[index] = binary.charCodeAt(index);
    }
    return new File([buffer], filename, { type: mimeType });
  } catch (error) {
    console.warn("capsule banner: failed to decode base64 image", error);
    return null;
  }
}

function buildAssistantResponse({
  prompt,
  capsuleName,
  mode,
  serverMessage,
  asset,
}: {
  prompt: string;
  capsuleName: string;
  mode: "generate" | "edit";
  asset: CapsuleCustomizerMode;
  serverMessage?: string | null;
}): string {
  const cleanPrompt = prompt.trim();
  const displayPrompt = cleanPrompt.length ? cleanPrompt : "that idea";

  const assetLabel = asset === "tile" ? "promo tile" : asset === "logo" ? "logo" : "banner";
  const action =
    mode === "generate" ? `I generated a ${assetLabel}` : `I updated your existing ${assetLabel}`;
  const capsuleSegment = capsuleName.length ? ` for ${capsuleName}` : "";
  const suffix = serverMessage?.trim()?.length ? ` ${serverMessage.trim()}` : "";

  return `${action}${capsuleSegment} based on "${displayPrompt}".${suffix}`;
}

function describeSource(source: SelectedBanner | null, label: string): string {
  if (!source) {
    return `No ${label} selected yet. Upload an image, pick a memory, or describe one below.`;
  }
  if (source.kind === "upload") return `Uploaded - ${source.name}`;
  if (source.kind === "memory") return `Memory - ${source.title?.trim() || "Untitled memory"}`;
  return `AI prompt - "${source.prompt}"`;
}

export type UseCapsuleCustomizerOptions = {
  open?: boolean;
  capsuleId?: string | null;
  capsuleName?: string | null;
  onClose: () => void;
  onSaved?: (result: CapsuleCustomizerSaveResult) => void;
  mode?: CapsuleCustomizerMode;
};

export type CapsuleChatState = {
  messages: ChatMessage[];
  busy: boolean;
  prompterSession: number;
  onPrompterAction: (action: PrompterAction) => void;
  logRef: React.RefObject<HTMLDivElement | null>;
};

export type CapsuleMemoryState = {
  user: ReturnType<typeof useMemoryUploads>["user"];
  loading: boolean;
  error: string | null;
  processedMemories: DisplayMemoryUpload[];
  recentMemories: DisplayMemoryUpload[];
  isPickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  onSelectMemory: (memory: DisplayMemoryUpload) => void;
  onPickMemory: (memory: DisplayMemoryUpload) => void;
  onQuickPick: () => void;
  refresh: () => Promise<void>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
};

export type CapsulePreviewState = {
  selected: SelectedBanner | null;
  previewOffset: { x: number; y: number };
  previewDraggable: boolean;
  previewPannable: boolean;
  previewCanPan: boolean;
  isDragging: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onImageLoad: () => void;
};

export type CapsuleUploadState = {
  onUploadClick: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export type CapsuleSaveState = {
  pending: boolean;
  error: string | null;
  onSave: () => Promise<void>;
};

export type UseCapsuleCustomizerStateReturn = {
  open: boolean;
  mode: CapsuleCustomizerMode;
  promptChips: readonly string[];
  assetLabel: string;
  headerTitle: string;
  headerSubtitle: string;
  prompterPlaceholder: string;
  stageAriaLabel: string;
  footerDefaultHint: string;
  recentDescription: string;
  previewAlt: string;
  normalizedName: string;
  chat: CapsuleChatState;
  memory: CapsuleMemoryState;
  preview: CapsulePreviewState;
  uploads: CapsuleUploadState;
  save: CapsuleSaveState;
  handleClose: () => void;
  overlayClick: React.MouseEventHandler<HTMLDivElement>;
  describeSelection: (selection: SelectedBanner | null) => string;
};

export function useCapsuleCustomizerState(
  options: UseCapsuleCustomizerOptions,
): UseCapsuleCustomizerStateReturn {
  const { open = false, capsuleId, capsuleName, onClose, onSaved, mode = "banner" } = options;

  const normalizedName = React.useMemo(() => {
    const trimmed = capsuleName?.trim();
    if (!trimmed) return "Your capsule";
    return trimmed.length > 48 ? `${trimmed.slice(0, 47)}...` : trimmed;
  }, [capsuleName]);

  const customizerMode: CapsuleCustomizerMode = mode ?? "banner";

  const {
    assetLabel,
    previewAlt,
    headerTitle,
    headerSubtitle,
    prompterPlaceholder,
    aiWorkingMessage,
    assistantIntro,
    footerDefaultHint,
    stageAriaLabel,
    recentDescription,
    promptChips,
  } = React.useMemo(() => {
    const safeName = normalizedName;
    if (customizerMode === "tile") {
      return {
        assetLabel: "tile" as const,
        previewAlt: "Preview of your Capsule promo tile",
        headerTitle: "Design your Capsule promo tile",
        headerSubtitle:
          "Chat with Capsule AI, pick from memories, or upload brand visuals to set your vertical tile.",
        prompterPlaceholder: "Describe your tile or a vibe to try...",
        aiWorkingMessage: "Let me work on a tile that matches that vibe...",
        assistantIntro: `Hi! I'm here to help you design a promo tile for ${safeName}. Describe the mood, colors, or imagery you'd like and I'll generate options.`,
        footerDefaultHint: "Upload an image, pick a memory, or describe a new tile below.",
        stageAriaLabel: "Capsule promo tile preview",
        recentDescription: "Quickly reuse the vertical art you or Capsule AI picked last.",
        promptChips: PROMPT_CHIP_MAP.tile,
      };
    }
    if (customizerMode === "logo") {
      return {
        assetLabel: "logo" as const,
        previewAlt: "Preview of your Capsule logo",
        headerTitle: "Design your Capsule logo",
        headerSubtitle:
          "Upload a mark, pick a memory, or ask Capsule AI for a square logo that feels on brand everywhere it appears.",
        prompterPlaceholder: "Describe your logo idea or style...",
        aiWorkingMessage: "Let me sketch a logo that matches that vibe...",
        assistantIntro: `Hi! I'm here to help you craft a capsule logo for ${safeName}. Describe letters, shapes, colors, or mascots and I'll mock up options.`,
        footerDefaultHint: "Upload a mark, pick a memory, or describe a logo below.",
        stageAriaLabel: "Capsule logo preview",
        recentDescription: "Reuse logo artwork you or Capsule AI created recently.",
        promptChips: PROMPT_CHIP_MAP.logo,
      };
    }
    return {
      assetLabel: "banner" as const,
      previewAlt: "Preview of your Capsule banner",
      headerTitle: "Design your Capsule banner",
      headerSubtitle:
        "Chat with Capsule AI, pick from memories, or upload brand visuals to set your capsule banner.",
      prompterPlaceholder: "Describe your banner or a vibe to try...",
      aiWorkingMessage: "Let me work on a banner that matches that vibe...",
      assistantIntro: `Hi! I'm here to help you design a capsule banner for ${safeName}. Describe the mood, colors, or imagery you'd like and I'll generate options.`,
      footerDefaultHint: "Upload an image, pick a memory, or describe a new banner below.",
      stageAriaLabel: "Capsule banner preview",
      recentDescription: "Quickly reuse what you or Capsule AI picked last.",
      promptChips: PROMPT_CHIP_MAP.banner,
    };
  }, [customizerMode, normalizedName]);

  const { user, envelope, items, loading, error, refresh } = useMemoryUploads("upload");
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

  const [messages, setMessages] = React.useState<ChatMessage[]>(() => [
    {
      id: randomId(),
      role: "assistant",
      content: assistantIntro,
    },
  ]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [selectedBanner, setSelectedBanner] = React.useState<SelectedBanner | null>(null);
  const selectedBannerRef = React.useRef<SelectedBanner | null>(null);
  const previewOffsetRef = React.useRef({ x: 0, y: 0 });
  const [previewOffset, setPreviewOffset] = React.useState(previewOffsetRef.current);
  const [isDraggingPreview, setIsDraggingPreview] = React.useState(false);
  const [previewCanPan, setPreviewCanPan] = React.useState(false);
  const [prompterSession, setPrompterSession] = React.useState(0);
  const [memoryPickerOpen, setMemoryPickerOpen] = React.useState(false);
  const chatLogRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const memoryButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const uploadObjectUrlRef = React.useRef<string | null>(null);
  const previewStageRef = React.useRef<HTMLDivElement | null>(null);
  const previewImageRef = React.useRef<HTMLImageElement | null>(null);
  const previewMetricsRef = React.useRef<PreviewMetrics>({
    overflowX: 0,
    overflowY: 0,
    maxOffsetX: 0,
    maxOffsetY: 0,
  });
  const dragStateRef = React.useRef<DragState | null>(null);
  const [savePending, setSavePending] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const previewDraggable =
    selectedBanner?.kind === "upload" || selectedBanner?.kind === "memory";
  const previewPannable = previewDraggable && previewCanPan;
  const activeImageUrl = previewDraggable ? selectedBanner?.url ?? null : null;

  React.useEffect(() => {
    selectedBannerRef.current = selectedBanner;
  }, [selectedBanner]);

  const readFileAsDataUrl = React.useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file as data URL."));
        }
      };
      reader.onerror = () => {
        reject(new Error("Failed to read file as data URL."));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const convertUrlToDataUrl = React.useCallback(
    async (url: string): Promise<string> => {
      const init: RequestInit = url.startsWith("blob:") ? {} : { credentials: "include" };
      const response = await fetch(url, init);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${assetLabel} image for editing.`);
      }
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error(`Failed to read ${assetLabel} image.`));
          }
        };
        reader.onerror = () => reject(new Error(`Failed to read ${assetLabel} image.`));
        reader.readAsDataURL(blob);
      });
    },
    [assetLabel],
  );

  const applyPreviewOffset = React.useCallback(
    (nextX: number, nextY: number, metricsOverride?: PreviewMetrics) => {
      const metrics = metricsOverride ?? previewMetricsRef.current;
      const { maxOffsetX, maxOffsetY } = metrics;
      const clampedX = maxOffsetX ? clamp(nextX, -maxOffsetX, maxOffsetX) : 0;
      const clampedY = maxOffsetY ? clamp(nextY, -maxOffsetY, maxOffsetY) : 0;
      const nextOffset = { x: clampedX, y: clampedY };

      const hasOffsetChanged =
        previewOffsetRef.current.x !== nextOffset.x || previewOffsetRef.current.y !== nextOffset.y;

      previewOffsetRef.current = nextOffset;

      setPreviewOffset((prev) => {
        if (!hasOffsetChanged) {
          return prev;
        }
        return nextOffset;
      });

      const normalizedX = maxOffsetX ? nextOffset.x / maxOffsetX : 0;
      const normalizedY = maxOffsetY ? nextOffset.y / maxOffsetY : 0;

      setSelectedBanner((prev) => {
        if (!prev || prev.kind === "ai") return prev;
        const existingCrop = prev.crop ?? { offsetX: 0, offsetY: 0 };
        if (existingCrop.offsetX === normalizedX && existingCrop.offsetY === normalizedY) {
          return prev;
        }
        return { ...prev, crop: { offsetX: normalizedX, offsetY: normalizedY } };
      });
    },
    [setPreviewOffset],
  );

  const updateSelectedBanner = React.useCallback(
    (banner: SelectedBanner | null) => {
      if (dragStateRef.current) {
        dragStateRef.current.cleanup();
      }
      setIsDraggingPreview(false);
      setPreviewCanPan(false);
      setSaveError(null);
      previewMetricsRef.current = {
        overflowX: 0,
        overflowY: 0,
        maxOffsetX: 0,
        maxOffsetY: 0,
      };

      const normalizedBanner =
        banner && banner.kind !== "ai"
          ? { ...banner, crop: banner.crop ?? { offsetX: 0, offsetY: 0 } }
          : banner;

      setSelectedBanner(normalizedBanner);
      applyPreviewOffset(0, 0, previewMetricsRef.current);
    },
    [applyPreviewOffset],
  );

  const measurePreview = React.useCallback(() => {
    const container = previewStageRef.current;
    const image = previewImageRef.current;
    if (!container || !image) return;

    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height || !imageRect.width || !imageRect.height) {
      return;
    }

    const overflowX = Math.max(0, imageRect.width - containerRect.width);
    const overflowY = Math.max(0, imageRect.height - containerRect.height);
    const metrics: PreviewMetrics = {
      overflowX,
      overflowY,
      maxOffsetX: overflowX / 2,
      maxOffsetY: overflowY / 2,
    };

    previewMetricsRef.current = metrics;
    setPreviewCanPan(metrics.maxOffsetX > 0 || metrics.maxOffsetY > 0);
    applyPreviewOffset(previewOffsetRef.current.x, previewOffsetRef.current.y, metrics);
  }, [applyPreviewOffset]);

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

  React.useEffect(() => {
    if (!open) return;
    setMessages([
      {
        id: randomId(),
        role: "assistant",
        content: assistantIntro,
      },
    ]);
    setChatBusy(false);
    updateSelectedBanner(null);
    setPrompterSession((value) => value + 1);
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = null;
    }
  }, [assistantIntro, normalizedName, open, updateSelectedBanner]);

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
    return () => {
      dragStateRef.current?.cleanup();
    };
  }, []);

  React.useEffect(() => {
    if (!open && dragStateRef.current) {
      dragStateRef.current.cleanup();
    }
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    measurePreview();
  }, [measurePreview, open, activeImageUrl]);

  React.useEffect(() => {
    if (!open) return;
    const stage = previewStageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      measurePreview();
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, [measurePreview, open]);

  React.useEffect(() => {
    if (!open) return;
    const handleResize = () => {
      measurePreview();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measurePreview, open]);

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

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const node = chatLogRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, open]);

  React.useEffect(
    () => () => {
      if (uploadObjectUrlRef.current) {
        URL.revokeObjectURL(uploadObjectUrlRef.current);
        uploadObjectUrlRef.current = null;
      }
    },
    [],
  );

  const handleClose = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const handleUploadClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (uploadObjectUrlRef.current) {
        URL.revokeObjectURL(uploadObjectUrlRef.current);
        uploadObjectUrlRef.current = null;
      }

      const objectUrl = URL.createObjectURL(file);
      uploadObjectUrlRef.current = objectUrl;
      updateSelectedBanner({
        kind: "upload",
        name: file.name,
        url: objectUrl,
        file,
        crop: { offsetX: 0, offsetY: 0 },
      });
      event.target.value = "";
    },
    [updateSelectedBanner],
  );

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
            response.status === 404 ? "Memory image not available." : "Failed to fetch memory image.";
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

  const resolveBannerSourceForEdit = React.useCallback(
    async (banner: SelectedBanner | null): Promise<{ imageUrl?: string; imageData?: string } | null> => {
      if (!banner) return null;
      if (banner.kind === "memory") {
        try {
          const proxiedUrl = await fetchMemoryAssetUrl(banner.id);
          const dataUri = await convertUrlToDataUrl(proxiedUrl);
          URL.revokeObjectURL(proxiedUrl);
          return { imageData: dataUri };
        } catch (error) {
          console.warn("memory proxy fetch failed", error);
          const remote = banner.fullUrl ?? banner.url;
          if (remote && /^https?:\/\//i.test(remote)) return { imageUrl: remote };
          if (remote && remote.startsWith("data:")) return { imageData: remote };
        }
        return null;
      }
      if (banner.kind === "upload") {
        if (banner.file instanceof File) {
          const dataUri = await readFileAsDataUrl(banner.file);
          return { imageData: dataUri };
        }
        if (banner.url) {
          if (/^https?:\/\//i.test(banner.url)) return { imageUrl: banner.url };
          if (banner.url.startsWith("data:")) return { imageData: banner.url };
          if (banner.url.startsWith("blob:")) {
            const dataUri = await convertUrlToDataUrl(banner.url);
            return { imageData: dataUri };
          }
        }
      }
      return null;
    },
    [convertUrlToDataUrl, fetchMemoryAssetUrl, readFileAsDataUrl],
  );

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
    },
    [updateSelectedBanner],
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

  const handlePrompterAction = React.useCallback(
    (action: PrompterAction) => {
      if (chatBusy) return;

      const firstAttachment = action.attachments?.[0] ?? null;
      let attachmentBanner: SelectedBanner | null = null;
      if (firstAttachment?.url) {
        attachmentBanner = {
          kind: "upload",
          name: firstAttachment.name ?? "Uploaded image",
          url: firstAttachment.url,
          file: null,
          crop: { offsetX: 0, offsetY: 0 },
        };
      }

      const rawText =
        action.kind === "generate"
          ? action.text
          : action.kind === "style" ||
              action.kind === "post_ai" ||
              action.kind === "tool_logo" ||
              action.kind === "tool_poll" ||
              action.kind === "tool_image_edit"
            ? action.prompt
            : action.kind === "post_manual"
              ? action.content
              : "";
      const trimmed = rawText?.trim();
      if (!trimmed) {
        if (attachmentBanner) {
          updateSelectedBanner(attachmentBanner);
        }
        return;
      }

      const previousBanner = selectedBannerRef.current;
      if (attachmentBanner) {
        updateSelectedBanner(attachmentBanner);
        selectedBannerRef.current = attachmentBanner;
      }

      const userMessage: ChatMessage = { id: randomId(), role: "user", content: trimmed };
      const assistantId = randomId();
      setMessages((prev) => [
        ...prev,
        userMessage,
        {
          id: assistantId,
          role: "assistant",
          content: aiWorkingMessage,
        },
      ]);
      setChatBusy(true);
      setSaveError(null);
      updateSelectedBanner({ kind: "ai", prompt: trimmed });

      const bannerForEdit = attachmentBanner ?? previousBanner ?? null;

      const run = async () => {
        try {
          const source = await resolveBannerSourceForEdit(bannerForEdit);
          const aiMode: "generate" | "edit" = source ? "edit" : "generate";
          const body: Record<string, unknown> = {
            prompt: trimmed,
            capsuleName: normalizedName,
            mode: aiMode,
          };
          if (source?.imageUrl) body.imageUrl = source.imageUrl;
          if (source?.imageData) body.imageData = source.imageData;

          const aiEndpoint = customizerMode === "logo" ? "/api/ai/logo" : "/api/ai/banner";
          const response = await fetch(aiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          });

          const payload = (await response.json().catch(() => null)) as
            | { url?: string; message?: string | null; imageData?: string | null; mimeType?: string | null }
            | null;

          if (!response.ok || !payload?.url) {
            const message =
              (payload?.message && typeof payload.message === "string" && payload.message) ||
              "Failed to generate banner.";
            throw new Error(message);
          }

          const mimeType =
            payload?.mimeType && typeof payload.mimeType === "string" && payload.mimeType.trim().length
              ? payload.mimeType.trim()
              : "image/jpeg";
          const imageData =
            payload?.imageData && typeof payload.imageData === "string" && payload.imageData.length
              ? payload.imageData
              : null;

          let fileUrl = payload.url;
          let bannerFile: File | null = null;

          if (imageData) {
            const extension = mimeType.split("/")[1] ?? "jpg";
            const filename = `capsule-ai-banner-${Date.now()}.${extension.replace(/[^a-z0-9]+/gi, "") || "jpg"}`;
            bannerFile = base64ToFile(imageData, mimeType, filename);

            if (bannerFile) {
              if (uploadObjectUrlRef.current) {
                URL.revokeObjectURL(uploadObjectUrlRef.current);
                uploadObjectUrlRef.current = null;
              }
              const objectUrl = URL.createObjectURL(bannerFile);
              uploadObjectUrlRef.current = objectUrl;
              fileUrl = objectUrl;
            }
          }

          updateSelectedBanner({
            kind: "upload",
            name: `AI generated ${assetLabel}`,
            url: fileUrl,
            file: bannerFile,
            crop: { offsetX: 0, offsetY: 0 },
          });

          const serverMessage =
            payload?.message && typeof payload.message === "string"
              ? payload.message
              : null;
          const responseCopy = buildAssistantResponse({
            prompt: trimmed,
            capsuleName: normalizedName,
            mode: aiMode,
            asset: customizerMode,
            serverMessage,
          });

          setMessages((prev) =>
            prev.map((entry) =>
              entry.id === assistantId
                ? {
                    ...entry,
                    content: responseCopy,
                  }
                : entry,
            ),
          );
        } catch (error) {
          console.error("capsule banner ai error", error);
          const message = error instanceof Error ? error.message : "Failed to generate banner.";
          setSelectedBanner(bannerForEdit ?? null);
          setMessages((prev) =>
            prev.map((entry) =>
              entry.id === assistantId
                ? {
                    ...entry,
                    content: `I ran into an issue: ${message}`,
                  }
                : entry,
            ),
          );
          setSaveError(message);
        } finally {
          setChatBusy(false);
        }
      };

      void run();
    },
    [
      aiWorkingMessage,
      assetLabel,
      chatBusy,
      customizerMode,
      normalizedName,
      resolveBannerSourceForEdit,
      updateSelectedBanner,
    ],
  );

  const loadImageElement = React.useCallback(
    (src: string, allowCrossOrigin: boolean): Promise<HTMLImageElement> =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (allowCrossOrigin) {
          img.crossOrigin = "anonymous";
        }
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image for ${assetLabel} preview.`));
        img.src = src;
      }),
    [assetLabel],
  );

  const composeAssetImage = React.useCallback(async () => {
    if (!selectedBanner || selectedBanner.kind === "ai") {
      throw new Error(`Select an image to save as a ${assetLabel}.`);
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
      } catch (proxyError) {
        console.warn("memory proxy fetch failed", proxyError);
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
      const isBlob = candidate.startsWith("blob:") || candidate.startsWith("data:") || candidate.startsWith("file:");
      try {
        img = await loadImageElement(candidate, allowCrossOrigin && !isBlob);
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
            img = await loadImageElement(fetchedUrl, false);
            break;
          } catch (fetchError) {
            lastError = fetchError;
            continue;
          }
        }
      }
    }

    if (!img) {
      revokeUrls.forEach((url) => URL.revokeObjectURL(url));
      throw lastError instanceof Error ? lastError : new Error(`Failed to load image for ${assetLabel} preview.`);
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

    const { maxWidth, maxHeight, aspectRatio } =
      customizerMode === "tile"
        ? { maxWidth: 1080, maxHeight: 1920, aspectRatio: 9 / 16 }
        : customizerMode === "logo"
          ? { maxWidth: 1024, maxHeight: 1024, aspectRatio: 1 }
          : { maxWidth: 1600, maxHeight: 900, aspectRatio: 16 / 9 };

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
    const overflowX = Math.max(0, scaledWidth - canvas.width);
    const overflowY = Math.max(0, scaledHeight - canvas.height);
    const baseOffsetX = overflowX / 2;
    const baseOffsetY = overflowY / 2;
    const shiftX = (overflowX / 2) * (crop.offsetX ?? 0);
    const shiftY = (overflowY / 2) * (crop.offsetY ?? 0);
    const offsetX = Math.min(Math.max(baseOffsetX - shiftX, 0), overflowX);
    const offsetY = Math.min(Math.max(baseOffsetY - shiftY, 0), overflowY);

    const sourceWidth = canvas.width / scale;
    const sourceHeight = canvas.height / scale;
    const maxSourceX = Math.max(0, naturalWidth - sourceWidth);
    const maxSourceY = Math.max(0, naturalHeight - sourceHeight);
    const sourceX = Math.min(Math.max(0, offsetX / scale), maxSourceX);
    const sourceY = Math.min(Math.max(0, offsetY / scale), maxSourceY);

    ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      const quality = 0.92;
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Failed to export image."));
          }
        },
        "image/jpeg",
        quality,
      );
    });

    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      mimeType: "image/jpeg" as const,
    };
  }, [assetLabel, customizerMode, fetchMemoryAssetUrl, loadImageElement, selectedBanner]);

  const handleSaveAsset = React.useCallback(async () => {
    if (!capsuleId) {
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
      const exportResult = await composeAssetImage();
      const safeSlug = normalizedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
      const fileName = `${safeSlug || "capsule"}-${customizerMode}-${Date.now()}.jpg`;
      const bannerFile = new File([exportResult.blob], fileName, { type: exportResult.mimeType });

      const arrayBuffer = await exportResult.blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const imageData = btoa(binary);

      const endpoint =
        customizerMode === "tile" ? "tile" : customizerMode === "logo" ? "logo" : "banner";
      const response = await fetch(`/api/capsules/${capsuleId}/${endpoint}`, {
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
              : selectedBanner.kind === "upload"
                ? null
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
        tileUrl?: string | null;
        logoUrl?: string | null;
      };
      if (customizerMode === "tile") {
        onSaved?.({ type: "tile", tileUrl: payload.tileUrl ?? null });
      } else if (customizerMode === "logo") {
        onSaved?.({ type: "logo", logoUrl: payload.logoUrl ?? null });
      } else {
        onSaved?.({ type: "banner", bannerUrl: payload.bannerUrl ?? null });
      }
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
    composeAssetImage,
    customizerMode,
    normalizedName,
    onClose,
    onSaved,
    selectedBanner,
    updateSelectedBanner,
  ]);

  const handlePreviewPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!previewDraggable) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      measurePreview();
      const metrics = previewMetricsRef.current;
      if (!metrics || (metrics.maxOffsetX === 0 && metrics.maxOffsetY === 0)) {
        return;
      }

      if (dragStateRef.current) {
        dragStateRef.current.cleanup();
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const startOffset = { ...previewOffsetRef.current };

      const move = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        nativeEvent.preventDefault();
        const deltaX = nativeEvent.clientX - startX;
        const deltaY = nativeEvent.clientY - startY;
        applyPreviewOffset(startOffset.x + deltaX, startOffset.y + deltaY);
      };

      const finish = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        cleanup();
      };

      function cleanup() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        dragStateRef.current = null;
        setIsDraggingPreview(false);
      }

      dragStateRef.current = {
        pointerId,
        cleanup,
      };

      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);

      setIsDraggingPreview(true);
      event.preventDefault();
    },
    [applyPreviewOffset, measurePreview, previewDraggable],
  );

  const overlayClick = React.useCallback<React.MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (event.target === event.currentTarget) {
        handleClose();
      }
    },
    [handleClose],
  );

  const describeSelection = React.useCallback(
    (selection: SelectedBanner | null) => describeSource(selection, assetLabel),
    [assetLabel],
  );

  return {
    open,
    mode: customizerMode,
    promptChips,
    assetLabel,
    headerTitle,
    headerSubtitle,
    prompterPlaceholder,
    stageAriaLabel,
    footerDefaultHint,
    recentDescription,
    previewAlt,
    normalizedName,
    chat: {
      messages,
      busy: chatBusy,
      prompterSession,
      onPrompterAction: handlePrompterAction,
      logRef: chatLogRef,
    },
    memory: {
      user,
      loading,
      error,
      processedMemories,
      recentMemories,
      isPickerOpen: memoryPickerOpen,
      openPicker: openMemoryPicker,
      closePicker: closeMemoryPicker,
      onSelectMemory: handleMemorySelect,
      onPickMemory: handleMemoryPick,
      onQuickPick: handleQuickPick,
      refresh,
      buttonRef: memoryButtonRef,
    },
    preview: {
      selected: selectedBanner,
      previewOffset,
      previewDraggable,
      previewPannable,
      previewCanPan,
      isDragging: isDraggingPreview,
      stageRef: previewStageRef,
      imageRef: previewImageRef,
      onPointerDown: handlePreviewPointerDown,
      onImageLoad: measurePreview,
    },
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
    handleClose,
    overlayClick,
    describeSelection,
  };
}
