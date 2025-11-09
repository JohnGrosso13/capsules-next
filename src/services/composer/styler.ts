"use client";

import {
  stylerResponseSchema,
  type StylerResponse,
} from "@/shared/schemas/ai";

export async function callStyler(
  prompt: string,
  envelope?: Record<string, unknown> | null,
): Promise<StylerResponse> {
  const body: Record<string, unknown> = { prompt };
  if (envelope && Object.keys(envelope).length) {
    body.user = envelope;
  }
  const response = await fetch("/api/ai/styler", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    throw new Error(`Styler request failed (${response.status})`);
  }
  return stylerResponseSchema.parse(json);
}
