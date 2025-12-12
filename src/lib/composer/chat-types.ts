import { ensurePollStructure } from "./draft";

export const COMPOSER_CHAT_ROLES = ["user", "assistant", "system"] as const;

export type ComposerChatRole = (typeof COMPOSER_CHAT_ROLES)[number];

export type ComposerChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null;
  storageKey?: string | null;
  sessionId?: string | null;
  role?: "reference" | "output";
  source?: string | null;
  excerpt?: string | null;
};

export type ComposerChatPoll = {
  question: string;
  options: string[];
  thumbnails?: (string | null)[] | null;
};

export type ComposerChatMessage = {
  id: string;
  role: ComposerChatRole;
  content: string;
  createdAt: string;
  attachments?: ComposerChatAttachment[] | null;
  poll?: ComposerChatPoll | null;
};

export type ComposerChatThread = {
  id: string;
  history: ComposerChatMessage[];
  updatedAt: string;
  draft: Record<string, unknown> | null;
  rawPost: Record<string, unknown> | null;
};

export function sanitizeComposerChatAttachment(
  value: unknown,
): ComposerChatAttachment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ComposerChatAttachment>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (typeof record.name !== "string" || !record.name.trim()) return null;
  if (typeof record.mimeType !== "string" || !record.mimeType.trim()) return null;
  const size =
    typeof record.size === "number" && Number.isFinite(record.size) && record.size >= 0
      ? record.size
      : 0;
  const url = typeof record.url === "string" && record.url.trim().length ? record.url.trim() : null;
  if (!url) return null;
  const role =
    typeof record.role === "string" && (record.role === "reference" || record.role === "output")
      ? (record.role as "reference" | "output")
      : "reference";
  const source =
    typeof record.source === "string" && record.source.trim().length ? record.source.trim() : null;
  const excerpt =
    typeof record.excerpt === "string" && record.excerpt.trim().length ? record.excerpt.trim() : null;
  return {
    id: record.id,
    name: record.name.trim(),
    mimeType: record.mimeType.trim(),
    size,
    url,
    thumbnailUrl:
      typeof record.thumbnailUrl === "string" && record.thumbnailUrl.trim().length
        ? record.thumbnailUrl.trim()
        : null,
    storageKey:
      typeof record.storageKey === "string" && record.storageKey.trim().length
        ? record.storageKey.trim()
        : null,
    sessionId:
      typeof record.sessionId === "string" && record.sessionId.trim().length
        ? record.sessionId.trim()
        : null,
    role,
    source,
    excerpt,
  };
}

function sanitizeComposerChatPoll(value: unknown): ComposerChatPoll | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { question?: unknown; options?: unknown; thumbnails?: unknown };
  const question =
    typeof record.question === "string" && record.question.trim().length
      ? record.question.trim()
      : "";
  const optionsRaw = Array.isArray(record.options) ? record.options : [];
  const options = optionsRaw
    .map((option) => {
      if (typeof option === "string") return option.trim();
      if (option == null) return "";
      return String(option).trim();
    })
    .filter((option) => option.length);
  const thumbnailsRaw = Array.isArray(record.thumbnails) ? record.thumbnails : [];
  const thumbnailsInput = thumbnailsRaw.map((entry) => {
    if (typeof entry === "string") return entry.trim();
    if (entry == null) return "";
    return String(entry).trim();
  });
  const structured = ensurePollStructure({
    kind: "poll",
    content: "",
    mediaUrl: null,
    mediaPrompt: null,
    poll: {
      question,
      options,
      thumbnails: thumbnailsInput,
    },
  });
  const normalizedQuestion = structured.question.trim();
  const normalizedOptions = structured.options.map((option) => option.trim());
  const normalizedThumbs = structured.thumbnails ?? [];
  const hasQuestion = normalizedQuestion.length > 0;
  const hasOptions = normalizedOptions.some((option) => option.length > 0);
  if (!hasQuestion && !hasOptions) return null;
  const cleanedOptions = normalizedOptions.filter((option) => option.length);
  const safeOptions = cleanedOptions.length ? cleanedOptions : [];
  const safeThumbs =
    safeOptions.length && normalizedThumbs.length
      ? safeOptions.map((_, index) => {
          const raw = normalizedThumbs[index];
          const value = typeof raw === "string" ? raw.trim() : "";
          return value.length ? value : null;
        })
      : [];
  return {
    question: normalizedQuestion,
    options: safeOptions.length ? safeOptions : ["Option 1", "Option 2"],
    ...(safeThumbs.length ? { thumbnails: safeThumbs } : {}),
  };
}

export function sanitizeComposerChatMessage(value: unknown): ComposerChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ComposerChatMessage>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  const role = COMPOSER_CHAT_ROLES.find((entry) => entry === record.role) ?? null;
  if (!role) return null;
  const content =
    typeof record.content === "string" && record.content.trim().length
      ? record.content
      : "";
  const createdAt =
    typeof record.createdAt === "string" && record.createdAt.trim().length
      ? record.createdAt
      : new Date().toISOString();
  const attachments = Array.isArray(record.attachments)
    ? record.attachments
        .map((attachment) => sanitizeComposerChatAttachment(attachment))
        .filter((attachment): attachment is ComposerChatAttachment => Boolean(attachment))
    : [];
  const poll = sanitizeComposerChatPoll((record as { poll?: unknown }).poll);
  return {
    id: record.id,
    role,
    content,
    createdAt,
    attachments: attachments.length ? attachments : null,
    ...(poll ? { poll } : {}),
  };
}

export function sanitizeComposerChatHistory(value: unknown): ComposerChatMessage[] {
  if (!Array.isArray(value)) return [];
  const sanitized: ComposerChatMessage[] = [];
  for (const entry of value) {
    const message = sanitizeComposerChatMessage(entry);
    if (message) sanitized.push(message);
  }
  return sanitized;
}
