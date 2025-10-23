import "server-only";

import { serverEnv } from "@/lib/env/server";

export type StabilityGenerateOptions = {
  prompt: string;
  aspectRatio: string;
  stylePreset: string | null;
  seed?: number | null;
  guidance?: number | null;
};

type StabilityResponse = {
  base64: string;
  mimeType: string;
  metadata: Record<string, unknown>;
};

const STABILITY_DEFAULT_MODEL = "sd3.5-large";
const STABILITY_BASE_URL =
  (serverEnv.STABILITY_BASE_URL && serverEnv.STABILITY_BASE_URL.trim().replace(/\/$/, "")) ||
  "https://api.stability.ai";

export function hasStabilityApiKey(): boolean {
  return typeof serverEnv.STABILITY_API_KEY === "string" && serverEnv.STABILITY_API_KEY.length > 0;
}

function requireStabilityKey(): string {
  if (!hasStabilityApiKey()) {
    throw new Error("Stability API key is not configured.");
  }
  return serverEnv.STABILITY_API_KEY!;
}

function mapStylePreset(styleId: string | null): string | undefined {
  if (!styleId) return undefined;
  const normalized = styleId.trim().toLowerCase();
  switch (normalized) {
    case "vibrant-future":
      return "dynamic";
    case "soft-pastel":
      return "soft";
    case "noir-spotlight":
      return "dramatic";
    case "minimal-matte":
      return "minimalist";
    default:
      return undefined;
  }
}

export async function generateStabilityImage(options: StabilityGenerateOptions): Promise<StabilityResponse> {
  const apiKey = requireStabilityKey();
  const model = serverEnv.STABILITY_IMAGE_MODEL || STABILITY_DEFAULT_MODEL;

  const payload: Record<string, unknown> = {
    prompt: options.prompt,
    model,
    aspect_ratio: options.aspectRatio,
    output_format: "png",
    mode: "text-to-image",
  };

  const stylePreset = mapStylePreset(options.stylePreset);
  if (stylePreset) {
    payload.style_preset = stylePreset;
  }
  if (typeof options.seed === "number" && Number.isFinite(options.seed)) {
    payload.seed = Math.max(0, Math.floor(options.seed));
  }
  if (typeof options.guidance === "number" && Number.isFinite(options.guidance)) {
    payload.cfg_scale = Math.max(0, Math.min(30, options.guidance));
  }

  const response = await fetch(`${STABILITY_BASE_URL}/v2beta/stable-image/generate/core`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    let meta: Record<string, unknown> = {};
    if (errorText) {
      try {
        meta = JSON.parse(errorText) as Record<string, unknown>;
      } catch {
        meta = { raw: errorText };
      }
    }
    const error = new Error(`Stability image error: ${response.status}`) as Error & {
      status?: number;
      meta?: Record<string, unknown>;
    };
    error.status = response.status;
    error.meta = meta;
    throw error;
  }

  const result = (await response.json()) as {
    artifacts?: Array<{ base64?: string; seed?: number; finish_reason?: string }>;
  };

  const artifact =
    Array.isArray(result.artifacts) && result.artifacts.length
      ? result.artifacts.find((entry) => typeof entry?.base64 === "string")
      : null;
  if (!artifact || typeof artifact.base64 !== "string" || !artifact.base64.length) {
    throw new Error("Stability image response missing artifact data.");
  }

  const metadata: Record<string, unknown> = {
    provider: "stability",
    model,
  };
  if (typeof artifact.seed === "number") {
    metadata.seed = artifact.seed;
  }
  if (artifact.finish_reason) {
    metadata.finishReason = artifact.finish_reason;
  }

  return {
    base64: artifact.base64,
    mimeType: "image/png",
    metadata,
  };
}
