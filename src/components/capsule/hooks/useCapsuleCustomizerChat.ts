"use client";

import * as React from "react";

import type { PrompterAction } from "@/components/ai-prompter-stage";
import {
  bannerSourceKey,
  cloneSelectedBanner,
  isCroppableBanner,
  type BannerCrop,
  type CapsuleCustomizerMode,
  type ChatBannerOption,
  type ChatMessage,
  type CroppableBanner,
  type PromptHistorySnapshot,
  type SelectedBanner,
} from "./capsuleCustomizerTypes";

const MAX_PROMPT_REFINEMENTS = 4;
const ASPECT_TOLERANCE = 0.0025;

const MODE_ASPECT_RATIO: Record<CapsuleCustomizerMode, number> = {
  banner: 16 / 9,
  storeBanner: 5 / 2,
  tile: 9 / 16,
  logo: 1,
  avatar: 1,
};

const AI_CROP_BIAS: Record<CapsuleCustomizerMode, { x: number; y: number }> = {
  banner: { x: 0, y: -0.18 },
  storeBanner: { x: 0, y: -0.12 },
  tile: { x: 0, y: 0 },
  logo: { x: 0, y: 0 },
  avatar: { x: 0, y: 0 },
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const clampBias = (value: number) => clamp(value, -1, 1);

type UseCustomizerChatOptions = {
  aiWorkingMessage: string;
  assistantIntro: string;
  assetLabel: string;
  normalizedName: string;
  customizerMode: CapsuleCustomizerMode;
  updateSelectedBanner: (banner: SelectedBanner | null) => void;
  setSelectedBanner: React.Dispatch<React.SetStateAction<SelectedBanner | null>>;
  selectedBannerRef: React.MutableRefObject<SelectedBanner | null>;
  setSaveError: React.Dispatch<React.SetStateAction<string | null>>;
  fetchMemoryAssetUrl: (memoryId: string) => Promise<string>;
};

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

function ensureSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function sanitizeServerMessage(message?: string | null): string {
  if (!message) return "";
  const trimmed = message.trim();
  if (!trimmed.length) return "";
  const withoutThanks = trimmed.replace(/^\s*thanks[^.!?]*[.!?]\s*/i, "").trim();
  return withoutThanks;
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

  const assetLabel =
    asset === "tile"
      ? "promo tile"
      : asset === "logo"
        ? "logo"
        : asset === "avatar"
          ? "avatar"
            : asset === "storeBanner"
              ? "store banner"
              : "banner";
  const action =
    mode === "generate" ? `I generated a ${assetLabel}` : `I updated your existing ${assetLabel}`;
  const capsuleSegment = capsuleName.length ? ` for ${capsuleName}` : "";

  const intro = `${action}${capsuleSegment} inspired by "${displayPrompt}".`;
  const sanitizedDetail = sanitizeServerMessage(serverMessage);
  const detail = sanitizedDetail.length
    ? ensureSentence(sanitizedDetail)
    : "The preview on the right shows how it came together.";
  const nextPrompt =
    mode === "generate"
      ? "What should we explore next—tweak this vibe, spin a remix, or try something totally different?"
      : "Want me to keep iterating on it or pivot to a fresh direction?";

  return `${intro} ${detail} ${nextPrompt}`;
}

export function useCapsuleCustomizerChat({
  aiWorkingMessage,
  assistantIntro,
  assetLabel,
  normalizedName,
  customizerMode,
  updateSelectedBanner,
  setSelectedBanner,
  selectedBannerRef,
  setSaveError,
  fetchMemoryAssetUrl,
}: UseCustomizerChatOptions) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(() => [
    { id: randomId(), role: "assistant", content: assistantIntro },
  ]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [prompterSession, setPrompterSession] = React.useState(0);
  const chatLogRef = React.useRef<HTMLDivElement | null>(null);

  const promptHistoryRef = React.useRef<PromptHistorySnapshot>({
    base: null,
    refinements: [],
    sourceKey: null,
  });

  const resetPromptHistory = React.useCallback(() => {
    promptHistoryRef.current = { base: null, refinements: [], sourceKey: null };
  }, []);

  const resetConversation = React.useCallback(
    (intro: string) => {
      setMessages([{ id: randomId(), role: "assistant", content: intro }]);
      setChatBusy(false);
      updateSelectedBanner(null);
      resetPromptHistory();
      setPrompterSession((value) => value + 1);
    },
    [resetPromptHistory, updateSelectedBanner],
  );

  const syncBannerCropToMessages = React.useCallback(
    (nextBanner: CroppableBanner) => {
      const sourceKey = bannerSourceKey(nextBanner);
      if (!sourceKey) return;

      setMessages((previousMessages) => {
        let didChange = false;

        const mapped = previousMessages.map((message) => {
          if (!message.bannerOptions?.length) return message;

          let optionsChanged = false;
          const nextOptions = message.bannerOptions.map((option) => {
            const optionSourceKey = bannerSourceKey(option.banner);
            if (optionSourceKey !== sourceKey) return option;
            if (!isCroppableBanner(option.banner)) return option;

            const existingCrop = option.banner.crop ?? { offsetX: 0, offsetY: 0 };
            if (
              existingCrop.offsetX === nextBanner.crop.offsetX &&
              existingCrop.offsetY === nextBanner.crop.offsetY
            ) {
              return option;
            }

            optionsChanged = true;
            return {
              ...option,
              banner: {
                ...option.banner,
                crop: { ...nextBanner.crop },
              },
            };
          });

          if (!optionsChanged) return message;
          didChange = true;
          return {
            ...message,
            bannerOptions: nextOptions,
          };
        });

        return didChange ? mapped : previousMessages;
      });
    },
    [],
  );

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
      reader.onerror = () => reject(new Error("Failed to read file as data URL."));
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

  const ensureAspectForGeneratedBanner = React.useCallback(
    async ({
      url,
      file,
      mimeType,
    }: {
      url: string;
      file: File | null;
      mimeType: string;
    }): Promise<{ url: string; file: File | null; crop: BannerCrop; updated: boolean }> => {
      const targetAspect = MODE_ASPECT_RATIO[customizerMode];
      if (!targetAspect || !url) {
        return {
          url,
          file,
          crop: { offsetX: 0, offsetY: AI_CROP_BIAS[customizerMode]?.y ?? 0 },
          updated: false,
        };
      }

      let sourceUrl = url;
      let revokeSourceUrl: string | null = null;
      let fetchedUrl: string | null = null;
      const allowCrossOrigin = !file;

      try {
        if (file) {
          sourceUrl = URL.createObjectURL(file);
          revokeSourceUrl = sourceUrl;
        }

        let image: HTMLImageElement;
        try {
          image = await loadImageElement(sourceUrl, allowCrossOrigin);
        } catch (error) {
          if (!allowCrossOrigin) {
            throw error;
          }
          const response = await fetch(url, { mode: "cors" });
          if (!response.ok) {
            throw error;
          }
          const blob = await response.blob();
          fetchedUrl = URL.createObjectURL(blob);
          image = await loadImageElement(fetchedUrl, false);
        }

        const naturalWidth = image.naturalWidth || image.width;
        const naturalHeight = image.naturalHeight || image.height;
        if (!naturalWidth || !naturalHeight) {
          throw new Error("Unable to measure generated image.");
        }

        const imageAspect = naturalWidth / naturalHeight;
        if (Math.abs(imageAspect - targetAspect) <= ASPECT_TOLERANCE) {
          return {
            url,
            file,
            crop: { offsetX: 0, offsetY: 0 },
            updated: false,
          };
        }

        let sourceWidth = naturalWidth;
        let sourceHeight = naturalHeight;
        let sourceX = 0;
        let sourceY = 0;
        const bias = AI_CROP_BIAS[customizerMode] ?? { x: 0, y: 0 };

        if (imageAspect > targetAspect) {
          sourceHeight = naturalHeight;
          sourceWidth = Math.round(sourceHeight * targetAspect);
          const maxOffsetX = Math.max(0, naturalWidth - sourceWidth);
          const offsetX = clamp(
            Math.round(maxOffsetX / 2 - (maxOffsetX / 2) * clampBias(bias.x)),
            0,
            maxOffsetX,
          );
          sourceX = offsetX;
        } else {
          sourceWidth = naturalWidth;
          sourceHeight = Math.round(sourceWidth / targetAspect);
          const maxOffsetY = Math.max(0, naturalHeight - sourceHeight);
          const offsetY = clamp(
            Math.round(maxOffsetY / 2 - (maxOffsetY / 2) * clampBias(bias.y)),
            0,
            maxOffsetY,
          );
          sourceY = offsetY;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth));
        canvas.height = Math.max(1, Math.round(sourceHeight));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Failed to prepare drawing context.");
        }

        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        );

        const blob = await new Promise<Blob>((resolve, reject) => {
          const quality = mimeType === "image/jpeg" ? 0.92 : undefined;
          canvas.toBlob(
            (result) => {
              if (result) {
                resolve(result);
              } else {
                reject(new Error("Failed to export image."));
              }
            },
            mimeType,
            quality,
          );
        });

        const finalFile =
          file && file.name
            ? new File([blob], file.name, { type: mimeType })
            : new File(
                [blob],
                `capsule-ai-${customizerMode}-${Date.now()}.${
                  (mimeType.split("/")[1] ?? "jpg").replace(/[^a-z0-9]+/gi, "") || "jpg"
                }`,
                { type: mimeType },
              );

        const dataUrl = await readFileAsDataUrl(finalFile);

        return {
          url: dataUrl,
          file: finalFile,
          crop: { offsetX: 0, offsetY: 0 },
          updated: true,
        };
      } catch (error) {
        console.warn("capsule banner aspect normalization failed", error);
        return {
          url,
          file,
          crop: { offsetX: 0, offsetY: AI_CROP_BIAS[customizerMode]?.y ?? 0 },
          updated: false,
        };
      } finally {
        if (revokeSourceUrl) {
          URL.revokeObjectURL(revokeSourceUrl);
        }
        if (fetchedUrl) {
          URL.revokeObjectURL(fetchedUrl);
        }
      }
    },
    [customizerMode, loadImageElement, readFileAsDataUrl],
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

  const handleBannerOptionSelect = React.useCallback(
    (option: ChatBannerOption) => {
      const candidate = cloneSelectedBanner(option.banner);
      promptHistoryRef.current = {
        base: option.promptState.base,
        refinements: [...option.promptState.refinements],
        sourceKey: option.promptState.sourceKey,
      };
      updateSelectedBanner(candidate);
      selectedBannerRef.current = candidate;
      setSaveError(null);
    },
    [selectedBannerRef, setSaveError, updateSelectedBanner],
  );

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
      const previousPromptHistory = {
        base: promptHistoryRef.current.base,
        refinements: [...promptHistoryRef.current.refinements],
        sourceKey: promptHistoryRef.current.sourceKey,
      };

      const run = async () => {
        try {
          const source = await resolveBannerSourceForEdit(bannerForEdit);
          const aiMode: "generate" | "edit" = source ? "edit" : "generate";
          const currentSourceKey = bannerSourceKey(bannerForEdit);
          let promptForRequest = trimmed;

          if (aiMode === "generate") {
            promptHistoryRef.current = {
              base: trimmed,
              refinements: [],
              sourceKey: null,
            };
          } else if (
            !promptHistoryRef.current.base ||
            !currentSourceKey ||
            promptHistoryRef.current.sourceKey !== currentSourceKey
          ) {
            promptHistoryRef.current = {
              base: trimmed,
              refinements: [],
              sourceKey: currentSourceKey,
            };
          } else {
            const nextRefinements = [...promptHistoryRef.current.refinements, trimmed];
            const boundedRefinements = nextRefinements.slice(-MAX_PROMPT_REFINEMENTS);
            const refinementsBeforeLatest =
              boundedRefinements.length > 1 ? boundedRefinements.slice(0, -1) : [];
            const latestRefinement =
              boundedRefinements[boundedRefinements.length - 1] ?? trimmed;
            promptForRequest = [
              promptHistoryRef.current.base,
              ...refinementsBeforeLatest,
              latestRefinement,
            ]
              .filter((part): part is string => Boolean(part && part.trim().length))
              .join("\n\n");
            promptHistoryRef.current = {
              base: promptHistoryRef.current.base,
              refinements: boundedRefinements,
              sourceKey: currentSourceKey,
            };
          }

          const body: Record<string, unknown> = {
            prompt: promptForRequest,
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

          const payload = (await response.json().catch(() => null)) as {
            url?: string;
            message?: string | null;
            imageData?: string | null;
            mimeType?: string | null;
          } | null;

          if (!response.ok || !payload?.url) {
            const message =
              (payload?.message && typeof payload.message === "string" && payload.message) ||
              "Failed to generate banner.";
            throw new Error(message);
          }

          const mimeType =
            payload?.mimeType &&
            typeof payload.mimeType === "string" &&
            payload.mimeType.trim().length
              ? payload.mimeType.trim()
              : "image/jpeg";
          const imageData =
            payload?.imageData && typeof payload.imageData === "string" && payload.imageData.length
              ? payload.imageData
              : null;

          const fileUrl = payload.url ?? (imageData ? `data:${mimeType};base64,${imageData}` : "");
          let bannerFile: File | null = null;

          if (imageData) {
            const extension = mimeType.split("/")[1] ?? "jpg";
            const filename = `capsule-ai-banner-${Date.now()}.${extension.replace(/[^a-z0-9]+/gi, "") || "jpg"}`;
            bannerFile = base64ToFile(imageData, mimeType, filename);
          }

          const normalizedAsset = await ensureAspectForGeneratedBanner({
            url: fileUrl,
            file: bannerFile,
            mimeType,
          });

          const generatedBanner: SelectedBanner = {
            kind: "upload",
            name: `AI generated ${assetLabel}`,
            url: normalizedAsset.url,
            file: normalizedAsset.file ?? bannerFile,
            crop: normalizedAsset.crop,
          };

          updateSelectedBanner(generatedBanner);
          promptHistoryRef.current.sourceKey = bannerSourceKey(generatedBanner);

          const serverMessage =
            payload?.message && typeof payload.message === "string" ? payload.message : null;
          const responseCopy = buildAssistantResponse({
            prompt: trimmed,
            capsuleName: normalizedName,
            mode: aiMode,
            asset: customizerMode,
            serverMessage,
          });

          const promptStateSnapshot: PromptHistorySnapshot = {
            base: promptHistoryRef.current.base,
            refinements: [...promptHistoryRef.current.refinements],
            sourceKey: promptHistoryRef.current.sourceKey,
          };

          const previewUrl = normalizedAsset.url || fileUrl;
          const bannerOption: ChatBannerOption = {
            id: randomId(),
            label: aiMode === "generate" ? "New banner concept" : "Remixed banner",
            previewUrl,
            banner: cloneSelectedBanner(generatedBanner),
            promptState: {
              base: promptStateSnapshot.base,
              refinements: [...promptStateSnapshot.refinements],
              sourceKey: promptStateSnapshot.sourceKey,
            },
          };

          setMessages((prev) =>
            prev.map((entry) =>
              entry.id === assistantId
                ? {
                    ...entry,
                    content: responseCopy,
                    bannerOptions: [bannerOption],
                  }
                : entry,
            ),
          );
        } catch (error) {
          console.error("capsule banner ai error", error);
          const message = error instanceof Error ? error.message : "Failed to generate banner.";
          promptHistoryRef.current = {
            base: previousPromptHistory.base,
            refinements: [...previousPromptHistory.refinements],
            sourceKey: previousPromptHistory.sourceKey,
          };
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
      ensureAspectForGeneratedBanner,
      normalizedName,
      resolveBannerSourceForEdit,
      selectedBannerRef,
      setSaveError,
      setSelectedBanner,
      updateSelectedBanner,
    ],
  );

  return {
    messages,
    chatBusy,
    prompterSession,
    chatLogRef,
    handlePrompterAction,
    handleBannerOptionSelect,
    resetPromptHistory,
    resetConversation,
    syncBannerCropToMessages,
  } as const;
}
