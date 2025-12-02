"use server";

import type { ComposerChatAttachment, ComposerChatMessage } from "@/lib/composer/chat-types";
import {
  callOpenAIToolChat,
  extractJSON,
  type ChatMessage,
  type ToolCallDefinition,
} from "@/lib/ai/prompter/core";
import {
  buildContextMessages,
  mapConversationToMessages,
  selectHistoryLimit,
  type ComposeDraftOptions,
} from "@/lib/ai/prompter";
import { promptResponseSchema, type PromptResponse } from "@/shared/schemas/ai";
import {
  buildContextMetadata,
  formatContextForPrompt,
  getCapsuleHistorySnippets,
  getChatContext,
  type ChatMemorySnippet,
} from "@/server/chat/retrieval";
import { isWebSearchConfigured, searchWeb } from "@/server/search/web-search";

import {
  generateBannerAsset,
  editBannerAsset,
  type BannerAssetInput,
  type BannerEditInput,
} from "./assets/banner";
import {
  generateLogoAsset,
  editLogoAsset,
  type LogoAssetInput,
  type LogoEditInput,
} from "./assets/logo";
import {
  generateAvatarAsset,
  editAvatarAsset,
  type AvatarAssetInput,
  type AvatarEditInput,
} from "./assets/avatar";
import type { AssetResponse } from "./assets/common";
import { customizerDraftSchema, type CustomizerDraft } from "@/shared/schemas/customizer";

export type CustomizerToolEvent =
  | { type: "status"; message: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: Record<string, unknown> };

type CustomizerToolCallbacks = {
  onEvent?: (event: CustomizerToolEvent) => void;
};

export type CapsuleCustomizerMode = "banner" | "storeBanner" | "tile" | "logo" | "avatar";

export type CustomizerComposeContext = {
  mode: CapsuleCustomizerMode;
  capsuleName?: string | null;
  displayName?: string | null;
  stylePreset?: string | null;
  personaId?: string | null;
  seed?: number | null;
  guidance?: number | null;
  variantId?: string | null;
  currentAssetUrl?: string | null;
  currentAssetData?: string | null;
  currentMaskData?: string | null;
};

export type CustomizerToolSessionOptions = {
  ownerId: string;
  capsuleId?: string | null;
  userText: string;
  history?: ComposerChatMessage[];
  attachments?: ComposerChatAttachment[];
  incomingDraft?: Record<string, unknown> | null;
  context: CustomizerComposeContext;
  requestOrigin?: string | null;
  replyMode?: "chat" | "draft" | null;
  maxIterations?: number;
  callbacks?: CustomizerToolCallbacks;
  contextOptions?: Pick<
    ComposeDraftOptions,
    "userCard" | "contextPrompt" | "contextRecords" | "contextMetadata"
  > | null;
  contextEnabled?: boolean;
};

type RuntimeContext = {
  ownerId: string;
  capsuleId?: string | null;
  requestOrigin?: string | null;
  compose: CustomizerComposeContext;
  setLatestAsset(asset: AssetResponse | null): void;
  latestUserText: string;
  history: ComposerChatMessage[];
  contextEnabled: boolean;
};

type ToolHandler = (
  input: Record<string, unknown>,
  runtime: RuntimeContext,
) => Promise<Record<string, unknown>>;

const TOOL_DEFINITIONS: ToolCallDefinition[] = [
  {
    name: "render_banner",
    description:
      "Generate a new hero banner, store banner, or promo tile based on the user's instruction. Returns the rendered asset URL.",
    parameters: {
      type: "object",
      required: ["prompt"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string", description: "Detailed instructions for the new banner." },
      },
    },
  },
  {
    name: "render_logo",
    description:
      "Generate a new square logo concept for the capsule based on the latest request.",
    parameters: {
      type: "object",
      required: ["prompt"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string", description: "Visual direction for the refreshed logo." },
      },
    },
  },
  {
    name: "render_avatar",
    description:
      "Generate a new avatar portrait for the capsule profile, respecting the circle-safe crop.",
    parameters: {
      type: "object",
      required: ["prompt"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string", description: "Description of the desired avatar." },
      },
    },
  },
  {
    name: "edit_asset",
    description:
      "Remix the currently selected asset (banner/logo/avatar) with new instructions. Use when the user wants refinements to the existing visual.",
    parameters: {
      type: "object",
      required: ["prompt"],
      additionalProperties: false,
      properties: {
        prompt: { type: "string", description: "What to change about the asset." },
        asset: {
          type: "string",
          enum: ["banner", "logo", "avatar"],
          description: "The asset kind to edit.",
        },
      },
    },
  },
  {
    name: "fetch_context",
    description:
      "Search Capsule memories and capsule history to ground your response. Use this when the user references prior work or you need more background.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "Search terms or recap of what you need (defaults to the latest user ask).",
        },
        include_capsule_history: {
          type: "boolean",
          description: "Set true to also fetch capsule history snippets.",
        },
      },
    },
  },
  {
    name: "search_web",
    description:
      "Look up real-world information on the internet. Use when you need fresh facts or details not in memory/context.",
    parameters: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "What to search for on the web." },
        limit: {
          type: "integer",
          description: "How many results to fetch (1-6).",
          minimum: 1,
          maximum: 6,
        },
      },
    },
  },
];

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  async render_banner(input, runtime) {
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt.length) {
      throw new Error("render_banner requires a prompt.");
    }
    const { compose } = runtime;
    const options: BannerAssetInput = {
      prompt,
      ownerId: runtime.ownerId,
      capsuleName: compose.capsuleName ?? compose.displayName ?? null,
      capsuleId: runtime.capsuleId ?? null,
      stylePreset: compose.stylePreset ?? null,
      stylePersonaId: compose.personaId ?? null,
      requestOrigin: runtime.requestOrigin ?? null,
      seed: compose.seed ?? null,
      guidance: compose.guidance ?? null,
    };
    const asset = await generateBannerAsset(options);
    return { status: "ok", asset };
  },
  async render_logo(input, runtime) {
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt.length) {
      throw new Error("render_logo requires a prompt.");
    }
    const { compose } = runtime;
    const options: LogoAssetInput = {
      prompt,
      ownerId: runtime.ownerId,
      capsuleName: compose.capsuleName ?? compose.displayName ?? null,
      capsuleId: runtime.capsuleId ?? null,
      stylePreset: compose.stylePreset ?? null,
      stylePersonaId: compose.personaId ?? null,
      requestOrigin: runtime.requestOrigin ?? null,
      seed: compose.seed ?? null,
      guidance: compose.guidance ?? null,
    };
    const asset = await generateLogoAsset(options);
    return { status: "ok", asset };
  },
  async render_avatar(input, runtime) {
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt.length) {
      throw new Error("render_avatar requires a prompt.");
    }
    const { compose } = runtime;
    const options: AvatarAssetInput = {
      prompt,
      ownerId: runtime.ownerId,
      displayName: compose.displayName ?? compose.capsuleName ?? null,
      capsuleId: runtime.capsuleId ?? null,
      stylePreset: compose.stylePreset ?? null,
      stylePersonaId: compose.personaId ?? null,
      requestOrigin: runtime.requestOrigin ?? null,
      seed: compose.seed ?? null,
      guidance: compose.guidance ?? null,
    };
    const asset = await generateAvatarAsset(options);
    return { status: "ok", asset };
  },
  async edit_asset(input, runtime) {
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    const asset = typeof input.asset === "string" ? input.asset : runtime.compose.mode;
    if (!prompt.length) {
      throw new Error("edit_asset requires a prompt.");
    }
    if (asset !== "banner" && asset !== "logo" && asset !== "avatar") {
      throw new Error("edit_asset requires a valid asset kind.");
    }
    const { compose } = runtime;
    if (!compose.currentAssetUrl && !compose.currentAssetData) {
      throw new Error("No asset available to edit.");
    }
    if (asset === "banner") {
      const options: BannerEditInput = {
        prompt,
        ownerId: runtime.ownerId,
        capsuleName: compose.capsuleName ?? compose.displayName ?? null,
        capsuleId: runtime.capsuleId ?? null,
        variantId: compose.variantId ?? null,
        stylePreset: compose.stylePreset ?? null,
        stylePersonaId: compose.personaId ?? null,
        requestOrigin: runtime.requestOrigin ?? null,
        seed: compose.seed ?? null,
        guidance: compose.guidance ?? null,
        imageUrl: compose.currentAssetUrl ?? null,
        imageData: compose.currentAssetData ?? null,
        maskData: compose.currentMaskData ?? null,
      };
      const response = await editBannerAsset(options);
      return { status: "ok", asset: response };
    }
    if (asset === "logo") {
      const options: LogoEditInput = {
        prompt,
        ownerId: runtime.ownerId,
        capsuleName: compose.capsuleName ?? compose.displayName ?? null,
        capsuleId: runtime.capsuleId ?? null,
        variantId: compose.variantId ?? null,
        stylePreset: compose.stylePreset ?? null,
        stylePersonaId: compose.personaId ?? null,
        requestOrigin: runtime.requestOrigin ?? null,
        seed: compose.seed ?? null,
        guidance: compose.guidance ?? null,
        imageUrl: compose.currentAssetUrl ?? null,
        imageData: compose.currentAssetData ?? null,
        maskData: compose.currentMaskData ?? null,
      };
      const response = await editLogoAsset(options);
      return { status: "ok", asset: response };
    }
    const options: AvatarEditInput = {
      prompt,
      ownerId: runtime.ownerId,
      displayName: compose.displayName ?? compose.capsuleName ?? null,
      capsuleId: runtime.capsuleId ?? null,
      variantId: compose.variantId ?? null,
      stylePreset: compose.stylePreset ?? null,
      stylePersonaId: compose.personaId ?? null,
      requestOrigin: runtime.requestOrigin ?? null,
      seed: compose.seed ?? null,
      guidance: compose.guidance ?? null,
      imageUrl: compose.currentAssetUrl ?? null,
      imageData: compose.currentAssetData ?? null,
      maskData: compose.currentMaskData ?? null,
    };
    const response = await editAvatarAsset(options);
    return { status: "ok", asset: response };
  },
  async fetch_context(input, runtime) {
    if (!runtime.contextEnabled) {
      return { status: "disabled", message: "Context is disabled for this request." };
    }
    const rawQuery = typeof input.query === "string" ? input.query.trim() : "";
    const query = rawQuery.length ? rawQuery : runtime.latestUserText;
    const includeCapsuleHistory =
      input.include_capsule_history === true || input.include_capsule_history === "true";

    const contextResult = await getChatContext({
      ownerId: runtime.ownerId,
      message: query,
      history: runtime.history,
      capsuleId: runtime.capsuleId ?? null,
    });
    const formatted = formatContextForPrompt(contextResult);
    const metadata = buildContextMetadata(contextResult);
    let capsuleSnippets: ChatMemorySnippet[] = [];
    if (includeCapsuleHistory && runtime.capsuleId) {
      capsuleSnippets = await getCapsuleHistorySnippets({
        capsuleId: runtime.capsuleId,
        limit: 4,
        query,
      });
    }
    return {
      status: "succeeded",
      query,
      metadata,
      prompt: formatted,
      snippets: contextResult?.snippets ?? [],
      capsuleSnippets,
    };
  },
  async search_web(input, runtime) {
    const rawQuery = typeof input.query === "string" ? input.query.trim() : "";
    const query = rawQuery.length ? rawQuery : runtime.latestUserText;
    const limitRaw = typeof input.limit === "number" ? input.limit : undefined;
    const limit = limitRaw && Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 6)) : 4;

    if (!query.trim().length) {
      throw new Error("search_web requires a query.");
    }
    if (!isWebSearchConfigured()) {
      return { status: "error", message: "Web search is not configured." };
    }

    const results = await searchWeb(query, { limit });
    if (!results.length) {
      return { status: "empty", query };
    }

    const [primary] = results;
    return {
      status: "succeeded",
      kind: "web",
      query,
      title: primary?.title ?? null,
      snippet: primary?.snippet ?? null,
      url: primary?.url ?? null,
      results,
    };
  },
};

function mapHistoryToMessages(history: ComposerChatMessage[], latestUserText: string): ChatMessage[] {
  if (!history.length) return [];
  const limit = selectHistoryLimit(latestUserText);
  return mapConversationToMessages(history, limit);
}

function buildSystemPrompt(context: CustomizerComposeContext, replyMode: "chat" | "draft" | null): string {
  const assetLabel =
    context.mode === "logo"
      ? "logo"
      : context.mode === "avatar"
        ? "avatar"
        : context.mode === "tile"
          ? "promo tile"
          : context.mode === "storeBanner"
          ? "store hero"
          : "banner";
  const base = [
    "You are Capsule's Customizer assistant with the full power of Capsules AI.",
    `Default to being a helpful ChatGPT: answer any question, use fetch_context to pull memories, and search_web for live facts when needed.`,
    `When the user wants visuals, collaborate to design their ${assetLabel} via render_banner / render_logo / render_avatar / edit_asset. Never fabricate URLs—only return those provided by tools.`,
    "When you are just replying in chat, output strict JSON: { action: \"chat_reply\", message }.",
    "When you generate or edit an asset, output strict JSON: { action: \"draft_post\", message, post }.",
    "Set post.kind to \"customizer\" and post.content to a short summary of the update.",
    "Inside post.customizerDraft include: { mode, assetUrl, assetKind, variantId, mimeType, message, suggestions }.",
    "Do not mention tool execution details in the final JSON message.",
    "If you need more details from the user, ask follow-up questions instead of guessing.",
  ];

  if (replyMode === "chat") {
    base.push(
      "User replyMode is chat-only: return { action: 'chat_reply', message } with no post or customizerDraft unless you actually generated/edited an asset this turn."
    );
  } else if (replyMode === "draft") {
    base.push(
      "User replyMode prefers drafting: return draft_post with an updated customizerDraft when possible; only use chat_reply if you truly need more info."
    );
  }

  return base.join(" ");
}

function assetKindForMode(mode: CapsuleCustomizerMode): "banner" | "logo" | "avatar" {
  if (mode === "logo") return "logo";
  if (mode === "avatar") return "avatar";
  return "banner";
}

function ensureDraft(
  input: unknown,
  mode: CapsuleCustomizerMode,
  latestAsset: AssetResponse | null,
): CustomizerDraft {
  const parsed = customizerDraftSchema.safeParse(input);
  const base: CustomizerDraft = parsed.success
    ? { ...parsed.data, mode }
    : { mode, asset: null, suggestions: [] };
  if (latestAsset) {
    base.asset = {
      kind: assetKindForMode(mode),
      url: latestAsset.url,
      mimeType: latestAsset.mimeType ?? null,
      variantId: latestAsset.variant?.id ?? null,
      message: latestAsset.message ?? null,
      imageData: latestAsset.imageData ?? null,
      variant: latestAsset.variant ?? null,
    };
  } else if (!base.asset) {
    base.asset = {
      kind: assetKindForMode(mode),
      url: null,
      mimeType: null,
      variantId: null,
      message: null,
      imageData: null,
      variant: null,
    };
  }
  return base;
}

export async function runCustomizerToolSession(
  options: CustomizerToolSessionOptions,
): Promise<{ response: PromptResponse; messages: ChatMessage[]; raw: unknown }> {
  const {
    ownerId,
    capsuleId,
    userText,
    history,
    incomingDraft,
    context,
    requestOrigin,
    replyMode = null,
    maxIterations = 6,
    callbacks,
    contextOptions = null,
    contextEnabled = true,
  } = options;
  let latestAsset: AssetResponse | null = null;
  const runtime: RuntimeContext = {
    ownerId,
    capsuleId: capsuleId ?? null,
    requestOrigin: requestOrigin ?? null,
    compose: context,
    setLatestAsset(asset: AssetResponse | null) {
      latestAsset = asset;
    },
    latestUserText: userText,
    history: history ?? [],
    contextEnabled,
  };
  const contextMessages = contextEnabled
    ? buildContextMessages({
        userCard: contextOptions?.userCard ?? null,
        contextPrompt: contextOptions?.contextPrompt ?? null,
        contextRecords: contextOptions?.contextRecords ?? [],
        contextMetadata: contextOptions?.contextMetadata ?? null,
      })
    : [];
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(context, replyMode) },
    ...contextMessages,
    ...mapHistoryToMessages(history ?? [], userText),
    {
      role: "user",
      content: JSON.stringify({
        instruction: userText,
        mode: context.mode,
        capsuleName: context.capsuleName ?? null,
        displayName: context.displayName ?? null,
        personaId: context.personaId ?? null,
        draft: incomingDraft ?? null,
        replyMode,
      }),
    },
  ];
  const emit = callbacks?.onEvent ?? (() => {});
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const { message, raw } = await callOpenAIToolChat(messages, TOOL_DEFINITIONS, {
      temperature: 0.4,
    });
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        const handler = TOOL_HANDLERS[call.function.name];
        if (!handler) {
          const failure = { status: "error", message: "Unknown tool." };
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(failure),
          });
          emit({ type: "tool_result", name: call.function.name, result: failure });
          continue;
        }
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(call.function.arguments ?? "{}");
        } catch {
          parsedArgs = {};
        }
        emit({ type: "tool_call", name: call.function.name, args: parsedArgs });
        try {
          const result = await handler(parsedArgs, runtime);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result ?? {}),
          });
          if (result && typeof result === "object" && "asset" in result) {
            runtime.setLatestAsset((result as { asset?: AssetResponse | null }).asset ?? null);
          }
          emit({ type: "tool_result", name: call.function.name, result });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "Tool execution failed unexpectedly.";
          const failure = { status: "error", message: messageText };
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(failure),
          });
          emit({ type: "tool_result", name: call.function.name, result: failure });
        }
      }
      continue;
    }
    const rawContent = typeof message.content === "string" ? message.content.trim() : "";
    const parsed = extractJSON<Record<string, unknown>>(rawContent);
    if (!parsed) {
      messages.push({
        role: "system",
        content: "Your reply was not valid JSON. Respond again with the required schema.",
      });
      emit({ type: "status", message: "Model returned invalid JSON." });
      continue;
    }
    try {
      const validated = promptResponseSchema.parse(parsed);
      if (validated.action === "chat_reply") {
        return { response: validated, messages, raw };
      }
      if (replyMode === "chat") {
        const postContent =
          typeof (validated.post as { content?: unknown })?.content === "string"
            ? ((validated.post as { content: string }).content ?? "").trim()
            : "";
        const messageText =
          postContent.length > 0
            ? postContent
            : typeof validated.message === "string" && validated.message.trim().length
              ? validated.message.trim()
              : "Here’s my take.";
        const coerced: PromptResponse = {
          action: "chat_reply",
          message: messageText,
          threadId: validated.threadId,
          history: validated.history,
          context: validated.context,
        };
        return { response: coerced, messages, raw };
      }
      // draft_post path
      const enrichedPost = {
        ...(validated.post ?? {}),
        customizerDraft: ensureDraft(
          (validated.post as { customizerDraft?: unknown })?.customizerDraft,
          context.mode,
          latestAsset,
        ),
      };
      const finalResponse: PromptResponse = {
        ...validated,
        post: enrichedPost,
      };
      return { response: finalResponse, messages, raw };
    } catch (error) {
      messages.push({
        role: "system",
        content:
          "The JSON you returned was invalid. Respond again using the draft_post schema with a customizerDraft payload, or chat_reply when only advising.",
      });
      emit({
        type: "status",
        message: error instanceof Error ? error.message : "Schema validation failed.",
      });
    }
  }
  throw new Error("Customizer tool session exceeded iteration limit.");
}
