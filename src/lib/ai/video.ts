import { postOpenAIJson, fetchOpenAI } from "@/adapters/ai/openai/server";
import { fetchRunway, hasRunwayApiKey, postRunwayJson } from "@/adapters/ai/runway/server";
import { getR2SignedObjectUrl } from "@/adapters/storage/r2/provider";
import { buildMuxPlaybackUrl, muxVideoClient } from "@/adapters/mux/server";
import { uploadBufferToStorage } from "@/lib/supabase/storage";
import { serverEnv } from "@/lib/env/server";
import { createAiVideoRun, updateAiVideoRun, type AiVideoRunAttempt } from "@/server/ai/video-runs";
import { indexMemory } from "@/server/memories/service";

const DEFAULT_VIDEO_MODEL = "sora-2";
const ALLOWED_VIDEO_MODELS = new Set(["sora-2", "sora-2-pro"]);
const ALLOWED_RESOLUTIONS = ["720x1280", "1280x720", "1024x1792", "1792x1024"] as const;
const DEFAULT_RESOLUTION: (typeof ALLOWED_RESOLUTIONS)[number] = "1280x720";
const ALLOWED_DURATIONS = [4, 8, 12] as const;
const DEFAULT_DURATION = 8;
const POLL_INTERVAL_MS = 8000;
const MAX_POLL_ITERATIONS = 120; // ~16 minutes at 8s polling
const MAX_VIDEO_JOB_ATTEMPTS = 2;
const RETRY_DELAY_MS = 4000;
const RETRYABLE_VIDEO_ERROR_CODES = new Set(["video_generation_failed"]);

const RUNWAY_DEFAULT_MODEL = "gen-4-aleph";
const RUNWAY_POLL_INTERVAL_MS = 7000;
const RUNWAY_MAX_POLL_ITERATIONS = 160; // ~18 minutes
const RUNWAY_DEFAULT_RESOLUTION: (typeof ALLOWED_RESOLUTIONS)[number] = "1280x720";
const RUNWAY_DEFAULT_DURATION = 8;

type OpenAIVideoJobStatus = "queued" | "in_progress" | "completed" | "failed" | string;

type OpenAIVideoJob = {
  id: string;
  object: "video" | string;
  model: string | null;
  prompt: string;
  status: OpenAIVideoJobStatus;
  progress?: number | null;
  seconds?: string | null;
  size?: string | null;
  created_at?: number | null;
  completed_at?: number | null;
  expires_at?: number | null;
  error?: { code?: string; message?: string; type?: string } | null;
};

type VideoRunContext = {
  capsuleId?: string | null;
  ownerUserId?: string | null;
  mode: "generate" | "edit";
  sourceUrl?: string | null;
  options?: Record<string, unknown>;
};

type RunwayGenerationStatus = "pending" | "running" | "succeeded" | "failed" | "canceled" | string;

type RunwayGeneration = {
  id: string;
  status: RunwayGenerationStatus;
  output?: unknown;
  error?: { message?: string; type?: string } | string | null;
  assets?: {
    video?: string | null;
    thumbnail?: string | null;
    poster?: string | null;
  };
};

export type VideoGenerationResult = {
  url: string;
  playbackUrl: string;
  posterUrl: string | null;
  provider: string;
  runId: string | null;
  model: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  memoryId: string | null;
  runStatus?: "running" | "succeeded" | "failed";
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveVideoModel(): string {
  const raw = serverEnv.OPENAI_VIDEO_MODEL?.trim() || "";
  if (raw && ALLOWED_VIDEO_MODELS.has(raw)) return raw;
  if (raw && !ALLOWED_VIDEO_MODELS.has(raw)) {
    console.warn(`Unsupported video model "${raw}", falling back to ${DEFAULT_VIDEO_MODEL}.`);
  }
  return DEFAULT_VIDEO_MODEL;
}

function resolveVideoResolution(): (typeof ALLOWED_RESOLUTIONS)[number] {
  const raw = serverEnv.OPENAI_VIDEO_RESOLUTION?.trim() || "";
  if (ALLOWED_RESOLUTIONS.includes(raw as (typeof ALLOWED_RESOLUTIONS)[number])) {
    return raw as (typeof ALLOWED_RESOLUTIONS)[number];
  }
  if (raw && !ALLOWED_RESOLUTIONS.includes(raw as (typeof ALLOWED_RESOLUTIONS)[number])) {
    console.warn(`Unsupported video resolution "${raw}", using ${DEFAULT_RESOLUTION}.`);
  }
  return DEFAULT_RESOLUTION;
}

function resolveVideoDuration(): (typeof ALLOWED_DURATIONS)[number] {
  const raw = Number(serverEnv.OPENAI_VIDEO_MAX_DURATION ?? DEFAULT_DURATION);
  if (ALLOWED_DURATIONS.includes(raw as (typeof ALLOWED_DURATIONS)[number])) {
    return raw as (typeof ALLOWED_DURATIONS)[number];
  }
  const nearest = ALLOWED_DURATIONS.reduce((prev, current) =>
    Math.abs(current - raw) < Math.abs(prev - raw) ? current : prev,
  );
  if (!Number.isNaN(raw) && raw !== DEFAULT_DURATION) {
    console.warn(`Video duration ${raw}s is not supported. Using closest allowed value: ${nearest}s.`);
  }
  return nearest;
}

function resolveRunwayVideoModel(): string {
  return (serverEnv.RUNWAY_VIDEO_MODEL ?? RUNWAY_DEFAULT_MODEL).trim();
}

function resolveRunwayVideoResolution(): (typeof ALLOWED_RESOLUTIONS)[number] {
  const raw = serverEnv.RUNWAY_VIDEO_RESOLUTION?.trim() ?? "";
  if (ALLOWED_RESOLUTIONS.includes(raw as (typeof ALLOWED_RESOLUTIONS)[number])) {
    return raw as (typeof ALLOWED_RESOLUTIONS)[number];
  }
  return RUNWAY_DEFAULT_RESOLUTION;
}

function resolveRunwayVideoDuration(): (typeof ALLOWED_DURATIONS)[number] {
  const raw = Number(serverEnv.RUNWAY_VIDEO_MAX_DURATION ?? RUNWAY_DEFAULT_DURATION);
  if (ALLOWED_DURATIONS.includes(raw as (typeof ALLOWED_DURATIONS)[number])) {
    return raw as (typeof ALLOWED_DURATIONS)[number];
  }
  return RUNWAY_DEFAULT_DURATION;
}

function normalizeSeconds(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function ingestVideoThroughMux(sourceUrl: string): Promise<{
  playbackUrl: string;
  playbackId: string | null;
  assetId: string | null;
  posterUrl: string | null;
}> {
  try {
    const mux = muxVideoClient();
    const asset = await mux.assets.create({
      inputs: [{ url: sourceUrl }],
      playback_policy: ["public"],
    });
    let current = asset;
    const maxWaitMs = 180_000;
    const start = Date.now();
    while (current.status !== "ready" && current.status !== "errored") {
      if (Date.now() - start > maxWaitMs) {
        throw new Error("Mux asset processing timed out");
      }
      await wait(5000);
      current = await mux.assets.retrieve(current.id);
    }
    if (current.status === "errored") {
      throw new Error("Mux asset processing failed");
    }
    const playbackId = current.playback_ids?.[0]?.id ?? null;
    const playbackUrl =
      playbackId && buildMuxPlaybackUrl(playbackId, { extension: "m3u8" })
        ? buildMuxPlaybackUrl(playbackId, { extension: "m3u8" })!
        : sourceUrl;
    const posterUrl = playbackId
      ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1`
      : null;
    return {
      playbackUrl,
      playbackId,
      assetId: current.id ?? null,
      posterUrl,
    };
  } catch (error) {
    console.warn("Mux ingestion failed, using source URL", error);
    return {
      playbackUrl: sourceUrl,
      playbackId: null,
      assetId: null,
      posterUrl: null,
    };
  }
}

async function createVideoJob(prompt: string, options: { model: string; size: string; seconds: number }) {
  const payload = {
    model: options.model,
    prompt,
    size: options.size,
    seconds: String(options.seconds),
  };

  const response = await postOpenAIJson<OpenAIVideoJob>("/videos", payload);
  if (!response.ok || !response.data) {
    const message = (response.data as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? response.rawBody ?? "Failed to create video job.");
  }
  return response.data;
}

async function retrieveVideoJob(videoId: string): Promise<OpenAIVideoJob> {
  const response = await fetchOpenAI(`/videos/${encodeURIComponent(videoId)}`, { method: "GET" });
  const json = (await response.json().catch(() => null)) as OpenAIVideoJob | null;
  if (!response.ok || !json) {
    throw new Error(`Failed to fetch video job ${videoId} (${response.status}).`);
  }
  return json;
}

async function downloadVideoContent(
  videoId: string,
  variant?: "thumbnail" | "spritesheet",
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const query = variant ? `?variant=${encodeURIComponent(variant)}` : "";
  const response = await fetchOpenAI(
    `/videos/${encodeURIComponent(videoId)}/content${query}`,
    { method: "GET" },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to download video content (${response.status}${body ? `: ${body}` : ""}).`,
    );
  }
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type");
  return { bytes: new Uint8Array(buffer), contentType };
}

function parseResolution(value: string | null | undefined): { width: number; height: number } {
  const fallback = { width: 1280, height: 720 };
  if (!value) return fallback;
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return fallback;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return fallback;
  return { width, height };
}

async function downloadRemoteAsset(url: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to download asset (${response.status}${body ? `: ${body}` : ""})`);
  }
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type");
  return { bytes: new Uint8Array(buffer), contentType };
}

async function persistVideoAsset(params: {
  runId: string;
  ownerUserId?: string | null;
  video: { bytes: Uint8Array; contentType: string | null };
  thumbnail?: { bytes: Uint8Array; contentType: string | null } | null;
}): Promise<{
  playbackUrl: string;
  playbackId: string | null;
  assetId: string | null;
  posterUrl: string | null;
  storageUrl: string;
  storageKey: string | null;
  thumbnailUrl: string | null;
  sizeBytes: number;
}> {
  const videoContentType = params.video.contentType ?? "video/mp4";
  const ownerId = params.ownerUserId ?? undefined;
  const videoUpload = await uploadBufferToStorage(params.video.bytes, videoContentType, "ai-video", {
    ...(ownerId ? { ownerId } : {}),
    kind: "ai-video",
    metadata: { video_run_id: params.runId },
  });

  const storageKey = videoUpload.key ?? null;
  const muxSourceUrl =
    storageKey && typeof getR2SignedObjectUrl === "function"
      ? await getR2SignedObjectUrl(storageKey).catch(() => videoUpload.url)
      : videoUpload.url;

  const ingestion = await ingestVideoThroughMux(muxSourceUrl);

  let thumbnailUrl: string | null = null;
  if (params.thumbnail) {
    try {
      const thumbUpload = await uploadBufferToStorage(
        params.thumbnail.bytes,
        params.thumbnail.contentType ?? "image/jpeg",
        "ai-video-thumb",
        {
          ...(ownerId ? { ownerId } : {}),
          kind: "ai-video-thumb",
          metadata: { video_run_id: params.runId },
        },
      );
      thumbnailUrl = thumbUpload.url;
    } catch (error) {
      console.warn("Failed to upload video thumbnail", error);
    }
  }

  const posterUrl = ingestion.posterUrl ?? thumbnailUrl;
  const playbackUrl = ingestion.playbackUrl || videoUpload.url;

  return {
    playbackUrl,
    playbackId: ingestion.playbackId,
    assetId: ingestion.assetId,
    posterUrl,
    storageUrl: videoUpload.url,
    storageKey,
    thumbnailUrl,
    sizeBytes: params.video.bytes.byteLength,
  };
}

async function runOpenAIVideoPipeline(
  prompt: string,
  context: VideoRunContext,
): Promise<VideoGenerationResult> {
  const model = resolveVideoModel();
  const resolution = resolveVideoResolution();
  const durationSeconds = resolveVideoDuration();

  const runRecord = await createAiVideoRun({
    ownerUserId: context.ownerUserId ?? null,
    capsuleId: context.capsuleId ?? null,
    mode: context.mode,
    sourceUrl: context.sourceUrl ?? null,
    userPrompt: prompt,
    resolvedPrompt: prompt,
    provider: "openai",
    model,
    options: {
      resolution,
      seconds: durationSeconds,
      ...(context.options ?? {}),
    },
    status: "pending",
  });

  const baseAttemptIndex = runRecord.attempts?.length ?? 0;
  let attempts: AiVideoRunAttempt[] = runRecord.attempts ?? [];
  let lastError: Error | null = null;

  for (let attemptIndex = 0; attemptIndex < MAX_VIDEO_JOB_ATTEMPTS; attemptIndex += 1) {
    const attemptNumber = baseAttemptIndex + attemptIndex + 1;
    const attempt: AiVideoRunAttempt = {
      attempt: attemptNumber,
      stage: context.mode === "edit" ? "edit" : "generate",
      model,
      provider: "openai",
      startedAt: new Date().toISOString(),
    };

    attempts = [...attempts, attempt];
    await updateAiVideoRun(runRecord.id, {
      status: "running",
      attempts,
      errorCode: null,
      errorMessage: null,
    });

    let job: OpenAIVideoJob;
    try {
      job = await createVideoJob(prompt, { model, size: resolution, seconds: durationSeconds });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video generation failed.";
      const failureAttempt: AiVideoRunAttempt = {
        ...attempt,
        completedAt: new Date().toISOString(),
        errorMessage: message,
      };
      attempts = [...attempts.slice(0, -1), failureAttempt];
      const shouldRetry = attemptIndex + 1 < MAX_VIDEO_JOB_ATTEMPTS;
      await updateAiVideoRun(runRecord.id, {
        status: shouldRetry ? "running" : "failed",
        errorMessage: message,
        errorCode: null,
        attempts,
        ...(shouldRetry ? {} : { completedAt: new Date().toISOString() }),
      });
      lastError = new Error(`OpenAI video generation failed: ${message}`);
      if (shouldRetry) {
        await wait(RETRY_DELAY_MS);
        continue;
      }
      throw lastError;
    }

    let status = job.status;
    let polledJob = job;
    let pollCount = 0;
    let failed = false;
    while (status !== "completed") {
      if (status === "failed") {
        failed = true;
        const errorCode = polledJob.error?.code ?? null;
        const message = polledJob.error?.message ?? "OpenAI video generation failed.";
        const failureAttempt: AiVideoRunAttempt = {
          ...attempt,
          completedAt: new Date().toISOString(),
          errorCode,
          errorMessage: message,
        };
        attempts = [...attempts.slice(0, -1), failureAttempt];
        const shouldRetry =
          attemptIndex + 1 < MAX_VIDEO_JOB_ATTEMPTS && RETRYABLE_VIDEO_ERROR_CODES.has(errorCode ?? "");
        await updateAiVideoRun(runRecord.id, {
          status: shouldRetry ? "running" : "failed",
          errorCode,
          errorMessage: message,
          responseMetadata: polledJob as unknown as Record<string, unknown>,
          attempts,
          ...(shouldRetry ? {} : { completedAt: new Date().toISOString() }),
        });
        lastError = new Error(`OpenAI video generation failed (${errorCode ?? "unknown"}): ${message}`);
        if (shouldRetry) {
          await wait(RETRY_DELAY_MS);
          break;
        }
        throw lastError;
      }
      if (pollCount >= MAX_POLL_ITERATIONS) {
        const timeoutMessage = "Video generation timed out.";
        const failureAttempt: AiVideoRunAttempt = {
          ...attempt,
          completedAt: new Date().toISOString(),
          errorMessage: timeoutMessage,
        };
        attempts = [...attempts.slice(0, -1), failureAttempt];
        await updateAiVideoRun(runRecord.id, {
          status: "failed",
          errorMessage: timeoutMessage,
          attempts,
          completedAt: new Date().toISOString(),
        });
        lastError = new Error(timeoutMessage);
        throw lastError;
      }
      await wait(POLL_INTERVAL_MS);
      pollCount += 1;
      polledJob = await retrieveVideoJob(job.id);
      status = polledJob.status;
    }

    if (failed) {
      // We already set state and decided whether to retry.
      continue;
    }

    await updateAiVideoRun(runRecord.id, {
      status: "uploading",
      responseMetadata: polledJob as unknown as Record<string, unknown>,
    });

    const videoContent = await downloadVideoContent(polledJob.id);
  let thumbnailContent: { bytes: Uint8Array; contentType: string | null } | null = null;
  try {
    thumbnailContent = await downloadVideoContent(polledJob.id, "thumbnail");
  } catch (error) {
    console.warn("Failed to fetch video thumbnail", error);
  }

  const persisted = await persistVideoAsset({
    runId: runRecord.id,
    ownerUserId: context.ownerUserId ?? null,
    video: videoContent,
    thumbnail: thumbnailContent,
  });

    const completedAttempt: AiVideoRunAttempt = {
      ...attempt,
      completedAt: new Date().toISOString(),
    };

  const playbackUrl =
    persisted.playbackUrl ||
    buildMuxPlaybackUrl(persisted.playbackId ?? undefined, { extension: "m3u8" }) ||
    persisted.storageUrl;
  const fallbackMp4 =
    buildMuxPlaybackUrl(persisted.playbackId ?? undefined, { extension: "mp4" }) ?? playbackUrl;

  let memoryId: string | null = null;
  if (context.ownerUserId) {
    const memoryMediaUrl = playbackUrl ?? persisted.storageUrl ?? null;
    if (memoryMediaUrl) {
      try {
        memoryId = await indexMemory({
          ownerId: context.ownerUserId,
          kind: "video",
          mediaUrl: memoryMediaUrl,
          mediaType: "video/mp4",
          title: context.mode === "edit" ? "Edited AI clip" : "Generated AI clip",
          description: prompt,
          postId: null,
          metadata: {
            muxAssetId: persisted.assetId,
            muxPlaybackId: persisted.playbackId,
            posterUrl: persisted.posterUrl ?? persisted.thumbnailUrl ?? null,
            durationSeconds: normalizeSeconds(polledJob.seconds),
            videoRunId: runRecord.id,
            storageKey: persisted.storageKey,
          },
          rawText: prompt,
          source: context.mode === "edit" ? "ai-video.edit" : "ai-video.generate",
          tags: ["ai", "video"],
        });
      } catch (memoryError) {
        console.warn("ai_video_memory_index_failed", memoryError);
      }
    }
  }

  const responseMetadata: Record<string, unknown> = {
    playbackUrl: playbackUrl ?? fallbackMp4,
    posterUrl: persisted.posterUrl ?? persisted.thumbnailUrl ?? null,
    muxAssetId: persisted.assetId,
    muxPlaybackId: persisted.playbackId,
    storageUrl: persisted.storageUrl,
    storageKey: persisted.storageKey,
  };
  if (memoryId) {
    responseMetadata.memoryId = memoryId;
  }

  const durationSecondsValue = normalizeSeconds(polledJob.seconds);

    attempts = [...attempts.slice(0, -1), completedAttempt];
    await updateAiVideoRun(runRecord.id, {
      status: "succeeded",
      videoUrl: playbackUrl,
      thumbnailUrl: persisted.posterUrl ?? persisted.thumbnailUrl ?? null,
      muxAssetId: persisted.assetId,
      muxPlaybackId: persisted.playbackId,
      muxPosterUrl: persisted.posterUrl,
      durationSeconds: durationSecondsValue,
      sizeBytes: persisted.sizeBytes ?? null,
      responseMetadata,
      attempts,
      completedAt: new Date().toISOString(),
    });

    return {
      url: fallbackMp4 ?? playbackUrl,
      playbackUrl,
      posterUrl: persisted.posterUrl ?? persisted.thumbnailUrl ?? null,
      provider: "openai",
      runId: runRecord.id,
      model,
      thumbnailUrl: persisted.thumbnailUrl ?? persisted.posterUrl ?? null,
      durationSeconds: durationSecondsValue,
      muxAssetId: persisted.assetId,
      muxPlaybackId: persisted.playbackId,
      memoryId,
      runStatus: "succeeded",
    };
  }

  throw lastError ?? new Error("OpenAI video generation failed after retries.");
}

function extractRunwayOutputs(generation: RunwayGeneration): {
  videoUrl: string | null;
  thumbnailUrl: string | null;
} {
  const outputs = (() => {
    if (Array.isArray(generation.output)) return generation.output;
    if (generation.output && typeof generation.output === "object") {
      return Object.values(generation.output as Record<string, unknown>);
    }
    return [];
  })();
  const candidates = outputs
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof (entry as { url?: unknown }).url === "string") {
        return ((entry as { url: string }).url ?? "").trim();
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry && entry.trim().length));

  const assetVideo: string | null =
    typeof generation.assets?.video === "string" && generation.assets.video.trim().length
      ? generation.assets.video.trim()
      : null;
  const assetThumb: string | null =
    typeof generation.assets?.thumbnail === "string" && generation.assets.thumbnail.trim().length
      ? generation.assets.thumbnail.trim()
      : typeof generation.assets?.poster === "string" && generation.assets.poster.trim().length
        ? generation.assets.poster.trim()
        : null;

  const primary = candidates.length > 0 ? candidates[0] ?? null : null;
  const secondary = candidates.length > 1 ? candidates[1] ?? null : null;

  return {
    videoUrl: primary ?? assetVideo ?? null,
    thumbnailUrl: assetThumb ?? secondary ?? null,
  };
}

async function createRunwayVideoJob(
  prompt: string,
  sourceUrl: string | null,
  options: { resolution: string; seconds: number; sourceKind?: "video" | "image" | null },
): Promise<RunwayGeneration> {
  const { width, height } = parseResolution(options.resolution);
  const sourceKind = options.sourceKind ?? (sourceUrl ? "video" : null);
  const payload: Record<string, unknown> = {
    model: resolveRunwayVideoModel(),
    input: {
      prompt,
      ...(sourceUrl
        ? sourceKind === "image"
          ? { image: sourceUrl, mode: "image_to_video" }
          : { video: sourceUrl, mode: "video_to_video" }
        : { mode: "text_to_video" }),
      width,
      height,
      seconds: options.seconds,
    },
    output: {
      format: "mp4",
    },
  };

  const response = await postRunwayJson<RunwayGeneration>("/generations", payload);
  if (!response.ok || !response.data) {
    const message =
      (response.parsedBody as { message?: string } | null)?.message ??
      (typeof response.rawBody === "string" && response.rawBody.length ? response.rawBody : null) ??
      "Failed to create Runway video job.";
    throw new Error(message);
  }
  return response.data;
}

async function retrieveRunwayGeneration(id: string): Promise<RunwayGeneration> {
  const response = await fetchRunway(`/generations/${encodeURIComponent(id)}`, { method: "GET" });
  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Runway generation ${id} lookup failed (${response.status}): ${raw}`);
  }
  try {
    return JSON.parse(raw) as RunwayGeneration;
  } catch {
    throw new Error("Runway generation response could not be parsed.");
  }
}

async function runRunwayVideoPipeline(
  prompt: string,
  context: VideoRunContext,
): Promise<VideoGenerationResult> {
  const resolution = resolveRunwayVideoResolution();
  const durationSeconds = resolveRunwayVideoDuration();

  const runRecord = await createAiVideoRun({
    ownerUserId: context.ownerUserId ?? null,
    capsuleId: context.capsuleId ?? null,
    mode: context.mode,
    sourceUrl: context.sourceUrl ?? null,
    userPrompt: prompt,
    resolvedPrompt: prompt,
    provider: "runway",
    model: resolveRunwayVideoModel(),
    options: {
      resolution,
      seconds: durationSeconds,
      ...(context.options ?? {}),
    },
    status: "pending",
  });

  let attempts: AiVideoRunAttempt[] = runRecord.attempts ?? [];
  const attempt: AiVideoRunAttempt = {
    attempt: (attempts?.length ?? 0) + 1,
    stage: context.mode === "edit" ? "edit" : "generate",
    model: resolveRunwayVideoModel(),
    provider: "runway",
    startedAt: new Date().toISOString(),
  };
  attempts = [...attempts, attempt];
  await updateAiVideoRun(runRecord.id, { status: "running", attempts });

  let job: RunwayGeneration;
  try {
    job = await createRunwayVideoJob(
      prompt,
      context.sourceUrl ?? null,
      {
        resolution,
        seconds: durationSeconds,
        sourceKind:
          typeof context.options?.sourceKind === "string"
            ? (context.options.sourceKind as "video" | "image")
            : context.sourceUrl
              ? "video"
              : null,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runway video generation failed.";
    const failureAttempt: AiVideoRunAttempt = {
      ...attempt,
      completedAt: new Date().toISOString(),
      errorMessage: message,
    };
    attempts = [...attempts.slice(0, -1), failureAttempt];
    await updateAiVideoRun(runRecord.id, {
      status: "failed",
      errorMessage: message,
      attempts,
      completedAt: new Date().toISOString(),
    });
    throw new Error(message);
  }

  let polled = job;
  let status = job.status;
  let pollCount = 0;
  while (status !== "succeeded") {
    if (status === "failed" || status === "canceled") {
      const rawError =
        typeof polled.error === "string"
          ? polled.error
          : (polled.error as { message?: string } | null | undefined)?.message ?? "Runway generation failed.";
      const failureAttempt: AiVideoRunAttempt = {
        ...attempt,
        completedAt: new Date().toISOString(),
        errorMessage: rawError,
      };
      attempts = [...attempts.slice(0, -1), failureAttempt];
      await updateAiVideoRun(runRecord.id, {
        status: "failed",
        errorMessage: rawError,
        attempts,
        completedAt: new Date().toISOString(),
      });
      throw new Error(rawError);
    }
    if (pollCount >= RUNWAY_MAX_POLL_ITERATIONS) {
      const timeoutMessage = "Runway video generation timed out.";
      const failureAttempt: AiVideoRunAttempt = {
        ...attempt,
        completedAt: new Date().toISOString(),
        errorMessage: timeoutMessage,
      };
      attempts = [...attempts.slice(0, -1), failureAttempt];
      await updateAiVideoRun(runRecord.id, {
        status: "failed",
        errorMessage: timeoutMessage,
        attempts,
        completedAt: new Date().toISOString(),
      });
      throw new Error(timeoutMessage);
    }
    await wait(RUNWAY_POLL_INTERVAL_MS);
    pollCount += 1;
    polled = await retrieveRunwayGeneration(job.id);
    status = polled.status;
  }

  await updateAiVideoRun(runRecord.id, {
    status: "uploading",
    responseMetadata: polled as unknown as Record<string, unknown>,
  });

  const { videoUrl, thumbnailUrl } = extractRunwayOutputs(polled);
  if (!videoUrl) {
    throw new Error("Runway generation did not return a video URL.");
  }

  const videoContent = await downloadRemoteAsset(videoUrl);
  let thumbContent: { bytes: Uint8Array; contentType: string | null } | null = null;
  if (thumbnailUrl) {
    try {
      thumbContent = await downloadRemoteAsset(thumbnailUrl);
    } catch (error) {
      console.warn("Failed to download Runway thumbnail", error);
    }
  }

  const persisted = await persistVideoAsset({
    runId: runRecord.id,
    ownerUserId: context.ownerUserId ?? null,
    video: videoContent,
    thumbnail: thumbContent,
  });

  const completedAttempt: AiVideoRunAttempt = {
    ...attempt,
    completedAt: new Date().toISOString(),
  };
  attempts = [...attempts.slice(0, -1), completedAttempt];

  const durationSecondsValue = normalizeSeconds(
    (polled as unknown as { seconds?: number } | null)?.seconds ?? durationSeconds,
  );
  const playbackUrl =
    persisted.playbackUrl ||
    buildMuxPlaybackUrl(persisted.playbackId ?? undefined, { extension: "m3u8" }) ||
    persisted.storageUrl;
  const fallbackMp4 =
    buildMuxPlaybackUrl(persisted.playbackId ?? undefined, { extension: "mp4" }) ?? playbackUrl;

  const responseMetadata: Record<string, unknown> = {
    playbackUrl: playbackUrl ?? fallbackMp4,
    posterUrl: persisted.posterUrl ?? persisted.thumbnailUrl ?? null,
    muxAssetId: persisted.assetId,
    muxPlaybackId: persisted.playbackId,
    storageUrl: persisted.storageUrl,
    storageKey: persisted.storageKey,
    provider: "runway",
  };

  await updateAiVideoRun(runRecord.id, {
    status: "succeeded",
    videoUrl: playbackUrl,
    thumbnailUrl: persisted.posterUrl ?? persisted.thumbnailUrl ?? null,
    muxAssetId: persisted.assetId,
    muxPlaybackId: persisted.playbackId,
    muxPosterUrl: persisted.posterUrl,
    durationSeconds: durationSecondsValue,
    sizeBytes: persisted.sizeBytes ?? null,
    responseMetadata,
    attempts,
    completedAt: new Date().toISOString(),
  });

  return {
    url: fallbackMp4 ?? playbackUrl,
    playbackUrl,
    posterUrl: persisted.posterUrl ?? persisted.thumbnailUrl ?? null,
    provider: "runway",
    runId: runRecord.id,
    model: resolveRunwayVideoModel(),
    thumbnailUrl: persisted.thumbnailUrl ?? persisted.posterUrl ?? null,
    durationSeconds: durationSecondsValue,
    muxAssetId: persisted.assetId,
    muxPlaybackId: persisted.playbackId,
    memoryId: null,
    runStatus: "succeeded",
  };
}

export async function generateVideoFromPrompt(
  prompt: string,
  context: VideoRunContext,
): Promise<VideoGenerationResult> {
  return runOpenAIVideoPipeline(prompt, { ...context, mode: "generate" });
}

export async function editVideoWithInstruction(
  sourceUrl: string,
  _instruction: string,
  _context: VideoRunContext,
): Promise<VideoGenerationResult> {
  const source = sourceUrl && sourceUrl.trim().length ? sourceUrl.trim() : null;
  if (!source) {
    throw new Error("A source video URL is required to perform an edit.");
  }
  if (!hasRunwayApiKey()) {
    throw new Error("Video editing is not configured; add RUNWAY_API_KEY to enable edits.");
  }
  return runRunwayVideoPipeline(_instruction, { ..._context, sourceUrl: source, mode: "edit" });
}

// Expose internals for isolated tests
export const __test__ = {
  parseResolution,
  extractRunwayOutputs,
};
