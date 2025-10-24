"use client";

import type { SummaryApiResponse, SummaryRequestPayload, SummaryResult } from "@/types/summary";

export async function requestSummary(payload: SummaryRequestPayload): Promise<SummaryApiResponse> {
  const response = await fetch("/api/ai/summary", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Summary request failed (${response.status})`);
  }

  const data = (await response.json().catch(() => null)) as SummaryApiResponse | null;
  if (!data || data.status !== "ok") {
    throw new Error("Summary response malformed.");
  }
  return data;
}

function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length);
}

export function normalizeSummaryResponse(data: SummaryApiResponse): SummaryResult {
  const highlights = sanitizeStringList(data.highlights);
  const insights = sanitizeStringList(data.insights);
  const nextActions = sanitizeStringList(data.nextActions);
  const hashtags = sanitizeStringList(data.hashtags).map((tag) => {
    const normalized = tag.replace(/^[#\s]+/, "");
    return normalized.length ? `#${normalized}` : tag;
  });

  return {
    summary: data.summary,
    highlights,
    hashtags,
    nextActions,
    insights,
    tone: data.tone,
    sentiment: data.sentiment,
    postTitle: data.postTitle,
    postPrompt: data.postPrompt,
    wordCount: data.wordCount,
    model: data.model,
    source: data.source,
  };
}
