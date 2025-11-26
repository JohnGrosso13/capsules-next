import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  sanitizeComposerChatAttachment,
  sanitizeComposerChatHistory,
  type ComposerChatAttachment,
} from "@/lib/composer/chat-types";
import { promptResponseSchema } from "@/shared/schemas/ai";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { runCustomizerToolSession, type CustomizerComposeContext } from "@/server/customizer/run";
import { deriveRequestOrigin } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().min(0).optional(),
  url: z.string(),
  thumbnailUrl: z.string().optional().nullable(),
  storageKey: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
  role: z.enum(["reference", "output"]).optional(),
  source: z.string().optional().nullable(),
  excerpt: z.string().optional().nullable(),
});

const historyMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const requestSchema = z.object({
  message: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
  post: z.record(z.string(), z.unknown()).optional().nullable(),
  attachments: z.array(attachmentSchema).optional(),
  history: z.array(historyMessageSchema).optional(),
  capsuleId: z.string().uuid().optional().nullable(),
  stream: z.boolean().optional(),
});

function sanitizeAttachments(
  input: z.infer<typeof attachmentSchema>[] | undefined,
): ComposerChatAttachment[] {
  if (!input || !Array.isArray(input)) return [];
  return input
    .map((entry) =>
      sanitizeComposerChatAttachment({
        ...entry,
        size:
          typeof entry.size === "number" && Number.isFinite(entry.size)
            ? entry.size
            : 0,
      }),
    )
    .filter(
      (attachment): attachment is ComposerChatAttachment =>
        Boolean(attachment),
    );
}

function buildComposeContext(options: Record<string, unknown> | undefined): CustomizerComposeContext {
  const raw = options?.customizer;
  if (!raw || typeof raw !== "object") {
    throw new Error("customizer options are required.");
  }
  const mode = (raw as { mode?: unknown }).mode;
  if (mode !== "banner" && mode !== "storeBanner" && mode !== "tile" && mode !== "logo" && mode !== "avatar") {
    throw new Error("customizer mode is required.");
  }
  const value = raw as Record<string, unknown>;
  const readString = (key: string): string | null => {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim().length) {
      return entry;
    }
    return null;
  };
  const readNumber = (key: string): number | null => {
    const entry = value[key];
    if (typeof entry === "number" && Number.isFinite(entry)) {
      return entry;
    }
    return null;
  };
  return {
    mode,
    capsuleName: readString("capsuleName"),
    displayName: readString("displayName"),
    personaId: readString("personaId"),
    stylePreset: readString("stylePreset"),
    seed: readNumber("seed"),
    guidance: readNumber("guidance"),
    variantId: readString("variantId"),
    currentAssetUrl: readString("currentAssetUrl"),
    currentAssetData: readString("currentAssetData"),
    currentMaskData: readString("currentMaskData"),
  };
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to customize your capsule.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { message, options, post, history, attachments, capsuleId, stream } = parsed.data;

  const rawReplyMode =
    options && typeof options === "object" && typeof (options as Record<string, unknown>).replyMode === "string"
      ? String((options as Record<string, unknown>).replyMode).toLowerCase()
      : null;
  const replyMode = rawReplyMode === "chat" || rawReplyMode === "draft" ? rawReplyMode : null;

  let composeContext: CustomizerComposeContext;
  try {
    composeContext = buildComposeContext(
      (options && typeof options === "object" ? (options as Record<string, unknown>) : undefined) ??
        {},
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid customizer options.";
    return returnError(400, "invalid_request", detail);
  }

  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;
  const historySanitized = history ? sanitizeComposerChatHistory(history) : [];
  const attachmentList = sanitizeAttachments(attachments);

  if (stream) {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      start: async (controller) => {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          const run = await runCustomizerToolSession({
            ownerId,
            capsuleId: capsuleId ?? null,
            userText: message,
            history: historySanitized,
            attachments: attachmentList,
            incomingDraft: replyMode === "chat" ? null : post ?? null,
            context: composeContext,
            requestOrigin,
            replyMode,
            callbacks: {
              onEvent: (event) => {
                send({ event: event.type, ...event });
              },
            },
          });
          send({ event: "done", payload: run.response });
          controller.close();
        } catch (error) {
          console.error("customizer_stream_failed", error);
          send({
            event: "error",
            error: "Capsule AI ran into an error customizing that.",
          });
          controller.close();
        }
      },
    });

    return new Response(streamBody, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const run = await runCustomizerToolSession({
      ownerId,
      capsuleId: capsuleId ?? null,
      userText: message,
      history: historySanitized,
      attachments: attachmentList,
      incomingDraft: replyMode === "chat" ? null : post ?? null,
      context: composeContext,
      requestOrigin,
      replyMode,
    });
    return validatedJson(promptResponseSchema, run.response);
  } catch (error) {
    console.error("customizer_prompt_failed", error);
    return returnError(502, "ai_error", "Capsule AI ran into an error customizing that.");
  }
}

export const runtime = "nodejs";
