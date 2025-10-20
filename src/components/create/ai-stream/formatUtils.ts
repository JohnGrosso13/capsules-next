"use client";

export function formatJobDisplayName(value: string): string {
  if (!value) return "Automation job";
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (!part) return part;
      if (lower === "ai") return "AI";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function formatJobStatusLabel(value: string): string {
  if (!value) return "Pending";
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (!part) return part;
      if (lower === "ai") return "AI";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function computeElapsedSeconds(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return Math.round((endMs - startMs) / 1000);
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "--";
  return dateFormatter.format(new Date(parsed));
}

export function formatDuration(input: number | null | undefined): string {
  if (!input || input <= 0) return "--";
  const totalSeconds = Math.floor(input);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}
