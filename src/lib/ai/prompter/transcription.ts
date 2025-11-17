import { fetchOpenAI } from "@/adapters/ai/openai/server";
import { decodeBase64 } from "@/lib/base64";
import { serverEnv } from "@/lib/env/server";
import { requireOpenAIKey, type Json } from "./core";

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64
    .replace(/[\r\n\s]+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padLength = normalized.length % 4;
  const padded = padLength ? normalized + "=".repeat(4 - padLength) : normalized;

  return decodeBase64(padded);
}

function parseBase64Audio(
  input: string,
  fallbackMime: string | null,
): { bytes: Uint8Array; mime: string | null } {
  if (!input) {
    throw new Error("audio_base64 is required");
  }

  let base64 = input.trim();

  let detectedMime = fallbackMime || "";

  const dataUrlMatch = base64.match(/^data:([^;,]+)(?:;[^,]*)?,/i);

  if (dataUrlMatch) {
    const matchMime = dataUrlMatch[1];
    if (matchMime) {
      detectedMime = detectedMime || matchMime;
    }

    base64 = base64.slice(dataUrlMatch[0].length);
  }

  const bytes = decodeBase64ToUint8Array(base64);

  const mime = detectedMime || fallbackMime || "audio/webm";

  return { bytes, mime };
}

function audioExtensionFromMime(mime: string) {
  const value = mime.toLowerCase();

  if (value.includes("ogg")) return "ogg";

  if (value.includes("mp3") || value.includes("mpeg")) return "mp3";

  if (value.includes("mp4")) return "mp4";

  if (value.includes("wav")) return "wav";

  if (value.includes("m4a")) return "m4a";

  return "webm";
}

export async function transcribeAudioFromBase64({
  audioBase64,

  mime,
}: {
  audioBase64: string;

  mime: string | null;
}): Promise<{ text: string; model: string | null; raw: Json | null }> {
  requireOpenAIKey();

  const { bytes, mime: resolvedMime } = parseBase64Audio(audioBase64, mime);

  const audioBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([audioBuffer], { type: resolvedMime || "audio/webm" });

  const extension = audioExtensionFromMime(resolvedMime || "audio/webm");

  const filename = `recording.${extension}`;

  const models = Array.from(
    new Set(
      [serverEnv.OPENAI_TRANSCRIBE_MODEL, "gpt-4o-mini-transcribe", "whisper-1"].filter(Boolean),
    ),
  );

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const fd = new FormData();

      fd.append("file", blob, filename);

      fd.append("model", model);

      const response = await fetchOpenAI("/audio/transcriptions", {
        method: "POST",

        body: fd,
      });

      const json = (await response.json().catch(() => ({}))) as Json;

      if (!response.ok) {
        const payload = json as Record<string, unknown>;

        const rawError = payload?.error;

        let errorMessage = `OpenAI transcription error: ${response.status}`;

        if (typeof rawError === "string") {
          errorMessage = rawError;
        } else if (rawError && typeof rawError === "object" && "message" in rawError) {
          const maybeMessage = (rawError as { message?: unknown }).message;

          if (typeof maybeMessage === "string" && maybeMessage.length) {
            errorMessage = maybeMessage;
          }
        }

        const error = new Error(errorMessage);

        (error as Error & { meta?: Json; status?: number }).meta = json;

        (error as Error & { status?: number }).status = response.status;

        lastError = error;

        continue;
      }

      const record = json as Record<string, unknown>;

      const transcript =
        typeof record.text === "string"
          ? record.text
          : typeof record.transcript === "string"
            ? record.transcript
            : "";

      return { text: transcript.toString(), raw: json, model };
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (lastError) throw lastError;

  throw new Error("Transcription failed");
}
