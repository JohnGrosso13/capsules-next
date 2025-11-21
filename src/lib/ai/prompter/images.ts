import { getR2SignedObjectUrl } from "@/adapters/storage/r2/provider";
import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import {
  generateStabilityImage,
  hasStabilityApiKey,
  type StabilityGenerateOptions,
} from "@/adapters/ai/stability/server";
import type { Buffer } from "node:buffer";

import { serverEnv } from "@/lib/env/server";
import { decodeBase64 } from "@/lib/base64";
import { indexMemory } from "@/server/memories/service";
import { ensureAccessibleMediaUrl } from "@/server/posts/media";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import {
  createAiImageRun,
  updateAiImageRun,
  type AiImageRunAttempt,
  type UpdateAiImageRunInput,
} from "@/server/ai/image-runs";
import { publishAiImageEvent } from "@/services/realtime/ai-images";
import { requireOpenAIKey } from "./core";

type ImageOptions = { quality?: string; size?: string };

type ImageParams = { size: string; quality: string };

function resolveImageParams(options: ImageOptions = {}): ImageParams {
  const envQuality = serverEnv.OPENAI_IMAGE_QUALITY ?? "standard";
  const envSize = serverEnv.OPENAI_IMAGE_SIZE ?? "1024x1024";
  const envSizeLow = serverEnv.OPENAI_IMAGE_SIZE_LOW ?? "512x512";
  const envSizeHigh = serverEnv.OPENAI_IMAGE_SIZE_HIGH ?? "1024x1024";

  const requestedQuality =
    typeof options.quality === "string" ? options.quality.trim().toLowerCase() : null;
  const requestedSize = typeof options.size === "string" ? options.size.trim().toLowerCase() : null;

  // Map quality presets directly to supported OpenAI sizes.
  // low -> 512, standard -> 1024, high -> 1024 (quality=hd)
  const quality =
    requestedQuality === "high"
      ? "hd"
      : requestedQuality === "low"
        ? "standard"
        : requestedQuality === "standard"
          ? "standard"
          : envQuality === "high"
            ? "hd"
            : "standard";

  const lowSize = envSizeLow && envSizeLow.length ? envSizeLow : "512x512";
  const highSize = envSizeHigh && envSizeHigh.length ? envSizeHigh : "1024x1024";
  const standardSize = envSize && envSize.length ? envSize : "1024x1024";

  const size = (() => {
    if (requestedSize && requestedSize.length) return requestedSize;
    if (requestedQuality === "low") return lowSize;
    if (requestedQuality === "high") return highSize;
    if (quality === "hd") return highSize;
    return standardSize;
  })();

  return { size, quality };
}

async function persistImageUrlIfNeeded(url: string, mode: "generate" | "edit" = "generate") {
  if (!url || !/^data:/i.test(url)) return url;
  try {
    const saved = await storeImageSrcToSupabase(url, mode);
    return saved?.url ?? url;
  } catch (error) {
    console.warn("persistImageUrlIfNeeded failed", error);
    return url;
  }
}

const DEFAULT_IMAGE_RETRY_DELAYS_MS = [0];

export type ImageGenerationResult = {
  url: string;
  runId: string | null;
  provider: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ImageRunExecutionContext = {
  ownerId?: string | null;
  capsuleId?: string | null;
  assetKind: string;
  mode: "generate" | "edit";
  userPrompt: string;
  resolvedPrompt: string;
  stylePreset?: string | null;
  options?: Record<string, unknown>;
  retryDelaysMs?: number[];
  provider?: string | null;
  candidateProviders?: ImageProviderId[] | null;
};

type OpenAiErrorDetails = {
  message: string;
  code: string | null;
  status: number | null;
  meta: Record<string, unknown> | null;
};

type RunAttemptOutcome = {
  status: "succeeded" | "failed";
  imageUrl?: string | null;
  responseMetadata?: Record<string, unknown> | null;
  error?: OpenAiErrorDetails;
  terminal: boolean;
};

type RunState = {
  id: string;
  ownerId: string | null;
  assetKind: string;
  mode: "generate" | "edit";
  provider: string | null;
  stylePreset: string | null;
  options: Record<string, unknown>;
  attempts: AiImageRunAttempt[];
  completed: boolean;
  completionPublished: boolean;
  recordAttemptStart(attempt: AiImageRunAttempt): Promise<void>;
  recordAttemptOutcome(attempt: AiImageRunAttempt, outcome: RunAttemptOutcome): Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function waitFor(ms: number): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


export function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });
  return result;
}

function extractOpenAiErrorDetails(error: unknown): OpenAiErrorDetails {
  const fallback: OpenAiErrorDetails = {
    message: "Image request failed",
    code: null,
    status: null,
    meta: null,
  };

  if (!error) return fallback;

  if (error instanceof Error) {
    const enriched = error as Error & {
      code?: string;
      status?: number;
      meta?: unknown;
    };
    const meta =
      enriched.meta && typeof enriched.meta === "object"
        ? { ...(enriched.meta as Record<string, unknown>) }
        : null;

    const openAiMeta =
      meta && typeof meta.error === "object" ? (meta.error as Record<string, unknown>) : null;

    return {
      message: enriched.message || fallback.message,
      code:
        typeof enriched.code === "string"
          ? enriched.code
          : typeof openAiMeta?.code === "string"
            ? (openAiMeta.code as string)
            : typeof openAiMeta?.type === "string"
              ? (openAiMeta.type as string)
              : null,
      status:
        typeof enriched.status === "number"
          ? enriched.status
          : typeof openAiMeta?.status === "number"
            ? (openAiMeta.status as number)
            : null,
      meta,
    };
  }

  if (typeof error === "string") {
    return { ...fallback, message: error };
  }

  return fallback;
}

export type ImageProviderErrorDetails = {
  status: number | null;
  code: string | null;
  message: string;
};

export function extractImageProviderError(error: unknown): ImageProviderErrorDetails | null {
  if (!error) return null;
  const baseMessage =
    error instanceof Error && typeof error.message === "string" ? error.message.trim() : "";
  const defaultMessage = baseMessage || "Image generation request failed.";
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? ((error as { status?: number }).status as number)
      : null;
  const meta = (error as { meta?: unknown })?.meta;

  const coerceMessage = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    return null;
  };

  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const record = meta as Record<string, unknown>;
    if (record.error && typeof record.error === "object") {
      const err = record.error as Record<string, unknown>;
      const message =
        coerceMessage(err.message) ?? coerceMessage(record.message) ?? defaultMessage;
      const code =
        typeof err.code === "string" && err.code.trim().length ? err.code.trim() : null;
      if (message) return { status, code, message };
    }
    if (Array.isArray(record.errors) && record.errors.length) {
      const first = record.errors[0] as Record<string, unknown>;
      const message =
        coerceMessage(first?.message) ?? coerceMessage(record.message) ?? defaultMessage;
      const codeCandidate =
        typeof first?.code === "string" && first.code.trim().length
          ? first.code.trim()
          : typeof record.name === "string" && record.name.trim().length
            ? record.name.trim()
            : null;
      if (message) {
        return { status, code: codeCandidate, message };
      }
    }
    const message = coerceMessage(record.message);
    if (message) {
      const code =
        typeof record.code === "string" && record.code.trim().length
          ? record.code.trim()
          : null;
      return { status, code, message };
    }
  }

  return { status, code: null, message: defaultMessage };
}

function shouldRetryError(details: OpenAiErrorDetails): boolean {
  if (details.status === 429) return true;
  if (typeof details.status === "number" && details.status >= 500) return true;
  const message = (details.message ?? "").toLowerCase();
  if (!details.status && /timeout|network|fetch|temporarily unavailable/.test(message)) {
    return true;
  }
  return false;
}

async function createRunState(
  context: ImageRunExecutionContext | undefined,
  resolvedOptions: Record<string, unknown>,
): Promise<RunState | null> {
  if (!context) return null;
  const combinedOptions = compactObject({
    ...(context.options ?? {}),
    ...resolvedOptions,
    candidateProviders:
      context.candidateProviders && context.candidateProviders.length
        ? context.candidateProviders
        : undefined,
  });

  try {
    const run = await createAiImageRun({
      ownerUserId: context.ownerId ?? null,
      capsuleId: context.capsuleId ?? null,
      mode: context.mode,
      assetKind: context.assetKind,
      userPrompt: context.userPrompt,
      resolvedPrompt: context.resolvedPrompt,
      stylePreset: context.stylePreset ?? null,
      provider: context.provider ?? null,
      options: combinedOptions,
    });

    await publishAiImageEvent(context.ownerId ?? null, {
      type: "ai.image.run.started",
      runId: run.id,
      assetKind: run.assetKind,
      mode: run.mode,
      userPrompt: run.userPrompt,
      resolvedPrompt: run.resolvedPrompt,
      stylePreset: run.stylePreset,
      options: run.options ?? {},
    });

    return {
      id: run.id,
      ownerId: context.ownerId ?? null,
      assetKind: run.assetKind,
      mode: run.mode,
      provider: run.provider ?? context.provider ?? "openai",
      stylePreset: run.stylePreset,
      options: run.options ?? {},
      attempts: [],
      completed: false,
      completionPublished: false,
      async recordAttemptStart(this: RunState, attempt: AiImageRunAttempt) {
        this.attempts.push(attempt);
        if (attempt.provider) {
          this.provider = attempt.provider;
        }
        const retryCount = Math.max(0, this.attempts.length - 1);
        try {
          await updateAiImageRun(this.id, {
            status: "running",
            model: attempt.model ?? null,
            provider: attempt.provider ?? this.provider ?? null,
            retryCount,
            attempts: this.attempts,
            options: this.options,
          });
        } catch (error) {
          console.error("AI image run update (start) failed", error);
        }
        await publishAiImageEvent(this.ownerId, {
          type: "ai.image.run.attempt",
          runId: this.id,
          attempt: attempt.attempt,
          model: attempt.model ?? null,
          provider: attempt.provider ?? this.provider ?? null,
          status: "started",
        });
      },
      async recordAttemptOutcome(
        this: RunState,
        attempt: AiImageRunAttempt,
        outcome: RunAttemptOutcome,
      ) {
        const retryCount = Math.max(0, this.attempts.length - 1);
        const patch: UpdateAiImageRunInput = {
          model: attempt.model ?? null,
          provider: attempt.provider ?? this.provider ?? null,
          retryCount,
          attempts: this.attempts,
          options: this.options,
        };

        if (outcome.status === "succeeded") {
          this.completed = true;
          patch.status = "succeeded";
          patch.imageUrl = outcome.imageUrl ?? null;
          patch.responseMetadata = outcome.responseMetadata ?? null;
          patch.errorCode = null;
          patch.errorMessage = null;
          patch.errorMeta = null;
          patch.completedAt = attempt.completedAt ?? nowIso();
        } else {
          patch.status = outcome.terminal ? "failed" : "running";
          patch.errorCode = outcome.error?.code ?? null;
          patch.errorMessage = outcome.error?.message ?? null;
          patch.errorMeta = outcome.error?.meta ?? null;
          if (outcome.terminal) {
            this.completed = true;
            patch.completedAt = attempt.completedAt ?? nowIso();
          }
        }

        try {
          await updateAiImageRun(this.id, patch);
        } catch (error) {
          console.error("AI image run update (outcome) failed", error);
        }

        await publishAiImageEvent(this.ownerId, {
          type: "ai.image.run.attempt",
            runId: this.id,
            attempt: attempt.attempt,
            model: attempt.model ?? null,
            provider: attempt.provider ?? this.provider ?? null,
            status: outcome.status === "succeeded" ? "succeeded" : "failed",
            errorCode: outcome.error?.code ?? null,
            errorMessage: outcome.error?.message ?? null,
          });

        if (this.completed && !this.completionPublished) {
          this.completionPublished = true;
          await publishAiImageEvent(this.ownerId, {
            type: "ai.image.run.completed",
            runId: this.id,
            status: outcome.status === "succeeded" ? "succeeded" : "failed",
            imageUrl: outcome.status === "succeeded" ? outcome.imageUrl ?? null : null,
            errorCode: outcome.error?.code ?? null,
            errorMessage: outcome.error?.message ?? null,
          });
        }
      },
    };
  } catch (error) {
    console.error("AI image run logging init failed", error);
    return null;
  }
}

function extractImageResponseMetadata(
  modelName: string,
  json: Record<string, unknown>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (typeof json.model === "string") {
    metadata.model = json.model;
  } else {
    metadata.model = modelName;
  }
  if (typeof json.created === "number") {
    metadata.created = json.created;
  }

  if (Array.isArray(json.data)) {
    const first = json.data.find(
      (entry) => entry && typeof entry === "object",
    ) as Record<string, unknown> | null;
    if (first) {
      if (typeof first.revised_prompt === "string") {
        metadata.revisedPrompt = first.revised_prompt;
      }
      if (typeof first.prompt === "string") {
        metadata.prompt = first.prompt;
      }
      metadata.hasUrl = typeof first.url === "string";
      metadata.hasBase64 = typeof first.b64_json === "string";
    }
    metadata.dataCount = json.data.length;
  }

  return metadata;
}
type ProviderAttemptCounter = { value: number };

type ProviderRuntimeParams = {
  prompt: string;
  params: ImageParams;
  delays: number[];
  runState: RunState | null;
  attemptCounter: ProviderAttemptCounter;
  context?: ImageRunExecutionContext;
};

function resolveProviderQueue(
  prompt: string,
  context: ImageRunExecutionContext | undefined,
): ImageProviderId[] {
  const queue: ImageProviderId[] = [];

  const normalizedProvider = (context?.provider ?? null)?.toLowerCase() as ImageProviderId | null;
  if (normalizedProvider && (normalizedProvider === "openai" || normalizedProvider === "stability")) {
    queue.push(normalizedProvider);
  }

  const style = context?.stylePreset ?? null;
  if (style) {
    const override = STYLE_PROVIDER_OVERRIDES[style];
    if (override && !queue.includes(override)) {
      queue.push(override);
    }
  }

  for (const hint of PROMPT_PROVIDER_HINTS) {
    if (hint.pattern.test(prompt) && !queue.includes(hint.provider)) {
      queue.push(hint.provider);
    }
  }

  if (Array.isArray(context?.candidateProviders)) {
    for (const candidate of context?.candidateProviders ?? []) {
      if ((candidate === "openai" || candidate === "stability") && !queue.includes(candidate)) {
        queue.push(candidate);
      }
    }
  }

  // Default ordering
  if (!queue.length) {
    queue.push("openai");
  }

  const available = queue.filter((provider) => {
    if (provider === "stability") return hasStabilityApiKey();
    if (provider === "openai") return hasOpenAIApiKey();
    return true;
  });

  return available.length ? available : (["openai"] as ImageProviderId[]);
}

function resolveInitialProvider(
  providers: ImageProviderId[],
  context?: ImageRunExecutionContext,
): string | null {
  if (context?.provider && providers.includes(context.provider as ImageProviderId)) {
    return context.provider;
  }
  return providers[0] ?? null;
}

type ProviderResult = {
  url: string;
  metadata?: Record<string, unknown> | null;
  provider: ImageProviderId;
};

type NodeBufferCtor = {
  from(input: ArrayBuffer | ArrayBufferView | string, encoding?: "base64"): Buffer;
};

function getNodeBufferCtor(): NodeBufferCtor | null {
  const globalWithBuffer = globalThis as unknown as { Buffer?: NodeBufferCtor };
  return typeof globalWithBuffer.Buffer === "function" ? globalWithBuffer.Buffer : null;
}

function toUint8ArrayView(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function redactUrlForLogs(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function resolveFetchableUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("No image URL provided");
  }
  const trimmed = rawUrl.trim();
  if (!trimmed.length) {
    throw new Error("No image URL provided");
  }
  if (/^(?:https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  const base = serverEnv.SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}

function extractR2ObjectKey(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, "http://localhost");
  } catch {
    return null;
  }
  const pathname = parsed.pathname;
  const proxyMatch = pathname.match(/\/api\/uploads\/r2\/object\/(.+)$/i);
  if (proxyMatch && proxyMatch[1]) {
    try {
      return decodeURIComponent(proxyMatch[1]);
    } catch {
      return proxyMatch[1];
    }
  }

  const bucket = serverEnv.R2_BUCKET?.trim().toLowerCase();
  const account = serverEnv.R2_ACCOUNT_ID?.trim().toLowerCase();
  const r2Base = serverEnv.R2_PUBLIC_BASE_URL;
  const hostname = parsed.hostname.toLowerCase();

  if (r2Base) {
    try {
      const baseHost = new URL(r2Base).hostname.toLowerCase();
      if (hostname === baseHost) {
        return pathname.replace(/^\/+/, "");
      }
    } catch {
      /* noop */
    }
  }

  if (bucket && account) {
    const suffix = ".r2.cloudflarestorage.com";
    const accountHost = `${account}${suffix}`;
    const bucketHost = `${bucket}.${accountHost}`;
    const normalizedPath = pathname.replace(/^\/+/, "");
    if (hostname === bucketHost) {
      return normalizedPath;
    }
    if (hostname === accountHost) {
      const parts = normalizedPath.split("/");
      if (parts.length > 1 && parts[0]?.toLowerCase() === bucket) {
        return parts.slice(1).join("/");
      }
    }
  }

  return null;
}

async function fetchImageBytesForEdit(imageUrl: string): Promise<Uint8Array> {
  const normalized = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!normalized) {
    throw new Error("No image URL provided");
  }

  if (/^data:/i.test(normalized)) {
    const match = normalized.match(/^data:([^;]+);base64,(.*)$/i);
    if (!match) {
      throw new Error("Invalid data URI");
    }
    const payload = match[2] ?? "";
    return decodeBase64(payload);
  }

  let accessibleUrl = normalized;
  try {
    accessibleUrl = (await ensureAccessibleMediaUrl(normalized)) ?? normalized;
  } catch (error) {
    console.warn("editImageWithInstruction accessible url resolution failed", error);
  }
  if (/^data:/i.test(accessibleUrl)) {
    const match = accessibleUrl.match(/^data:([^;]+);base64,(.*)$/i);
    if (!match) {
      throw new Error("Invalid data URI");
    }
    const payload = match[2] ?? "";
    return decodeBase64(payload);
  }

  const candidates: string[] = [];
  const r2Key = extractR2ObjectKey(accessibleUrl) ?? extractR2ObjectKey(normalized);
  if (r2Key) {
    try {
      const signed = await getR2SignedObjectUrl(r2Key);
      candidates.push(signed);
    } catch (error) {
      console.warn("editImageWithInstruction R2 signed URL fetch failed", error);
    }
  }

  for (const candidate of [accessibleUrl, normalized]) {
    try {
      const resolved = resolveFetchableUrl(candidate);
      candidates.push(resolved);
    } catch {
      /* ignore bad candidates */
    }
  }

  const attempts = Array.from(new Set(candidates));
  const failures: Array<{ url: string; error: unknown }> = [];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt, { cache: "no-store" });
      if (!response.ok) {
        const statusError = new Error(
          `Failed to fetch source image (${response.status})`,
        ) as Error & { status?: number };
        statusError.status = response.status;
        throw statusError;
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      failures.push({ url: attempt, error });
      console.warn("editImageWithInstruction image fetch attempt failed", {
        url: redactUrlForLogs(attempt),
        error,
      });
    }
  }

  const lastError = failures[failures.length - 1]?.error;
  const message =
    failures.length > 0
      ? `Failed to fetch source image after ${failures.length} attempt(s)`
      : "Failed to fetch source image.";
  if (lastError instanceof Error) {
    lastError.message = `${message}: ${lastError.message}`;
    throw lastError;
  }
  throw new Error(message);
}

// OpenAI Images API supported sizes as of 2025-11:
// - gpt-image-* and dall-e-3: 1024x1024, 1024x1792, 1792x1024
// - dall-e-2: 256x256, 512x512, 1024x1024
// 768x768 is NOT accepted by current OpenAI image models and will 400.
const OPENAI_ALLOWED_SIZES = [
  "256x256",
  "512x512",
  "1024x1024",
  "1024x1792",
  "1792x1024",
] as const;
type OpenAiAllowedSize = (typeof OPENAI_ALLOWED_SIZES)[number];
type NormalizedImageQuality = "standard" | "hd";

function allowedSizesForOpenAiModel(modelName: string | null | undefined): OpenAiAllowedSize[] {
  const name = (modelName ?? "").toLowerCase();
  if (/^gpt-image/.test(name) || /^dall-e-3/.test(name)) {
    // gpt-image-* and dall-e-3 only accept the modern aspect ratios.
    return ["1024x1024", "1024x1792", "1792x1024"];
  }
  if (/^dall-e-2/.test(name)) {
    // Legacy model still supports the smaller square sizes.
    return ["256x256", "512x512", "1024x1024"];
  }
  // Default (should not be reached for OpenAI provider) - stay conservative
  return ["256x256", "512x512", "1024x1024"];
}

function coerceOpenAiSizeForModel(
  requested: OpenAiAllowedSize,
  modelName: string | null | undefined,
): OpenAiAllowedSize {
  const allowed = allowedSizesForOpenAiModel(modelName);
  if (allowed.includes(requested)) return requested;
  // Prefer the largest available size so we don't downgrade unnecessarily.
  if (allowed.includes("1024x1024")) return "1024x1024";
  return (allowed.find(Boolean) as OpenAiAllowedSize) ?? "1024x1024";
}

export function normalizeOpenAiImageSize(requested: string | null | undefined): OpenAiAllowedSize {
  if (typeof requested === "string" && requested.trim().length) {
    const normalized = requested.trim().toLowerCase();
    if (OPENAI_ALLOWED_SIZES.includes(normalized as OpenAiAllowedSize)) {
      return normalized as OpenAiAllowedSize;
    }
    const match = normalized.match(/^(\d+)\s*x\s*(\d+)$/);
    if (match) {
      const widthRaw = match[1];
      const heightRaw = match[2];
      const width = widthRaw ? Number.parseInt(widthRaw, 10) : NaN;
      const height = heightRaw ? Number.parseInt(heightRaw, 10) : NaN;
      const largest =
        Number.isFinite(width) && Number.isFinite(height) ? Math.max(width, height) : width || height;
      if (largest && largest <= 256) return "256x256";
      if (largest && largest <= 512) return "512x512";
      // 768 is not supported by OpenAI; round up to 1024 for anything larger than 512
      return "1024x1024";
    }
  }
  return "1024x1024";
}

function mapOpenAiImageQuality(modelName: string, quality: NormalizedImageQuality): string | null {
  const normalizedModel = modelName.toLowerCase();
  // Only gpt-image-* models support the quality parameter.
  if (normalizedModel.startsWith("gpt-image")) {
    return quality === "hd" ? "high" : null; // omit for standard to avoid API quirks
  }
  return null; // omit for legacy models like dall-e-2
}

export async function storeComposerImageMemory(params: {
  ownerId?: string | null | undefined;
  mediaUrl?: string | null | undefined;
  prompt?: string | null | undefined;
  previousMemoryId?: string | null | undefined;
}): Promise<string | null> {
  const { ownerId, mediaUrl, prompt, previousMemoryId } = params;
  if (!ownerId || !mediaUrl) return null;

  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  const title = trimmedPrompt ? trimmedPrompt.slice(0, 80) : "AI image";
  const description = trimmedPrompt || "AI generated image";

  const meta: Record<string, unknown> = {
    source: "ai-composer",
    category: "ai_image_generation",
  };
  if (trimmedPrompt) {
    meta.prompt = trimmedPrompt;
    meta.original_prompt = trimmedPrompt;
  }
  if (previousMemoryId) {
    meta.version_of = previousMemoryId;
  }

  try {
    return await indexMemory({
      ownerId,
      kind: "upload",
      mediaUrl,
      mediaType: "image",
      title,
      description,
      postId: null,
      metadata: meta,
      rawText: trimmedPrompt || null,
      source: "ai-composer",
      tags: ["ai", "composer", "image_generation", "composer_image"],
    });
  } catch (error) {
    console.warn("composer image memory store failed", error);
    return null;
  }
}

async function generateWithOpenAI(runtime: ProviderRuntimeParams): Promise<ProviderResult> {
  requireOpenAIKey();

  const baseModel = serverEnv.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const miniModel = serverEnv.OPENAI_IMAGE_MODEL_MINI || "gpt-image-1-mini";
  const preferMini = runtime.params.quality !== "hd";
  const orderedModels = preferMini ? [miniModel, baseModel, "gpt-image-1"] : [baseModel, miniModel, "gpt-image-1"];
  const candidateModels = Array.from(
    new Set(orderedModels.filter((model): model is string => typeof model === "string" && model.length > 0)),
  );

  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex++) {
    const modelName = candidateModels[modelIndex];
    if (!modelName) continue;

    for (let retryIndex = 0; retryIndex < runtime.delays.length; retryIndex++) {
      const delay = runtime.delays[retryIndex] ?? 0;
      if (runtime.attemptCounter.value > 0 && delay > 0) {
        await waitFor(delay);
      }

      runtime.attemptCounter.value += 1;
      const attemptRecord: AiImageRunAttempt = {
        attempt: runtime.attemptCounter.value,
        model: modelName,
        provider: "openai",
        startedAt: nowIso(),
      };

      if (runtime.runState) {
        await runtime.runState.recordAttemptStart(attemptRecord);
      }

      try {
        const normalizedSize = normalizeOpenAiImageSize(runtime.params.size);
        const normalizedQuality: NormalizedImageQuality =
          runtime.params.quality === "hd" ? "hd" : "standard";
        const requestedSize: OpenAiAllowedSize =
          normalizedQuality === "hd" ? ("1024x1024" as OpenAiAllowedSize) : normalizedSize;
        const effectiveSize = coerceOpenAiSizeForModel(requestedSize, modelName);

        const body: {
          model: string;
          prompt: string;
          n: number;
          size: OpenAiAllowedSize;
          quality?: string;
        } = {
          model: modelName,
          prompt: runtime.prompt,
          n: 1,
          size: effectiveSize,
        };

        const resolvedQuality = mapOpenAiImageQuality(modelName, normalizedQuality);
        if (resolvedQuality) {
          body.quality = resolvedQuality;
        }

        const response = await fetchOpenAI("/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const rawText = await response.text();
        let json: Record<string, unknown> = {};
        try {
          json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          json = {};
        }

        if (!response.ok) {
          const error = new Error(`OpenAI image error: ${response.status}`) as Error & {
            status?: number;
            meta?: Record<string, unknown>;
          };
          error.status = response.status;
          error.meta = json;
          throw error;
        }

        const image = Array.isArray(json.data)
          ? (json.data as Array<Record<string, unknown>>)[0]
          : null;
        if (!image) throw new Error("OpenAI image response missing data.");

        const imageData = (image ?? {}) as { url?: unknown; b64_json?: unknown };
        const url =
          typeof imageData.url === "string" ? (imageData.url as string) : null;
        const b64 =
          typeof imageData.b64_json === "string" ? (imageData.b64_json as string) : null;
        if (!url && !b64) {
          throw new Error("OpenAI image response missing url and b64_json.");
        }

          const finalUrl = await persistImageUrlIfNeeded(
            url ?? `data:image/png;base64,${b64}`,
          );
        const responseMetadata = extractImageResponseMetadata(modelName, json);

        attemptRecord.completedAt = nowIso();
        attemptRecord.meta = { response: responseMetadata };

        if (runtime.runState) {
          await runtime.runState.recordAttemptOutcome(attemptRecord, {
            status: "succeeded",
            imageUrl: finalUrl,
            responseMetadata,
            terminal: true,
          });
        }

        return { url: finalUrl, metadata: responseMetadata, provider: "openai" };
      } catch (error) {
        const details = extractOpenAiErrorDetails(error);
        attemptRecord.completedAt = nowIso();
        attemptRecord.errorCode = details.code;
        attemptRecord.errorMessage = details.message;
        attemptRecord.meta = details.meta;

        const retryable = shouldRetryError(details);
        const hasMoreRetries = retryable && retryIndex < runtime.delays.length - 1;
        const hasMoreModels = modelIndex < candidateModels.length - 1;
        const terminal = !(hasMoreRetries || hasMoreModels);

        if (runtime.runState) {
          await runtime.runState.recordAttemptOutcome(attemptRecord, {
            status: "failed",
            error: details,
            terminal,
          });
        }

        lastError = error;
        if (hasMoreRetries) {
          continue;
        }
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("OpenAI provider exhausted without success.");
}

function mapSizeToAspectRatio(size: string): string {
  const parts = String(size ?? "").split("x");
  const width = Number.parseInt(parts[0] ?? "", 10);
  const height = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1:1";
  }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

async function generateWithStability(runtime: ProviderRuntimeParams): Promise<ProviderResult> {
  if (!hasStabilityApiKey()) {
    throw new Error("Stability API key is not configured.");
  }

  runtime.attemptCounter.value += 1;
  const attemptRecord: AiImageRunAttempt = {
    attempt: runtime.attemptCounter.value,
    model: serverEnv.STABILITY_IMAGE_MODEL ?? "sd3.5-large",
    provider: "stability",
    startedAt: nowIso(),
  };

  if (runtime.runState) {
    await runtime.runState.recordAttemptStart(attemptRecord);
  }

  try {
    const aspectRatio = mapSizeToAspectRatio(runtime.params.size);
    const stabilityOptions: StabilityGenerateOptions = {
      prompt: runtime.prompt,
      aspectRatio,
      stylePreset: runtime.context?.stylePreset ?? null,
    };
    if (typeof runtime.context?.options?.["seed"] === "number") {
      stabilityOptions.seed = Number(runtime.context?.options?.["seed"]);
    }
    if (typeof runtime.context?.options?.["guidance"] === "number") {
      stabilityOptions.guidance = Number(runtime.context?.options?.["guidance"]);
    }
    const result = await generateStabilityImage(stabilityOptions);

      const finalUrl = await persistImageUrlIfNeeded(
        `data:${result.mimeType};base64,${result.base64}`,
      );

    attemptRecord.completedAt = nowIso();
    attemptRecord.meta = { response: result.metadata ?? {} };

    if (runtime.runState) {
      await runtime.runState.recordAttemptOutcome(attemptRecord, {
        status: "succeeded",
        imageUrl: finalUrl,
        responseMetadata: result.metadata ?? {},
        terminal: true,
      });
    }

    return { url: finalUrl, metadata: result.metadata ?? {}, provider: "stability" };
  } catch (error) {
    const details = extractOpenAiErrorDetails(error);
    attemptRecord.completedAt = nowIso();
    attemptRecord.errorCode = details.code;
    attemptRecord.errorMessage = details.message;
    attemptRecord.meta = details.meta;

    if (runtime.runState) {
      await runtime.runState.recordAttemptOutcome(attemptRecord, {
        status: "failed",
        error: details,
        terminal: true,
      });
    }
    throw error;
  }
}

export async function generateImageFromPrompt(
  prompt: string,
  options: ImageOptions = {},
  runContext?: ImageRunExecutionContext,
): Promise<ImageGenerationResult> {
  const startedAt = Date.now();
  const params = resolveImageParams(options);
  const providerQueue = resolveProviderQueue(prompt, runContext);
  const retryDelays =
    runContext?.retryDelaysMs && runContext.retryDelaysMs.length
      ? runContext.retryDelaysMs.filter((delay) => Number.isFinite(delay) && (delay as number) >= 0)
      : DEFAULT_IMAGE_RETRY_DELAYS_MS;
  const delays = retryDelays.length ? retryDelays : DEFAULT_IMAGE_RETRY_DELAYS_MS;

  const enrichedContext = runContext
    ? {
        ...runContext,
        provider: resolveInitialProvider(providerQueue, runContext),
        candidateProviders: providerQueue,
      }
    : undefined;

  const runState = await createRunState(enrichedContext, {
    size: params.size,
    quality: params.quality,
  });

  const attemptCounter: ProviderAttemptCounter = {
    value: runState ? runState.attempts.length : 0,
  };

  let lastError: unknown = null;

  for (const provider of providerQueue) {
    try {
      const runtime: ProviderRuntimeParams = {
        prompt,
        params,
        delays,
        runState,
        attemptCounter,
      };
      if (runContext) {
        runtime.context = runContext;
      }

      if (provider === "openai") {
        const result = await generateWithOpenAI(runtime);
        console.info("image_generation_completed", {
          provider,
          model: result.metadata?.model ?? serverEnv.OPENAI_IMAGE_MODEL,
          attempts: attemptCounter.value,
          durationMs: Date.now() - startedAt,
        });
        return {
          url: result.url,
          runId: runState?.id ?? null,
          provider: result.provider,
          metadata: result.metadata ?? null,
        };
      }

      if (provider === "stability") {
        const result = await generateWithStability(runtime);
        console.info("image_generation_completed", {
          provider,
          model: result.metadata?.model ?? serverEnv.STABILITY_IMAGE_MODEL ?? "sd3.5-large",
          attempts: attemptCounter.value,
          durationMs: Date.now() - startedAt,
        });
        return {
          url: result.url,
          runId: runState?.id ?? null,
          provider: result.provider,
          metadata: result.metadata ?? null,
        };
      }
    } catch (error) {
      lastError = error;
      console.warn("image_generation_provider_failed", { provider, error });
      continue;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  if (lastError) {
    throw new Error(String(lastError));
  }
  throw new Error("Failed to generate image.");
}

export async function editImageWithInstruction(
  imageUrl: string,
  instruction: string,
  options: ImageOptions = {},
  runContext?: ImageRunExecutionContext,
  maskData?: string | null,
): Promise<ImageGenerationResult> {
  requireOpenAIKey();

  const params = resolveImageParams(options);
  const runState = await createRunState(runContext, {
    size: params.size,
    quality: params.quality,
    sourceImageUrl: imageUrl,
  });

  const retryDelays =
    runContext?.retryDelaysMs && runContext.retryDelaysMs.length
      ? runContext.retryDelaysMs.filter((delay) => Number.isFinite(delay) && (delay as number) >= 0)
      : DEFAULT_IMAGE_RETRY_DELAYS_MS;
  const delays = retryDelays.length ? retryDelays : DEFAULT_IMAGE_RETRY_DELAYS_MS;

  let attemptCounter = runState ? runState.attempts.length : 0;

  let imageBytes: Uint8Array;
  try {
    imageBytes = await fetchImageBytesForEdit(imageUrl);

    try {
      const { default: Jimp } = await import("jimp");
      const bufferCtor = getNodeBufferCtor();
      if (!bufferCtor) {
        throw new Error("Buffer not available");
      }
      const image = await Jimp.read(bufferCtor.from(imageBytes));
      const converted = await image.getBufferAsync(Jimp.MIME_PNG);
      imageBytes = toUint8ArrayView(converted);
    } catch (conversionError) {
      console.warn(
        "PNG conversion failed, attempting edit with original format:",
        (conversionError as Error)?.message,
      );
    }
  } catch (error) {
    const details = extractOpenAiErrorDetails(error);
    if (runState) {
      attemptCounter += 1;
      const attemptRecord: AiImageRunAttempt = {
        attempt: attemptCounter,
        model: null,
        startedAt: nowIso(),
        completedAt: nowIso(),
        errorCode: details.code,
        errorMessage: details.message,
        meta: details.meta,
      };
      await runState.recordAttemptStart(attemptRecord);
      await runState.recordAttemptOutcome(attemptRecord, {
        status: "failed",
        error: details,
        terminal: true,
      });
    }
    throw error;
  }

  const baseBlob = new Blob([imageBytes.slice()], { type: "image/png" });

  let maskBlob: Blob | null = null;
  if (maskData) {
    try {
      let maskBytes: Uint8Array;
      if (/^data:/i.test(maskData)) {
        const match = maskData.match(/^data:([^;]+);base64,(.*)$/i);
        if (!match) {
          throw new Error("Invalid mask data URI");
        }
        const payload = match[2];
        if (!payload) {
          throw new Error("Invalid mask data URI");
        }
        maskBytes = decodeBase64(payload);
      } else {
        const resolvedMaskUrl = resolveFetchableUrl(maskData);
        const response = await fetch(resolvedMaskUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch mask image (${response.status})`);
        }
        maskBytes = new Uint8Array(await response.arrayBuffer());
      }

      try {
        const { default: Jimp } = await import("jimp");
        const bufferCtor = getNodeBufferCtor();
        if (!bufferCtor) {
          throw new Error("Buffer not available");
        }
        const sourceMask = await Jimp.read(bufferCtor.from(maskBytes));
        const processedMask = await new Jimp(
          sourceMask.bitmap.width,
          sourceMask.bitmap.height,
          0xffffffff,
        );
        const targetData = processedMask.bitmap.data;
        sourceMask.scan(
          0,
          0,
          sourceMask.bitmap.width,
          sourceMask.bitmap.height,
          function (_x, _y, idx) {
            const alpha = this.bitmap.data[idx + 3] ?? 0;
            targetData[idx + 3] = alpha > 10 ? 0 : 255;
          },
        );
        const processedBuffer = await processedMask.getBufferAsync(Jimp.MIME_PNG);
        const processedArray = toUint8ArrayView(processedBuffer);
        maskBlob = new Blob([processedArray.slice()], { type: "image/png" });
      } catch (maskProcessError) {
        console.warn("editImageWithInstruction mask processing failed", maskProcessError);
        maskBlob = new Blob([maskBytes.slice()], { type: "image/png" });
      }
    } catch (maskError) {
      console.warn("editImageWithInstruction mask processing failed", maskError);
    }
  }

  const promptText = instruction || "Make subtle improvements.";

  const allowedEditModelList = ["gpt-image-1"];
  const allowedEditModels = new Set(allowedEditModelList.map((model) => model.toLowerCase()));

  const pickAllowedModel = (model: string | null | undefined) =>
    model && allowedEditModels.has(model.toLowerCase()) ? model : null;

  const preferredEditModel =
    pickAllowedModel(serverEnv.OPENAI_IMAGE_MODEL) ?? "gpt-image-1";

  const candidateModels = Array.from(new Set([preferredEditModel, ...allowedEditModelList])).filter(
    (model): model is string => typeof model === "string" && model.length > 0,
  );

  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < candidateModels.length; modelIndex++) {
    const modelName = candidateModels[modelIndex];
    if (!modelName) {
      continue;
    }

    for (let retryIndex = 0; retryIndex < delays.length; retryIndex++) {
      const delay = delays[retryIndex] ?? 0;
      if (attemptCounter > 0 && delay > 0) {
        await waitFor(delay);
      }

      attemptCounter += 1;
      const attemptRecord: AiImageRunAttempt = {
        attempt: attemptCounter,
        model: modelName,
        startedAt: nowIso(),
      };

      if (runState) {
        await runState.recordAttemptStart(attemptRecord);
      }

      try {
        const normalizedSize = normalizeOpenAiImageSize(params.size);
        const normalizedQuality =
          params.quality === "hd" ? ("hd" as const) : ("standard" as const);
        const requestedEditSize =
          normalizedQuality === "hd" ? ("1024x1024" as OpenAiAllowedSize) : normalizedSize;
        const effectiveEditSize = coerceOpenAiSizeForModel(requestedEditSize, modelName);

        const fd = new FormData();
        fd.append("model", modelName);
        fd.append("image", baseBlob, "image.png");
        fd.append("prompt", promptText);
        fd.append("size", effectiveEditSize);
        if (maskBlob) fd.append("mask", maskBlob, "mask.png");

        const response = await fetchOpenAI("/images/edits", {
          method: "POST",
          body: fd,
        });

        const rawText = await response.text();
        let json: Record<string, unknown> = {};
        try {
          json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
        } catch {
          json = {};
        }

        if (!response.ok) {
          console.error("openai_image_edit_failed_response", {
            status: response.status,
            body: json,
          });
          const error = new Error(
            `OpenAI image edit error: ${response.status}`,
          ) as Error & { status?: number; meta?: Record<string, unknown> };
          error.status = response.status;
          error.meta = json;
          throw error;
        }

        const image = Array.isArray(json.data)
          ? (json.data as Array<Record<string, unknown>>)[0]
          : null;
        if (!image) throw new Error("OpenAI image edit missing data");

        const imageData = (image ?? {}) as { url?: unknown; b64_json?: unknown };
        const maybeUrl =
          typeof imageData.url === "string" ? (imageData.url as string) : null;
        const maybeB64 =
          typeof imageData.b64_json === "string" ? (imageData.b64_json as string) : null;
        const dataUri = maybeUrl ?? (maybeB64 ? `data:image/png;base64,${maybeB64}` : null);

        if (!dataUri) throw new Error("OpenAI image edit missing url/b64");

        const saved = await storeImageSrcToSupabase(dataUri, "edit");
        const finalUrl = saved?.url ?? dataUri;

        const responseMetadata = extractImageResponseMetadata(modelName, json);

        attemptRecord.completedAt = nowIso();
        attemptRecord.meta = { response: responseMetadata };

        if (runState) {
          await runState.recordAttemptOutcome(attemptRecord, {
            status: "succeeded",
            imageUrl: finalUrl,
            responseMetadata,
            terminal: true,
          });
        }

        return {
          url: finalUrl,
          runId: runState?.id ?? null,
          provider: attemptRecord.provider ?? runState?.provider ?? "openai",
          metadata: responseMetadata,
        };
      } catch (error) {
        const details = extractOpenAiErrorDetails(error);
        attemptRecord.completedAt = nowIso();
        attemptRecord.errorCode = details.code;
        attemptRecord.errorMessage = details.message;
        attemptRecord.meta = details.meta;

        const retryable = shouldRetryError(details);
        const hasMoreRetries = retryable && retryIndex < delays.length - 1;
        const hasMoreModels = modelIndex < candidateModels.length - 1;
        const terminal = !(hasMoreRetries || hasMoreModels);

        if (runState) {
          await runState.recordAttemptOutcome(attemptRecord, {
            status: "failed",
            error: details,
            terminal,
          });
        }

        lastError = error;
        if (hasMoreRetries) {
          continue;
        }
        break;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  if (lastError) {
    throw new Error(String(lastError));
  }
  throw new Error("Failed to edit image.");
}

type ImageProviderId = "openai" | "stability";

const STYLE_PROVIDER_OVERRIDES: Record<string, ImageProviderId> = {
  "vibrant-future": "stability",
  "noir-spotlight": "stability",
  "capsule-default": "openai",
};

const PROMPT_PROVIDER_HINTS: Array<{ pattern: RegExp; provider: ImageProviderId }> = [
  { pattern: /\bflux\b/i, provider: "stability" },
  { pattern: /\bphotoreal\b/i, provider: "openai" },
  { pattern: /\bvector\b/i, provider: "stability" },
];
