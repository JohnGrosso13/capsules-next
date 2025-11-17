"use client";

import type { ComposerImageQuality } from "@/lib/composer/image-settings";

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
  const json = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || !json?.url) {
    throw new Error(`Image generate failed (${response.status})`);
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
  const json = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || !json?.url) {
    throw new Error(`Image edit failed (${response.status})`);
  }
  return { url: json.url };
}
