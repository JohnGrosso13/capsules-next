import { PRICEBOOK } from "@/lib/billing/pricebook";

type ImageQuality = "low" | "medium" | "high";

function normalizeQuality(value: string | null | undefined): ImageQuality {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "low";
}

/**
 * Resolve credits for a single image generation based on the shared pricebook.
 * Falls back to the closest known rate and always returns at least 1 credit.
 */
export function imageCreditsForQuality(quality?: string | null): number {
  const q = normalizeQuality(quality);
  const rate = PRICEBOOK.openai.image.gptImage1Mini[q];
  const creditsPerUnit = rate?.creditsPerUnit ?? rate?.credits ?? 0;
  return Math.max(1, Math.ceil(creditsPerUnit));
}

type ComposerUsageImage = { quality?: string | null };
type ComposerUsageVideo = { seconds?: number | null; model?: string | null };

export type ComposerUsageSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string | null;
  images: ComposerUsageImage[];
  videos: ComposerUsageVideo[];
};

function textRatesForModel(model: string | null): {
  inputCreditsPerToken: number;
  outputCreditsPerToken: number;
} {
  const inputRate = PRICEBOOK.openai.text.gpt5Mini.inputPerMillion;
  const baseInput = inputRate.creditsPerUnit / inputRate.quantity;

  const modelName = (model ?? "").toLowerCase();
  if (modelName.includes("5.2-pro")) {
    const outputRate = PRICEBOOK.openai.text.gpt52Pro.outputPerMillion;
    return {
      inputCreditsPerToken: baseInput,
      outputCreditsPerToken: outputRate.creditsPerUnit / outputRate.quantity,
    };
  }
  if (modelName.includes("5.2")) {
    const outputRate = PRICEBOOK.openai.text.gpt52.outputPerMillion;
    return {
      inputCreditsPerToken: baseInput,
      outputCreditsPerToken: outputRate.creditsPerUnit / outputRate.quantity,
    };
  }
  const outputRate = PRICEBOOK.openai.text.gpt5Mini.outputPerMillion;
  return {
    inputCreditsPerToken: baseInput,
    outputCreditsPerToken: outputRate.creditsPerUnit / outputRate.quantity,
  };
}

function videoCreditsForSeconds(seconds: number, model?: string | null): number {
  const normalized = Math.max(0, seconds);
  const modelName = (model ?? "").toLowerCase();
  const rate =
    modelName.includes("pro")
      ? PRICEBOOK.openai.video.sora2.pro720PerSecond
      : PRICEBOOK.openai.video.sora2.basePerSecond;
  const creditsPerSecond = rate.creditsPerUnit / (rate.quantity || 1);
  return Math.max(0, normalized * creditsPerSecond);
}

export function computeComposerCredits(usage: ComposerUsageSummary | null | undefined): number {
  if (!usage) return 0;
  const { promptTokens, completionTokens, model, images, videos } = usage;
  const textRates = textRatesForModel(model);
  const textCredits =
    promptTokens * textRates.inputCreditsPerToken + completionTokens * textRates.outputCreditsPerToken;

  const imageCredits = (images ?? []).reduce((sum, img) => sum + imageCreditsForQuality(img.quality), 0);
  const videoCredits = (videos ?? []).reduce(
    (sum, video) => sum + videoCreditsForSeconds(video.seconds ?? 0, video.model),
    0,
  );

  return Math.max(1, Math.ceil(textCredits + imageCredits + videoCredits));
}

function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(seconds, 3 * 60 * 60); // cap at 3 hours for sanity
}

export function estimateAudioSecondsFromBase64(base64Audio: string | null | undefined): number {
  if (!base64Audio) return 0;
  const normalized = base64Audio.replace(/^data:[^,]+,/, "");
  const bufferLen = Math.floor((normalized.length * 3) / 4);
  const estimatedSeconds = bufferLen / 32000; // assume ~256 kbps (16k mono 16-bit)
  return clampSeconds(estimatedSeconds);
}

export function transcriptionCreditsFromSeconds(seconds: number): number {
  const sec = clampSeconds(seconds);
  const rate = PRICEBOOK.openai.transcription.gpt4oMiniPerMinute;
  const creditsPerSecond = (rate.creditsPerUnit / (rate.quantity || 1)) / 60;
  const credits = sec * creditsPerSecond;
  return Math.max(1, Math.ceil(credits));
}

export function transcriptionCreditsFromBase64(base64Audio: string | null | undefined): number {
  const seconds = estimateAudioSecondsFromBase64(base64Audio);
  return transcriptionCreditsFromSeconds(seconds || 60); // default to 1 minute if unknown
}

export function estimateTokensFromText(text: string | null | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean.length) return 0;
  return Math.max(1, Math.ceil(clean.length / 4)); // rough token estimate
}

export function memoryUpsertCredits(text: string | null | undefined): number {
  const tokens = estimateTokensFromText(text);
  if (!tokens) return 0;

  const textRates = textRatesForModel("gpt-5-mini");
  const textCredits = tokens * textRates.inputCreditsPerToken;

  const pineconeWriteRate = PRICEBOOK.pinecone.writeUnitsStandardPerMillion;
  const pineconeWriteCredits =
    tokens * (pineconeWriteRate.creditsPerUnit / (pineconeWriteRate.quantity || 1));

  const vectorBytes = 6144; // ~1536 dims * 4 bytes
  const textBytes = Math.max((text?.length ?? 0) * 2, 0);
  const payloadBytes = vectorBytes + textBytes;
  const storageRate = PRICEBOOK.pinecone.storageGbMonth;
  const storageCredits =
    (payloadBytes / (1024 * 1024 * 1024)) * (storageRate.creditsPerUnit / (storageRate.quantity || 1));

  return Math.max(1, Math.ceil(textCredits + pineconeWriteCredits + storageCredits));
}
