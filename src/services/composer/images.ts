"use client";

import type { ComposerImageQuality } from "@/lib/composer/image-settings";
import { toBillingClientError } from "@/lib/billing/client-errors";

export type ImageRunResult = {
  url: string;
};

type ImageRequestOptions = {
  quality?: ComposerImageQuality;
};

function buildRequestBody(promptOrInstruction: Record<string, unknown>, options?: ImageRequestOptions) {
  if (!options || (!options.quality)) {
    return JSON.stringify(promptOrInstruction);
  }
  return JSON.stringify({
    ...promptOrInstruction,
    options: {
      ...(options.quality ? { quality: options.quality } : {}),
    },
  });
}

export async function requestImageGeneration(
  prompt: string,
  options?: ImageRequestOptions,
): Promise<ImageRunResult> {
  const response = await fetch("/api/ai/image/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: buildRequestBody({ prompt }, options),
  });
  const json = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
  if (!response.ok || !json?.url) {
    const billingError = toBillingClientError(response.status, json);
    if (billingError) throw billingError;
    const message =
      (json && typeof json.message === "string" && json.message.trim().length
        ? json.message.trim()
        : null) ?? `Image generate failed (${response.status})`;
    throw new Error(message);
  }
  return { url: json.url };
}

export async function requestImageEdit({
  imageUrl,
  instruction,
  options,
}: {
  imageUrl: string;
  instruction: string;
  options?: ImageRequestOptions;
}): Promise<ImageRunResult> {
  const response = await fetch("/api/ai/image/edit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: buildRequestBody({ imageUrl, instruction }, options),
  });
  const json = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
  if (!response.ok || !json?.url) {
    const billingError = toBillingClientError(response.status, json);
    if (billingError) throw billingError;
    const message =
      (json && typeof json.message === "string" && json.message.trim().length
        ? json.message.trim()
        : null) ?? `Image edit failed (${response.status})`;
    throw new Error(message);
  }
  return { url: json.url };
}
