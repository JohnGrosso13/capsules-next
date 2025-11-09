"use client";

import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import {
  promptResponseSchema,
  type PromptResponse,
} from "@/shared/schemas/ai";

const ATTACHMENT_CONTEXT_LIMIT = 2;
const ATTACHMENT_CONTEXT_CHAR_LIMIT = 2000;
const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/yaml"];
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "xml",
  "log",
  "ini",
]);

function extractExtension(name: string | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed.length) return null;
  const parts = trimmed.split(".");
  if (parts.length <= 1) return null;
  const ext = parts.pop();
  return ext ? ext.toLowerCase() : null;
}

function isLikelyTextAttachment(attachment: PrompterAttachment): boolean {
  const mime = (attachment.mimeType ?? "").toLowerCase();
  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return true;
  }
  const extension = extractExtension(attachment.name);
  if (extension && TEXT_EXTENSIONS.has(extension)) {
    return true;
  }
  return false;
}

async function buildAttachmentContext(
  attachments?: PrompterAttachment[] | null,
): Promise<Array<{ id: string; name: string; text: string }>> {
  if (!attachments || !attachments.length) return [];
  const collected: Array<{ id: string; name: string; text: string }> = [];

  for (const attachment of attachments) {
    if (collected.length >= ATTACHMENT_CONTEXT_LIMIT) break;
    const role = attachment.role ?? "reference";
    if (role !== "reference") continue;
    if (!attachment.url) continue;
    const excerpt =
      typeof attachment.excerpt === "string" && attachment.excerpt.trim().length
        ? attachment.excerpt.trim()
        : null;
    if (excerpt) {
      collected.push({
        id: attachment.id,
        name: attachment.name,
        text: excerpt.slice(0, ATTACHMENT_CONTEXT_CHAR_LIMIT),
      });
      continue;
    }
    if (!isLikelyTextAttachment(attachment)) continue;
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) continue;
      const raw = await response.text();
      const snippet = raw.slice(0, ATTACHMENT_CONTEXT_CHAR_LIMIT).trim();
      if (!snippet.length) continue;
      collected.push({
        id: attachment.id,
        name: attachment.name,
        text: snippet,
      });
    } catch {
      // Ignore fetch failures when building attachment context
    }
  }

  return collected;
}

export type CallAiPromptParams = {
  message: string;
  options?: Record<string, unknown>;
  post?: Record<string, unknown>;
  attachments?: PrompterAttachment[] | null;
  history?: ComposerChatMessage[];
  threadId?: string | null;
  capsuleId?: string | null;
  useContext?: boolean;
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
}: CallAiPromptParams): Promise<PromptResponse> {
  const contextSnippets = await buildAttachmentContext(attachments ?? undefined);
  let requestMessage = message;
  if (contextSnippets.length) {
    const contextText = contextSnippets
      .map(({ name, text }) => `Attachment "${name}":\n${text}`)
      .join("\n\n");
    requestMessage = `${message}\n\n---\nAttachment context provided:\n${contextText}`;
  }

  const body: Record<string, unknown> = { message: requestMessage };
  if (options && Object.keys(options).length) body.options = options;
  if (post) body.post = post;
  if (attachments && attachments.length) {
    const excerptMap = new Map(contextSnippets.map(({ id, text }) => [id, text]));
    body.attachments = attachments.map((attachment) => ({
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
      excerpt: attachment.excerpt ?? excerptMap.get(attachment.id) ?? null,
    }));
  }
  if (contextSnippets.length) {
    body.context = contextSnippets;
  }
  if (history && history.length) {
    body.history = history.map(({ attachments: entryAttachments, ...rest }) => {
      if (Array.isArray(entryAttachments) && entryAttachments.length) {
        return { ...rest, attachments: entryAttachments };
      }
      return rest;
    });
  }
  if (threadId) {
    body.threadId = threadId;
  }
  if (capsuleId) {
    body.capsuleId = capsuleId;
  }
  body.useContext = useContext !== false;

  const response = await fetch("/api/ai/prompt", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    throw new Error(`Prompt request failed (${response.status})`);
  }
  return promptResponseSchema.parse(json);
}
