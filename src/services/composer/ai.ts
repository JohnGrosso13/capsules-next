"use client";

import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import {
  promptResponseSchema,
  type PromptResponse,
} from "@/shared/schemas/ai";

export type CallAiPromptParams = {
  message: string;
  options?: Record<string, unknown>;
  post?: Record<string, unknown>;
  attachments?: PrompterAttachment[] | null;
  history?: ComposerChatMessage[];
  threadId?: string | null;
  capsuleId?: string | null;
  useContext?: boolean;
  stream?: boolean;
  onStreamMessage?: (content: string) => void;
  endpoint?: string;
};

export async function callAiPrompt({
  message,
  options,
  post,
  attachments,
  history,
  threadId,
  capsuleId,
  useContext = true,
  stream = false,
  onStreamMessage,
  endpoint = "/api/ai/prompt",
}: CallAiPromptParams): Promise<PromptResponse> {
  const prepStarted = performance.now();
  const baseBody: Record<string, unknown> = { message };
  if (options && Object.keys(options).length) baseBody.options = options;
  if (post) baseBody.post = post;
  if (attachments && attachments.length) {
    baseBody.attachments = attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
      storageKey: attachment.storageKey ?? null,
      sessionId: attachment.sessionId ?? null,
      role: attachment.role ?? "reference",
      source: attachment.source ?? "user",
      excerpt: attachment.excerpt ?? null,
    }));
  }
  if (history && history.length) {
    baseBody.history = history.map(({ attachments: entryAttachments, ...rest }) => {
      if (Array.isArray(entryAttachments) && entryAttachments.length) {
        return { ...rest, attachments: entryAttachments };
      }
      return rest;
    });
  }
  if (threadId) {
    baseBody.threadId = threadId;
  }
  if (capsuleId) {
    baseBody.capsuleId = capsuleId;
  }
  baseBody.useContext = useContext !== false;

  const prepMs = performance.now() - prepStarted;

  const runRequest = async (streamMode: boolean, allowFallback: boolean): Promise<PromptResponse> => {
    const body = { ...baseBody, ...(streamMode ? { stream: true } : {}) };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("ai_prompt_timeout"), 120000);

    const apiStarted = performance.now();
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: streamMode
        ? {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          }
        : { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch((error) => {
      clearTimeout(timeoutId);
      throw error;
    });
    clearTimeout(timeoutId);

    if (streamMode) {
      try {
        if (!response.ok || !response.body) {
          throw new Error(`Prompt request failed (${response.status})`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalPayload: PromptResponse | null = null;
        let streamError: Error | null = null;

        const processBuffer = (input: string) => {
          const parts = input.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payloadRaw = line.replace(/^data:\s*/, "");
            try {
              const event = JSON.parse(payloadRaw) as {
                event?: string;
                message?: string;
                content?: string;
                payload?: unknown;
                error?: string;
              };
              if (event.event === "partial" && typeof event.content === "string" && onStreamMessage) {
                onStreamMessage(event.content);
              } else if (
                event.event === "status" &&
                typeof event.message === "string" &&
                onStreamMessage
              ) {
                onStreamMessage(event.message);
              } else if (event.event === "done" && event.payload) {
                finalPayload = promptResponseSchema.parse(event.payload);
              } else if (event.event === "error") {
                throw new Error(event.error || "stream error");
              }
            } catch (error) {
              if (!streamError) {
                streamError = error instanceof Error ? error : new Error("Malformed stream event");
              }
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          processBuffer(buffer);
        }
        if (buffer.trim().length) {
          processBuffer(`${buffer}\n\n`);
        }
        const apiMs = performance.now() - apiStarted;
        console.info("composer_ai_request_timing", {
          prepMs: Math.round(prepMs),
          apiMs: Math.round(apiMs),
          attachments: attachments?.length ?? 0,
          stream: true,
        });
        if (streamError && !finalPayload) {
          throw streamError;
        }
        if (!finalPayload) {
          throw new Error("Prompt stream ended without final payload");
        }
        return finalPayload;
      } catch (error) {
        if (!allowFallback) throw error instanceof Error ? error : new Error(String(error));
        console.warn("Prompt stream failed, retrying without stream", error);
        return runRequest(false, false);
      }
    }

    const json = await response.json().catch(() => null);
    if (!response.ok || !json) {
      throw new Error(`Prompt request failed (${response.status})`);
    }
    const apiMs = performance.now() - apiStarted;
    console.info("composer_ai_request_timing", {
      prepMs: Math.round(prepMs),
      apiMs: Math.round(apiMs),
      attachments: attachments?.length ?? 0,
      stream: false,
    });
    return promptResponseSchema.parse(json);
  };

  return runRequest(stream, true);
}
