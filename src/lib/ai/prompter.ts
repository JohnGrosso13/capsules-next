type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

if (typeof (globalThis as { DOMParser?: unknown }).DOMParser !== "function") {
  class BasicDOMParser {
    parseFromString(markup: string) {
      const textContent = String(markup ?? "");
      const node = { textContent, innerHTML: textContent };
      return {
        textContent,
        documentElement: node,
        body: node,
      } as unknown;
    }
  }
  (globalThis as { DOMParser: unknown }).DOMParser = BasicDOMParser as unknown;
}

import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { serverEnv } from "../env/server";

import { getDatabaseAdminClient } from "@/config/database";

import { storeImageSrcToSupabase } from "../supabase/storage";
import {
  createAiImageRun,
  updateAiImageRun,
  type AiImageRunAttempt,
  type UpdateAiImageRunInput,
} from "@/server/ai/image-runs";
import { publishAiImageEvent } from "@/services/realtime/ai-images";
import type { ComposerChatAttachment, ComposerChatMessage } from "@/lib/composer/chat-types";

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "AIConfigError";
  }
}

type ChatMessage = Record<string, unknown>;

type JsonSchema = { name: string; schema: Record<string, unknown> };

type DraftPost = {
  kind: string;

  content: string;

  mediaUrl: string | null;

  mediaPrompt: string | null;
};

type PollDraft = { message: string; poll: { question: string; options: string[] } };

type FeedSummary = {
  message: string;

  bullets: string[];

  next_actions: string[];

  suggestion: { title: string | null; prompt: string | null } | null;
};

const HISTORY_MESSAGE_LIMIT = 6;

function summarizeAttachmentForConversation(attachment: ComposerChatAttachment): string {
  const parts = [attachment.name];
  if (attachment.mimeType) {
    parts.push(`(${attachment.mimeType})`);
  }
  if (attachment.url) {
    parts.push(`-> ${attachment.url}`);
  }
  return parts.join(" ");
}

function mapConversationToMessages(
  history: ComposerChatMessage[] | undefined,
  limit: number = HISTORY_MESSAGE_LIMIT,
): ChatMessage[] {
  if (!history || !Array.isArray(history) || history.length === 0) {
    return [];
  }
  const recent = history.slice(-limit);
  return recent.map((entry) => {
    const role = entry.role === "user" ? "user" : "assistant";
    const attachmentsNote = entry.attachments && entry.attachments.length
      ? `\n\nAttachments referenced:\n${entry.attachments
          .map((attachment) => `- ${summarizeAttachmentForConversation(attachment)}`)
          .join("\n")}`
      : "";
    return {
      role,
      content: `${entry.content}${attachmentsNote}`.trim(),
    };
  });
}
type ComposeDraftOptions = {
  history?: ComposerChatMessage[];
  attachments?: ComposerChatAttachment[];
  capsuleId?: string | null;
  rawOptions?: Record<string, unknown>;
};
const nullableStringSchema = {
  anyOf: [{ type: "string" }, { type: "null" }],
};

const creationSchema: JsonSchema = {
  name: "CapsulesDraftCreation",

  schema: {
    type: "object",

    additionalProperties: false,

    required: ["message", "post"],

    properties: {
      message: { type: "string", description: "Short acknowledgement for the user." },

      post: {
        type: "object",

        additionalProperties: false,

        required: ["content"],

        properties: {
          content: {
            type: "string",
            description: "Complete social post copy ready for publishing.",
          },

          kind: { type: "string", enum: ["text", "image", "video"] },

          media_prompt: nullableStringSchema,

          media_url: nullableStringSchema,

          notes: nullableStringSchema,
        },
      },
    },
  },
};

const editSchema: JsonSchema = {
  name: "CapsulesDraftEdit",

  schema: {
    type: "object",

    additionalProperties: false,

    required: ["message", "post"],

    properties: {
      message: { type: "string" },

      post: {
        type: "object",

        additionalProperties: false,

        required: ["content"],

        properties: {
          content: { type: "string" },

          kind: { type: "string", enum: ["text", "image", "video"] },

          media_prompt: nullableStringSchema,

          media_url: nullableStringSchema,

          keep_existing_media: { type: "boolean" },

          edit_current_media: { type: "boolean" },
        },
      },
    },
  },
};

const pollSchema: JsonSchema = {
  name: "CapsulesPollDraft",

  schema: {
    type: "object",

    additionalProperties: false,

    required: ["message", "poll"],

    properties: {
      message: { type: "string", description: "Short acknowledgement for the user." },

      poll: {
        type: "object",

        additionalProperties: false,

        required: ["question", "options"],

        properties: {
          question: { type: "string" },

          options: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
        },
      },
    },
  },
};

const feedSummarySchema: JsonSchema = {
  name: "FeedSummary",

  schema: {
    type: "object",

    additionalProperties: false,

    required: ["message"],

    properties: {
      message: { type: "string" },

      bullets: { type: "array", items: { type: "string" } },

      next_actions: { type: "array", items: { type: "string" } },

      suggested_title: { type: "string" },

      suggested_post_prompt: { type: "string" },
    },
  },
};

function requireOpenAIKey() {
  if (!hasOpenAIApiKey()) {
    throw new AIConfigError(
      "OpenAI API key is not configured. Set OPENAI_API_KEY in the environment.",
    );
  }
}

export function extractJSON<T = Record<string, unknown>>(maybeJSONString: unknown): T | null {
  if (maybeJSONString && typeof maybeJSONString === "object") {
    return maybeJSONString as T;
  }

  const text = String(maybeJSONString ?? "");

  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }

  try {
    const fenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");

    return JSON.parse(fenced) as T;
  } catch {
    // continue
  }

  try {
    const start = text.indexOf("{");

    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
  } catch {
    // ignore incomplete fragments
  }

  return null;
}

export async function callOpenAIChat(
  messages: ChatMessage[],

  schema: JsonSchema | null,

  options: { temperature?: number } = {},
): Promise<{ content: string; raw: Json }> {
  requireOpenAIKey();

  const temperature = options.temperature ?? 0.7;

  const payload: Record<string, unknown> = {
    model: serverEnv.OPENAI_MODEL,

    messages,

    temperature,
  };

  if (schema) {
    payload.response_format = { type: "json_schema", json_schema: schema };
  } else {
    payload.response_format = { type: "json_object" };
  }

  let response = await fetchOpenAI("/chat/completions", {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify(payload),
  });

  let json = (await response.json().catch(() => ({}))) as Json;

  if (!response.ok) {
    const fallbackBody = { model: serverEnv.OPENAI_MODEL, messages, temperature };

    response = await fetchOpenAI("/chat/completions", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(fallbackBody),
    });

    json = (await response.json().catch(() => ({}))) as Json;

    if (!response.ok) {
      const error = new Error(`OpenAI chat error: ${response.status}`);

      (error as Error & { meta?: Json }).meta = json;

      throw error;
    }
  }

  const choices = (json as Record<string, unknown>).choices;

  const content = Array.isArray(choices)
    ? (choices[0] as Record<string, unknown>)?.message &&
      ((choices[0] as Record<string, unknown>).message as Record<string, unknown>)?.content
    : null;

  if (!content || typeof content !== "string") {
    throw new Error("OpenAI chat returned empty content.");
  }

  return { content, raw: json };
}

type ImageOptions = { quality?: string; size?: string };

type ImageParams = { size: string; quality: string };

function resolveImageParams(options: ImageOptions = {}): ImageParams {
  let quality = options.quality ?? "standard";

  let size = options.size ?? serverEnv.OPENAI_IMAGE_SIZE;

  const override = serverEnv.OPENAI_IMAGE_QUALITY;

  const isNonProd = (process.env.NODE_ENV ?? "").toLowerCase() !== "production";

  if (override === "low" || (isNonProd && override !== "standard" && override !== "high")) {
    quality = "standard";

    size = serverEnv.OPENAI_IMAGE_SIZE_LOW;
  } else if (override === "high") {
    quality = "hd";
  } else if (override === "standard") {
    quality = "standard";
  }

  return { size, quality };
}

const DEFAULT_IMAGE_RETRY_DELAYS_MS = [0, 1200, 3200];

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

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
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
  const combinedOptions = compactObject({ ...(context.options ?? {}), ...resolvedOptions });

  try {
    const run = await createAiImageRun({
      ownerUserId: context.ownerId ?? null,
      capsuleId: context.capsuleId ?? null,
      mode: context.mode,
      assetKind: context.assetKind,
      userPrompt: context.userPrompt,
      resolvedPrompt: context.resolvedPrompt,
      stylePreset: context.stylePreset ?? null,
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
      stylePreset: run.stylePreset,
      options: run.options ?? {},
      attempts: [],
      completed: false,
      completionPublished: false,
      async recordAttemptStart(this: RunState, attempt: AiImageRunAttempt) {
        this.attempts.push(attempt);
        const retryCount = Math.max(0, this.attempts.length - 1);
        try {
          await updateAiImageRun(this.id, {
            status: "running",
            model: attempt.model ?? null,
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
export async function generateImageFromPrompt(
  prompt: string,
  options: ImageOptions = {},
  runContext?: ImageRunExecutionContext,
): Promise<string> {
  requireOpenAIKey();

  const params = resolveImageParams(options);
  const runState = await createRunState(runContext, {
    size: params.size,
    quality: params.quality,
  });

  const retryDelays =
    runContext?.retryDelaysMs && runContext.retryDelaysMs.length
      ? runContext.retryDelaysMs.filter((delay) => Number.isFinite(delay) && (delay as number) >= 0)
      : DEFAULT_IMAGE_RETRY_DELAYS_MS;

  const delays = retryDelays.length ? retryDelays : DEFAULT_IMAGE_RETRY_DELAYS_MS;

  const isNonProd = (process.env.NODE_ENV ?? "").toLowerCase() !== "production";

  const candidateModels = Array.from(
    new Set(
      [
        isNonProd ? serverEnv.OPENAI_IMAGE_MODEL_DEV : null,
        serverEnv.OPENAI_IMAGE_MODEL,
        // Prefer the most affordable legacy model while testing.
        isNonProd ? "dall-e-2" : null,
        "gpt-image-1",
        "dall-e-3",
      ].filter((model): model is string => typeof model === "string" && model.length > 0),
    ),
  );

  let attemptCounter = runState ? runState.attempts.length : 0;
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
        const body = { model: modelName, prompt, n: 1, size: params.size, quality: params.quality };

        const response = await fetchOpenAI("/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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

        const finalUrl = url ?? `data:image/png;base64,${b64}`;
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

        return finalUrl;
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
  throw new Error("Failed to generate image.");
}

export async function editImageWithInstruction(
  imageUrl: string,
  instruction: string,
  options: ImageOptions = {},
  runContext?: ImageRunExecutionContext,
): Promise<string> {
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

  let buffer: Buffer;
  try {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      const error = new Error(`Failed to fetch source image (${imgResponse.status})`) as Error & {
        status?: number;
      };
      error.status = imgResponse.status;
      throw error;
    }

    buffer = Buffer.from(await imgResponse.arrayBuffer());

    try {
      const { default: Jimp } = await import("jimp");
      const image = await Jimp.read(buffer);
      buffer = await image.getBufferAsync(Jimp.MIME_PNG);
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

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const baseBlob = new Blob([arrayBuffer as ArrayBuffer], { type: "image/png" });
  const promptText = instruction || "Make subtle improvements.";

  const allowedEditModelList = ["gpt-image-1", "dall-e-2", "gpt-image-0721-mini-alpha"];
  const allowedEditModels = new Set(allowedEditModelList.map((model) => model.toLowerCase()));

  const isNonProd = (process.env.NODE_ENV ?? "").toLowerCase() !== "production";
  const pickAllowedModel = (model: string | null | undefined) =>
    model && allowedEditModels.has(model.toLowerCase()) ? model : null;

  const preferredEditModel =
    (isNonProd ? pickAllowedModel(serverEnv.OPENAI_IMAGE_MODEL_DEV) : null) ??
    pickAllowedModel(serverEnv.OPENAI_IMAGE_MODEL) ??
    "gpt-image-1";

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
        const fd = new FormData();
        fd.append("model", modelName);
        fd.append("image", baseBlob, "image.png");
        fd.append("prompt", promptText);
        if (params.size) fd.append("size", params.size);

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

        return finalUrl;
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

function buildBasePost(incoming: Record<string, unknown> = {}): DraftPost {
  return {
    kind: typeof incoming.kind === "string" ? incoming.kind : "text",

    content: typeof incoming.content === "string" ? incoming.content : "",

    mediaUrl: typeof incoming.mediaUrl === "string" ? incoming.mediaUrl : null,

    mediaPrompt: typeof incoming.mediaPrompt === "string" ? incoming.mediaPrompt : null,
  };
}

export async function createPostDraft(
  userText: string,
  context: ComposeDraftOptions = {},
): Promise<Record<string, unknown>> {
  const { history, attachments, capsuleId, rawOptions } = context;
  const historyMessages = mapConversationToMessages(history);
  const imageIntent =
    /(image|logo|banner|thumbnail|picture|photo|icon|cover|poster|graphic|illustration|art|avatar|background)\b/i.test(
      userText,
    );

  async function inferImagePromptFromInstruction(instruction: string) {
    const { content } = await callOpenAIChat(
      [
        {
          role: "system",

          content:
            "You turn user instructions into a single concise image generation prompt (one sentence). Do not return anything except the prompt text.",
        },

        { role: "user", content: instruction },
      ],

      null,

      { temperature: 0.7 },
    );

    return String(content)
      .replace(/^\s*```(?:json|text)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }

  const userPayload: Record<string, unknown> = { instruction: userText };
  if (attachments && attachments.length) {
    userPayload.attachments = attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
    }));
  }
  if (capsuleId) {
    userPayload.capsuleId = capsuleId;
  }
  if (rawOptions && Object.keys(rawOptions).length) {
    userPayload.options = rawOptions;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",

      content: [
        "You are Capsules AI, an assistant that crafts polished social media posts and image prompts for community managers.",

        "Respond with JSON that follows the provided schema. Include engaging copy, actionable call-to-actions, and 1-3 relevant hashtags when appropriate.",

        "If the user requests an image, provide a vivid scene in post.media_prompt and still include post.content as the accompanying caption.",

        "Use clear, energetic but concise language.",
      ].join(" "),
    },

    ...historyMessages,

    {
      role: "user",

      content: JSON.stringify(userPayload),
    },
  ];

  const { content } = await callOpenAIChat(messages, creationSchema, { temperature: 0.75 });

  let parsed = extractJSON<Record<string, unknown>>(content);

  if (!parsed) {
    const fallback = await callOpenAIChat(
      [
        {
          role: "system",
          content: "Return only minified JSON matching the expected schema (no commentary).",
        },

        { role: "user", content: JSON.stringify({ instruction: userText }) },
      ],

      null,

      { temperature: 0.7 },
    );

    parsed = extractJSON<Record<string, unknown>>(fallback.content) || {};
  }

  const postResponse = (parsed.post as Record<string, unknown>) ?? {};

  const statusMessage =
    typeof parsed.message === "string" && parsed.message.trim().length
      ? parsed.message.trim()
      : "Here's a draft.";

  const result = buildBasePost();

  result.content = typeof postResponse.content === "string" ? postResponse.content.trim() : "";

  const requestedKind = typeof postResponse.kind === "string" ? postResponse.kind : null;

  let imagePrompt =
    typeof postResponse.media_prompt === "string" ? postResponse.media_prompt : null;

  let mediaUrl = typeof postResponse.media_url === "string" ? postResponse.media_url : null;

  if (imagePrompt && !imagePrompt.trim()) imagePrompt = null;

  if (mediaUrl && !mediaUrl.trim()) mediaUrl = null;

  if (mediaUrl) {
    result.mediaUrl = mediaUrl;

    result.mediaPrompt = imagePrompt || result.mediaPrompt;

    result.kind = requestedKind || "image";
  } else if (imagePrompt) {
    try {
      result.mediaUrl = await generateImageFromPrompt(imagePrompt);

      result.kind = "image";

      result.mediaPrompt = imagePrompt;
    } catch (error) {
      console.error("Image generation failed for composer prompt:", error);

      result.kind = requestedKind || "text";

      imagePrompt = null;
    }
  } else if (!imagePrompt && imageIntent) {
    try {
      imagePrompt = await inferImagePromptFromInstruction(userText);
    } catch {
      // ignore inference failure
    }

    if (imagePrompt) {
      try {
        result.mediaUrl = await generateImageFromPrompt(imagePrompt);

        result.kind = "image";

        result.mediaPrompt = imagePrompt;
      } catch (error) {
        console.error("Image generation failed (intent path):", error);
      }
    }
  } else if (requestedKind) {
    result.kind = requestedKind;
  } else {
    result.kind = result.mediaUrl ? "image" : "text";
  }

  if (!result.mediaUrl) {
    result.mediaPrompt = null;
  }

  if (!result.content && result.mediaUrl) {
    result.content = "Here is the new visual. Let me know if you want changes to the copy!";
  }

  try {
    if (result.mediaUrl && /^(?:https?:|data:)/i.test(result.mediaUrl)) {
      const saved = await storeImageSrcToSupabase(result.mediaUrl, "generate");

      if (saved?.url) {
        result.mediaUrl = saved.url;
      }
    }
  } catch (error) {
    console.warn("Supabase store (create) failed:", (error as Error)?.message);
  }

  return { action: "draft_post", message: statusMessage, post: result };
}

export async function createPollDraft(
  userText: string,
  hint: Record<string, unknown> = {},
  context: ComposeDraftOptions = {},
): Promise<PollDraft> {
  const { history, attachments, capsuleId, rawOptions } = context;
  const historyMessages = mapConversationToMessages(history);
  const system = [
    "You are Capsules AI. Create a concise poll from the user instruction.",

    "Return JSON with a friendly message and a poll containing a question and 2-6 short, distinct options.",

    "Derive specific options from the topic (e.g., days of the week, product names); do not default to Yes/No unless explicitly requested.",

    "Keep options succinct (1-3 words when possible).",
  ].join(" ");

  const userPayload: Record<string, unknown> = { instruction: userText, seed: hint || {} };
  if (attachments && attachments.length) {
    userPayload.attachments = attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      url: attachment.url,
    }));
  }
  if (capsuleId) {
    userPayload.capsuleId = capsuleId;
  }
  if (rawOptions && Object.keys(rawOptions).length) {
    userPayload.options = rawOptions;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: system },

    ...historyMessages,

    { role: "user", content: JSON.stringify(userPayload) },
  ];

  const { content } = await callOpenAIChat(messages, pollSchema, { temperature: 0.5 });

  const parsed = extractJSON<Record<string, unknown>>(content) || {};

  let question = String(
    (parsed?.poll && (parsed.poll as Record<string, unknown>)?.question) || hint.question || "",
  ).trim();

  let options = Array.isArray(parsed?.poll && (parsed.poll as Record<string, unknown>)?.options)
    ? ((parsed.poll as Record<string, unknown>).options as unknown[])
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    : [];

  if (!question) question = "What do you think?";

  if (!options.length && Array.isArray(hint.options)) {
    options = (hint.options as unknown[])
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
  }

  if (!options.length) options = ["Yes", "No"];

  const deduped = Array.from(new Set(options));

  options = deduped.length >= 2 ? deduped.slice(0, 6) : options.slice(0, 6);

  const message =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message
      : "I drafted a poll. Tweak anything you like.";

  return { message, poll: { question, options } };
}

export async function refinePostDraft(
  userText: string,

  incomingPost: Record<string, unknown>,

  context: ComposeDraftOptions = {},
): Promise<Record<string, unknown>> {
  const { history, attachments, capsuleId, rawOptions } = context;
  const historyMessages = mapConversationToMessages(history);
  const base = buildBasePost(incomingPost);

  const userPayload: Record<string, unknown> = {
    instruction: userText,
    post: incomingPost,
  };
  if (attachments && attachments.length) {
    userPayload.attachments = attachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      url: attachment.url,
    }));
  }
  if (capsuleId) {
    userPayload.capsuleId = capsuleId;
  }
  if (rawOptions && Object.keys(rawOptions).length) {
    userPayload.options = rawOptions;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",

      content: [
        "You are Capsules AI, helping a user refine an in-progress social media post.",

        "Output JSON per the provided schema. Update post.content to reflect the new instruction.",

        "If the user requests new imagery, provide a short, concrete description via post.media_prompt. Lean on the current media description when the edit should be a remix rather than a brand new visual.",

        "If the user wants adjustments to the existing image, set post.edit_current_media to true and combine the current media prompt with the requested changes instead of inventing an unrelated scene.",

        "Keep tone consistent with the instruction and the existing copy.",
      ].join(" "),
    },

    ...historyMessages,

    {
      role: "user",

      content: JSON.stringify(userPayload),
    },
  ];

  const { content } = await callOpenAIChat(messages, editSchema, { temperature: 0.6 });

  const parsed = extractJSON<Record<string, unknown>>(content) || {};

  const postResponse = (parsed.post as Record<string, unknown>) ?? {};

  const statusMessage =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : "Here you go.";

  const next = buildBasePost(base);

  next.content =
    typeof postResponse.content === "string" ? postResponse.content.trim() : next.content;

  const keepExisting = postResponse.keep_existing_media === true;

  const editCurrent = postResponse.edit_current_media === true;

  const candidatePrompt =
    typeof postResponse.media_prompt === "string" ? postResponse.media_prompt.trim() : "";

  const candidateUrl =
    typeof postResponse.media_url === "string" ? postResponse.media_url.trim() : "";

  if (candidateUrl) {
    next.mediaUrl = candidateUrl;

    next.mediaPrompt = candidatePrompt || next.mediaPrompt;

    next.kind = typeof postResponse.kind === "string" ? postResponse.kind : next.kind;
  } else if (candidatePrompt) {
    try {
      next.mediaUrl = await generateImageFromPrompt(candidatePrompt);

      next.mediaPrompt = candidatePrompt;

      next.kind = "image";
    } catch (error) {
      console.error("Image generation failed for refine:", error);
    }
  } else if (!keepExisting) {
    next.mediaPrompt = null;

    if (!editCurrent) {
      next.mediaUrl = null;
    }
  }

  if (editCurrent && base.mediaUrl) {
    try {
      const combinedPrompt = [base.mediaPrompt || "", candidatePrompt || userText]
        .filter(Boolean)
        .join(" ");

      const editedUrl = await editImageWithInstruction(
        base.mediaUrl,
        combinedPrompt || userText,
        {},
      );

      next.mediaUrl = editedUrl;

      next.mediaPrompt = combinedPrompt || userText;

      next.kind = "image";
    } catch (error) {
      console.error("Edit current image failed:", error);
    }
  }

  if (!next.mediaUrl) {
    next.mediaPrompt = null;
  }

  return { action: "draft_post", message: statusMessage, post: next };
}

export async function summarizeFeedFromDB({
  capsuleId,

  limit = 30,
}: {
  capsuleId: string | null;

  limit?: number;
}): Promise<FeedSummary> {
  const db = getDatabaseAdminClient();

  type FeedRow = {
    id: string;
    kind: string | null;
    content: string | null;
    media_url: string | null;
    media_prompt: string | null;
    user_name: string | null;
    capsule_id: string | null;
    created_at: string | null;
  };

  let query = db
    .from("posts_view")
    .select<FeedRow>("id,kind,content,media_url,media_prompt,user_name,capsule_id,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (capsuleId) {
    query = query.eq("capsule_id", capsuleId);
  }

  const result = await query.fetch();
  if (result.error) {
    throw new Error("summarizeFeedFromDB failed: " + result.error.message);
  }

  const rows = result.data ?? [];

  const posts = rows.map((row) => ({
    id: row.id,

    kind: row.kind,

    content: row.content || "",

    media: Boolean(row.media_url),

    media_prompt: row.media_prompt || null,

    user: row.user_name || null,

    created_at: row.created_at,
  }));

  const summaryResponse = await callOpenAIChat(
    [
      {
        role: "system",

        content:
          "You are Capsules AI. Summarize a feed of user posts concisely and helpfully. Keep it friendly, specific, and short. Mention image themes briefly. Also provide one relevant post idea for the user to publish next.",
      },

      { role: "user", content: JSON.stringify({ capsule_id: capsuleId || null, posts }) },
    ],

    feedSummarySchema,

    { temperature: 0.5 },
  );

  const parsed = extractJSON<Record<string, unknown>>(summaryResponse.content) || {};

  const message =
    typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message.trim()
      : "Here is a brief summary of recent activity.";

  let suggestionTitle =
    typeof parsed.suggested_title === "string" ? parsed.suggested_title.trim() : "";

  let suggestionPrompt =
    typeof parsed.suggested_post_prompt === "string" ? parsed.suggested_post_prompt.trim() : "";

  if (!suggestionPrompt) {
    try {
      const secondary = await callOpenAIChat(
        [
          {
            role: "system",

            content:
              "Given a feed summary, propose a single relevant post idea. Return JSON with suggested_title and suggested_post_prompt fields. Keep the prompt one sentence.",
          },

          {
            role: "user",
            content: JSON.stringify({ summary: message, bullets: parsed.bullets || [] }),
          },
        ],

        {
          name: "SuggestionOnly",

          schema: {
            type: "object",

            additionalProperties: false,

            required: ["suggested_post_prompt"],

            properties: {
              suggested_title: { type: "string" },

              suggested_post_prompt: { type: "string" },
            },
          },
        },

        { temperature: 0.6 },
      );

      const fallback = extractJSON<Record<string, unknown>>(secondary.content) || {};

      suggestionTitle =
        typeof fallback.suggested_title === "string" && fallback.suggested_title.trim()
          ? fallback.suggested_title.trim()
          : suggestionTitle;

      suggestionPrompt =
        typeof fallback.suggested_post_prompt === "string" && fallback.suggested_post_prompt.trim()
          ? fallback.suggested_post_prompt.trim()
          : suggestionPrompt;
    } catch {
      // ignore secondary failure
    }
  }

  const bullets = Array.isArray(parsed.bullets)
    ? (parsed.bullets as unknown[]).map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

  const nextActions = Array.isArray(parsed.next_actions)
    ? (parsed.next_actions as unknown[]).map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];

  return {
    message,

    bullets,

    next_actions: nextActions,

    suggestion:
      suggestionTitle || suggestionPrompt
        ? { title: suggestionTitle || null, prompt: suggestionPrompt || null }
        : null,
  };
}

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64
    .replace(/[\r\n\s]+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const padded = padLength ? normalized + "=".repeat(4 - padLength) : normalized;

  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(padded);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const bufferConstructor = (globalThis as {
    Buffer?: { from(input: string, encoding: string): Uint8Array };
  }).Buffer;
  if (bufferConstructor && typeof bufferConstructor.from === "function") {
    const nodeBuffer = bufferConstructor.from(padded, "base64");
    return new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength);
  }

  throw new Error("Base64 decoding is not supported in this runtime.");
}

function parseBase64Audio(
  input: string,
  fallbackMime: string | null,
): { bytes: Uint8Array; mime: string | null } {
  if (!input) {
    throw new Error("audio_base64 is required");
  }

  let base64 = input.trim();

  let detectedMime = fallbackMime || "";

  const dataUrlMatch = base64.match(/^data:([^;,]+)(?:;[^,]*)?,/i);

  if (dataUrlMatch) {
    const matchMime = dataUrlMatch[1];
    if (matchMime) {
      detectedMime = detectedMime || matchMime;
    }

    base64 = base64.slice(dataUrlMatch[0].length);
  }

  const bytes = decodeBase64ToUint8Array(base64);

  const mime = detectedMime || fallbackMime || "audio/webm";

  return { bytes, mime };
}

function audioExtensionFromMime(mime: string) {
  const value = mime.toLowerCase();

  if (value.includes("ogg")) return "ogg";

  if (value.includes("mp3") || value.includes("mpeg")) return "mp3";

  if (value.includes("mp4")) return "mp4";

  if (value.includes("wav")) return "wav";

  if (value.includes("m4a")) return "m4a";

  return "webm";
}

export async function transcribeAudioFromBase64({
  audioBase64,

  mime,
}: {
  audioBase64: string;

  mime: string | null;
}): Promise<{ text: string; model: string | null; raw: Json | null }> {
  requireOpenAIKey();

  const { bytes, mime: resolvedMime } = parseBase64Audio(audioBase64, mime);

  const audioBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([audioBuffer], { type: resolvedMime || "audio/webm" });

  const extension = audioExtensionFromMime(resolvedMime || "audio/webm");

  const filename = `recording.${extension}`;

  const models = Array.from(
    new Set(
      [serverEnv.OPENAI_TRANSCRIBE_MODEL, "gpt-4o-mini-transcribe", "whisper-1"].filter(Boolean),
    ),
  );

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const fd = new FormData();

      fd.append("file", blob, filename);

      fd.append("model", model);

      const response = await fetchOpenAI("/audio/transcriptions", {
        method: "POST",

        body: fd,
      });

      const json = (await response.json().catch(() => ({}))) as Json;

      if (!response.ok) {
        const payload = json as Record<string, unknown>;

        const rawError = payload?.error;

        let errorMessage = `OpenAI transcription error: ${response.status}`;

        if (typeof rawError === "string") {
          errorMessage = rawError;
        } else if (rawError && typeof rawError === "object" && "message" in rawError) {
          const maybeMessage = (rawError as { message?: unknown }).message;

          if (typeof maybeMessage === "string" && maybeMessage.length) {
            errorMessage = maybeMessage;
          }
        }

        const error = new Error(errorMessage);

        (error as Error & { meta?: Json; status?: number }).meta = json;

        (error as Error & { status?: number }).status = response.status;

        lastError = error;

        continue;
      }

      const record = json as Record<string, unknown>;

      const transcript =
        typeof record.text === "string"
          ? record.text
          : typeof record.transcript === "string"
            ? record.transcript
            : "";

      return { text: transcript.toString(), raw: json, model };
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (lastError) throw lastError;

  throw new Error("Transcription failed");
}

