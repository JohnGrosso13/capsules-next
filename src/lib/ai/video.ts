import { postOpenAIJson, fetchOpenAI } from "@/adapters/ai/openai/server";
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

  const attempt: AiVideoRunAttempt = {
    attempt: (runRecord.attempts?.length ?? 0) + 1,
    stage: context.mode === "edit" ? "edit" : "generate",
    model,
    provider: "openai",
    startedAt: new Date().toISOString(),
  };

  await updateAiVideoRun(runRecord.id, {
    status: "running",
    attempts: [...(runRecord.attempts ?? []), attempt],
  });

  let job: OpenAIVideoJob;
  try {
    job = await createVideoJob(prompt, { model, size: resolution, seconds: durationSeconds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video generation failed.";
    await updateAiVideoRun(runRecord.id, {
      status: "failed",
      errorMessage: message,
      attempts: [
        ...(runRecord.attempts ?? []),
        { ...attempt, completedAt: new Date().toISOString(), errorMessage: message },
      ],
      completedAt: new Date().toISOString(),
    });
    throw new Error(`OpenAI video generation failed: ${message}`);
  }

  let status = job.status;
  let polledJob = job;
  let pollCount = 0;
  while (status !== "completed") {
    if (status === "failed") {
      const message = polledJob.error?.message ?? "OpenAI video generation failed.";
      await updateAiVideoRun(runRecord.id, {
        status: "failed",
        errorCode: polledJob.error?.code ?? null,
        errorMessage: message,
        responseMetadata: polledJob as unknown as Record<string, unknown>,
        attempts: [
          ...(runRecord.attempts ?? []),
          {
            ...attempt,
            completedAt: new Date().toISOString(),
            errorCode: polledJob.error?.code ?? null,
            errorMessage: message,
          },
        ],
        completedAt: new Date().toISOString(),
      });
      throw new Error(message);
    }
    if (pollCount >= MAX_POLL_ITERATIONS) {
      await updateAiVideoRun(runRecord.id, {
        status: "failed",
        errorMessage: "Video generation timed out.",
        attempts: [
          ...(runRecord.attempts ?? []),
          {
            ...attempt,
            completedAt: new Date().toISOString(),
            errorMessage: "Timed out polling OpenAI for video completion.",
          },
        ],
        completedAt: new Date().toISOString(),
      });
      throw new Error("Video generation timed out.");
    }
    await wait(POLL_INTERVAL_MS);
    pollCount += 1;
    polledJob = await retrieveVideoJob(job.id);
    status = polledJob.status;
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
    attempts: [...(runRecord.attempts ?? []), completedAttempt],
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
  throw new Error("Video editing is not supported with the current video provider.");
}
