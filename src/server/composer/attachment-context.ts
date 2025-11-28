import type { ComposerChatAttachment } from "@/lib/composer/chat-types";
import pdfParse from "pdf-parse";
import { ensureAccessibleMediaUrl } from "@/server/posts/media";

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
  "pdf",
]);

export type AttachmentContext = {
  id: string;
  name: string;
  snippet: string;
  mimeType: string;
  source?: string | null;
};

function extractExtension(name: string | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed.length) return null;
  const parts = trimmed.split(".");
  if (parts.length <= 1) return null;
  const ext = parts.pop();
  return ext ? ext.toLowerCase() : null;
}

function extractExtensionFromUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  const cleaned = url.split(/[?#]/)[0] ?? "";
  return extractExtension(cleaned);
}

function isLikelyTextAttachment(attachment: ComposerChatAttachment): boolean {
  const mime = (attachment.mimeType ?? "").toLowerCase();
  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return true;
  }
  const extension = extractExtension(attachment.name);
  if (extension && TEXT_EXTENSIONS.has(extension)) {
    return true;
  }
  const urlExtension = extractExtensionFromUrl(attachment.url);
  if (urlExtension && TEXT_EXTENSIONS.has(urlExtension)) {
    return true;
  }
  return false;
}

async function extractPdfText(blob: ArrayBuffer): Promise<string | null> {
  try {
    const parsed = await pdfParse(Buffer.from(blob));
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    if (!text.length) return null;
    return text;
  } catch (error) {
    console.warn("pdf parse failed", error);
    return null;
  }
}

async function fetchAttachmentText(
  attachment: ComposerChatAttachment,
  resolvedUrl?: string | null,
): Promise<string | null> {
  const targetUrl = resolvedUrl ?? attachment.url;
  if (!targetUrl) return null;
  try {
    const response = await fetch(targetUrl);
    if (!response.ok) return null;

    const lowerMime = (attachment.mimeType ?? "").toLowerCase();
    if (lowerMime.includes("pdf")) {
      const buffer = await response.arrayBuffer();
      return extractPdfText(buffer);
    }

    const raw = await response.text();
    return raw.trim().length ? raw.trim() : null;
  } catch (error) {
    console.warn("attachment fetch failed", {
      id: attachment.id,
      name: attachment.name,
      error,
    });
    return null;
  }
}

export async function buildAttachmentContext(
  attachments: ComposerChatAttachment[] | undefined | null,
): Promise<AttachmentContext[]> {
  if (!attachments || !attachments.length) return [];

  const candidates = attachments
    .filter((attachment) => (attachment.role ?? "reference") === "reference")
    .slice(0, ATTACHMENT_CONTEXT_LIMIT);

  const contexts = await Promise.all(
    candidates.map(async (attachment) => {
      const accessibleUrl = attachment.url ? await ensureAccessibleMediaUrl(attachment.url) : null;
      const excerpt =
        typeof attachment.excerpt === "string" && attachment.excerpt.trim().length
          ? attachment.excerpt.trim()
          : null;
      const mime = (attachment.mimeType ?? "").toLowerCase();

      if (excerpt) {
        return {
          id: attachment.id,
          name: attachment.name,
          snippet: excerpt.slice(0, ATTACHMENT_CONTEXT_CHAR_LIMIT),
          mimeType: mime,
          source: attachment.source ?? null,
        };
      }

      if (!isLikelyTextAttachment(attachment)) return null;

      const fetchedText = await fetchAttachmentText(attachment, accessibleUrl);
      if (!fetchedText) return null;

      return {
        id: attachment.id,
        name: attachment.name,
        snippet: fetchedText.slice(0, ATTACHMENT_CONTEXT_CHAR_LIMIT),
        mimeType: mime,
        source: attachment.source ?? null,
      };
    }),
  );

  const filtered: AttachmentContext[] = [];
  for (const entry of contexts) {
    if (!entry || !entry.id || !entry.name || !entry.snippet) continue;
    filtered.push({
      id: entry.id,
      name: entry.name,
      snippet: entry.snippet,
      mimeType: entry.mimeType,
      source: entry.source ?? null,
    });
  }
  return filtered;
}

export function formatAttachmentContextForPrompt(
  contexts: AttachmentContext[],
): { prompt: string; records: AttachmentContext[] } | null {
  if (!contexts.length) return null;

  const lines: string[] = ["Attachment context provided:"];
  contexts.forEach((entry, index) => {
    const header = [`Attachment #${index + 1}: \"${entry.name}\"`];
    if (entry.mimeType) header.push(`type: ${entry.mimeType}`);
    if (entry.source) header.push(`source: ${entry.source}`);
    lines.push(header.join(" | "));
    lines.push(entry.snippet);
    lines.push("---");
  });
  lines.push("Use these attachments to ground your answer and cite as [Attachment #n] when relevant.");

  return {
    prompt: lines.join("\n"),
    records: contexts,
  };
}
