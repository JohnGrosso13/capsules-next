"use client";

export function formatAttachmentSize(value: number | null | undefined): string {
  const size = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  if (size > 0) {
    return `${size} B`;
  }
  return "";
}
