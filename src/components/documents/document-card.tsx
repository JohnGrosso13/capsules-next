"use client";

import React from "react";
import {
  ArrowSquareOut,
  DownloadSimple,
  FileText,
  Sparkle,
  ListBullets,
} from "@phosphor-icons/react/dist/ssr";

import styles from "@/components/home.module.css";

export type DocumentAttachmentSource = {
  id: string;
  url: string;
  name: string | null;
  mimeType: string | null;
  meta: Record<string, unknown> | null;
  uploadSessionId: string | null;
};

export type DocumentCardData = {
  id: string;
  name: string;
  url: string;
  openUrl: string;
  downloadUrl: string;
  mimeType: string | null;
  extension: string | null;
  sizeBytes: number | null;
  sizeLabel: string | null;
  summary: string | null;
  snippet: string | null;
  versionLabel: string | null;
  viewCount: number | null;
  processingStatus: string | null;
  processingLabel: string | null;
  meta: Record<string, unknown> | null;
  uploadSessionId: string | null;
  storageKey: string | null;
};

type ProcessingStatus = {
  status: string | null;
  label: string | null;
};

function readMetaString(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!source || typeof source !== "object") return null;
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length) return trimmed;
    }
  }
  return null;
}

function readMetaNumber(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null {
  if (!source || typeof source !== "object") return null;
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function truncateText(text: string, max = 240): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`;
}

function formatBytes(bytes: number | null): string | null {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = value >= 10 ? Math.round(value) : Number(value.toFixed(1));
  return `${formatted} ${units[unitIndex]}`;
}

function deriveNameFromUrl(url: string): string | null {
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  const segments = withoutQuery.split("/");
  const last = segments.pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function inferExtensionFromName(name: string | null): string | null {
  if (!name) return null;
  const withoutQuery = name.split(/[?#]/)[0] ?? name;
  const lastDot = withoutQuery.lastIndexOf(".");
  if (lastDot === -1) return null;
  const ext = withoutQuery.slice(lastDot + 1).replace(/[^a-zA-Z0-9+]/g, "");
  if (!ext) return null;
  return ext.toUpperCase();
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/plain": "TXT",
  "text/markdown": "MD",
  "application/json": "JSON",
};

function deriveExtension(
  meta: Record<string, unknown> | null,
  providedName: string | null,
  url: string,
  mimeType: string | null,
): string | null {
  const fromMeta = readMetaString(meta, ["file_extension", "fileExtension", "extension"]);
  if (fromMeta) return fromMeta.toUpperCase();

  const fromProvided = inferExtensionFromName(providedName);
  if (fromProvided) return fromProvided;

  const fromMetaName = inferExtensionFromName(
    readMetaString(meta, ["file_original_name", "original_name", "fileName"]),
  );
  if (fromMetaName) return fromMetaName;

  const fromUrl = inferExtensionFromName(deriveNameFromUrl(url));
  if (fromUrl) return fromUrl;

  if (mimeType) {
    const mapped = MIME_EXTENSION_MAP[mimeType.toLowerCase()];
    if (mapped) return mapped;
    if (mimeType.startsWith("text/")) return "TXT";
  }

  return null;
}

function deriveFriendlyName(
  meta: Record<string, unknown> | null,
  providedName: string | null,
  url: string,
): string {
  const candidates = [
    providedName,
    readMetaString(meta, ["file_original_name", "original_name", "fileName"]),
    deriveNameFromUrl(url),
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.trim().length) return candidate.trim();
  }
  return "Attachment";
}

function extractDocumentSummary(
  meta: Record<string, unknown> | null,
): { summary: string | null; snippet: string | null } {
  if (!meta) return { summary: null, snippet: null };
  const summary =
    readMetaString(meta, [
      "memory_description",
      "summary",
      "document_summary",
      "ai_summary",
    ]) ?? null;

  let snippet = readMetaString(meta, ["preview_snippet", "snippet"]);
  const derived = (meta as { derived_assets?: unknown }).derived_assets;
  if (!snippet && Array.isArray(derived)) {
    for (const asset of derived) {
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) continue;
      const assetRecord = asset as Record<string, unknown>;
      const type = readMetaString(assetRecord, ["type"]);
      if (type && type.toLowerCase().startsWith("document.")) {
        const metadata = (assetRecord as { metadata?: unknown }).metadata;
        const snippetCandidate = readMetaString(
          metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
            : null,
          ["snippet", "preview", "excerpt"],
        );
        if (snippetCandidate) {
          snippet = snippetCandidate;
          break;
        }
      }
    }
  }

  if (!snippet) {
    const raw = readMetaString(meta, ["raw_text", "original_text", "text"]);
    if (raw) snippet = truncateText(raw, 220);
  }

  return { summary, snippet };
}

function formatProcessingStatus(statusRaw: string | null): ProcessingStatus {
  if (!statusRaw) return { status: null, label: null };
  const normalized = statusRaw.toLowerCase();
  switch (normalized) {
    case "running":
    case "processing":
      return { status: "running", label: "Processing" };
    case "queued":
      return { status: "queued", label: "Queued" };
    case "failed":
      return { status: "failed", label: "Failed" };
    case "skipped":
      return { status: "skipped", label: "Skipped" };
    case "completed":
      return { status: "completed", label: null };
    default:
      return { status: normalized, label: statusRaw };
  }
}

export function buildDocumentCardData(file: DocumentAttachmentSource): DocumentCardData {
  const meta = file.meta ? { ...file.meta } : null;
  const name = deriveFriendlyName(meta, file.name, file.url);
  const extension = deriveExtension(meta, name, file.url, file.mimeType);
  const sizeBytes = readMetaNumber(meta, ["file_size_bytes", "size_bytes", "content_length"]);
  const sizeLabel = formatBytes(sizeBytes);
  const { summary, snippet } = extractDocumentSummary(meta);
  const versionIndex = readMetaNumber(meta, ["version_index"]);
  const versionLabel =
    typeof versionIndex === "number" && Number.isFinite(versionIndex) && versionIndex > 1
      ? `v${Math.trunc(versionIndex)}`
      : null;
  const processingSource =
    meta && typeof meta.processing === "object" && !Array.isArray(meta.processing)
      ? (meta.processing as Record<string, unknown>)
      : null;
  const { status: processingStatus, label: processingLabel } = formatProcessingStatus(
    readMetaString(processingSource, ["status"]),
  );
  const viewCount = readMetaNumber(meta, ["view_count"]);
  const storageKey =
    readMetaString(meta, ["storage_key", "storageKey", "storage-path"]) ?? null;
  const sessionId =
    file.uploadSessionId ?? readMetaString(meta, ["upload_session_id", "session_id"]) ?? null;
  const memoryIdRaw =
    readMetaString(meta, ["memory_id"]) ??
    (meta && typeof (meta as { memory_id?: unknown }).memory_id === "number"
      ? String((meta as { memory_id: number }).memory_id)
      : null);
  const openUrl = memoryIdRaw ? `/api/memory/file/${encodeURIComponent(memoryIdRaw)}` : file.url;
  const downloadUrl = memoryIdRaw ? `${openUrl}?download=1` : file.url;

  return {
    id: file.id,
    name,
    url: file.url,
    openUrl,
    downloadUrl,
    mimeType: file.mimeType ?? null,
    extension,
    sizeBytes: sizeBytes ?? null,
    sizeLabel,
    summary,
    snippet,
    versionLabel,
    viewCount: viewCount ?? null,
    processingStatus,
    processingLabel,
    meta,
    uploadSessionId: sessionId ?? null,
    storageKey,
  };
}

export function buildPrompterAttachment(doc: DocumentCardData) {
  const size =
    doc.sizeBytes && Number.isFinite(doc.sizeBytes) ? Math.max(0, Math.floor(doc.sizeBytes)) : 0;
  return {
    id: doc.id,
    name: doc.name,
    mimeType: doc.mimeType ?? "application/octet-stream",
    size,
    url: doc.url,
    thumbnailUrl: null,
    storageKey: doc.storageKey ?? null,
    sessionId: doc.uploadSessionId ?? null,
    role: "reference" as const,
    source: "memory" as const,
    excerpt: doc.summary ?? doc.snippet ?? null,
  };
}

type DocumentAttachmentCardProps = {
  doc: DocumentCardData;
  formatCount(value?: number | null): string;
  onAsk(): void;
  onSummarize?: () => void;
  summarizePending?: boolean;
};

export function DocumentAttachmentCard({
  doc,
  formatCount,
  onAsk,
  onSummarize,
  summarizePending,
}: DocumentAttachmentCardProps) {
  const extensionLabel = doc.extension ? doc.extension.toUpperCase() : "FILE";
  const metaChips: string[] = [];
  if (doc.extension) metaChips.push(doc.extension.toUpperCase());
  if (doc.sizeLabel) metaChips.push(doc.sizeLabel);
  if (doc.versionLabel) metaChips.push(doc.versionLabel);
  const viewLabel =
    typeof doc.viewCount === "number" && doc.viewCount > 0
      ? `${formatCount(doc.viewCount)} views`
      : null;
  if (viewLabel) metaChips.push(viewLabel);
  const statusLabel = doc.processingLabel;
  const statusCode = doc.processingStatus;
  const hasPreview = Boolean(doc.summary || doc.snippet);

  return (
    <article className={styles.documentCard}>
      <header className={styles.documentHeader}>
        <div className={styles.documentIcon} aria-hidden>
          <FileText size={18} weight="duotone" />
          <span className={styles.documentExt}>{extensionLabel}</span>
        </div>
        <div className={styles.documentHeading}>
          <a
            href={doc.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.documentTitle}
            title={doc.name}
          >
            {doc.name}
          </a>
          <div className={styles.documentMetaRow}>
            {metaChips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
            {statusLabel ? (
              <span className={styles.documentStatus} data-status={statusCode ?? undefined}>
                {statusLabel}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      {doc.summary ? (
        <p className={styles.documentSummary} title={doc.summary}>
          {doc.summary}
        </p>
      ) : null}
      {doc.snippet && doc.snippet !== doc.summary ? (
        <p className={styles.documentSnippet} title={doc.snippet}>
          {doc.snippet}
        </p>
      ) : null}
      {!hasPreview ? (
        <p className={styles.documentEmpty}>No preview available yet.</p>
      ) : null}
      <div className={styles.documentActions}>
        {onSummarize ? (
          <button
            type="button"
            className={styles.documentActionSecondary}
            onClick={onSummarize}
            disabled={Boolean(summarizePending)}
            aria-label={`Summarize ${doc.name}`}
          >
            <span className={styles.documentActionIcon} aria-hidden>
              <ListBullets size={16} weight="duotone" />
            </span>
            <span>{summarizePending ? "Summarizing..." : "Summarize"}</span>
          </button>
        ) : null}
        <button
          type="button"
          className={styles.documentActionPrimary}
          onClick={onAsk}
          aria-label={`Ask GPT about ${doc.name}`}
        >
          <span className={styles.documentActionIcon} aria-hidden>
            <Sparkle size={16} weight="duotone" />
          </span>
          <span>Ask GPT</span>
        </button>
        <a
          href={doc.openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.documentActionSecondary}
          aria-label={`Open ${doc.name}`}
        >
          <span className={styles.documentActionIcon} aria-hidden>
            <ArrowSquareOut size={16} weight="bold" />
          </span>
          <span>Open</span>
        </a>
        <a
          href={doc.downloadUrl}
          download
          className={styles.documentActionSecondary}
          aria-label={`Download ${doc.name}`}
        >
          <span className={styles.documentActionIcon} aria-hidden>
            <DownloadSimple size={16} weight="bold" />
          </span>
          <span>Download</span>
        </a>
      </div>
    </article>
  );
}
