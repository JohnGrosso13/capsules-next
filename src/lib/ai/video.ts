import { postOpenAIJson, fetchOpenAI } from "@/adapters/ai/openai/server";
import { serverEnv } from "@/lib/env/server";
import { buildMuxPlaybackUrl, muxVideoClient } from "@/adapters/mux/server";
import { createAiVideoRun, updateAiVideoRun, type AiVideoRunAttempt } from "@/server/ai/video-runs";
import { indexMemory } from "@/server/memories/service";

const OPENAI_VIDEO_MODEL_DEFAULT = "gpt-4.1-video-preview";
const DEFAULT_RESOLUTION = "1280x720";
const DEFAULT_MAX_DURATION = 30;
const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ITERATIONS = 60;

type OpenAIContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "video";
      id?: string;
      status?: string;
      url?: string;
      download_url?: string;
      file_id?: string;
      thumbnail_url?: string | null;
      duration_seconds?: number | null;
      size_bytes?: number | null;
    }
  | {
      type: "input_video";
      video_url: string;
    };

type OpenAIResponseOutput = {
  type: string;
  content?: OpenAIContentItem[];
};

type OpenAIVideoResponse = {
  id: string;
  status: "in_progress" | "queued" | "running" | "completed" | "failed" | string;
  output?: OpenAIResponseOutput[];
  model?: string;
  usage?: Record<string, unknown>;
  error?: { code?: string; message?: string };
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
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveVideoModel(): string {
  const raw = serverEnv.OPENAI_VIDEO_MODEL;
  return raw && raw.trim().length ? raw.trim() : OPENAI_VIDEO_MODEL_DEFAULT;
}

function resolveVideoResolution(): string {
  const raw = serverEnv.OPENAI_VIDEO_RESOLUTION;
  return raw && raw.trim().length ? raw.trim() : DEFAULT_RESOLUTION;
}

function resolveVideoDuration(): number {
  const raw = Number(serverEnv.OPENAI_VIDEO_MAX_DURATION ?? DEFAULT_MAX_DURATION);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(120, Math.max(5, Math.floor(raw)));
  }
  return DEFAULT_MAX_DURATION;
}

function buildSystemPrompt(mode: "generate" | "edit"): string {
  if (mode === "edit") {
    return [
      "You are Capsules Video Studio. Apply precise edits to the provided clip.",
      "Honor requests such as removing objects, masking people, adjusting colors,",
      "or replacing backgrounds while preserving overall pacing. Return polished results suitable",
      "for social sharing with natural motion and cinematic lighting.",
    ].join(" ");
  }
  return [
    "You are Capsules Video Studio. Craft short-form cinematic stories for social media.",
    "Blend dynamic camera moves, tasteful lighting, and natural motion. Keep the clip engaging",
    "across the full duration with coherent scene transitions. Incorporate typography overlays",
    "only when explicitly requested. Default to a widescreen 16:9 composition unless the user",
    "specifies a different aspect ratio.",
  ].join(" ");
}

type ExtractedVideoAsset = {
  downloadUrl: string | null;
  fileId: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
};

function extractVideoAsset(output: OpenAIResponseOutput[] | undefined): ExtractedVideoAsset | null {
  if (!output || !Array.isArray(output)) return null;
  for (const entry of output) {
    if (!entry || typeof entry !== "object") continue;
    const contents = entry.content;
    if (!Array.isArray(contents)) continue;
    for (const item of contents) {
      if (!item || typeof item !== "object") continue;
      if (item.type === "video" || (item as { download_url?: unknown }).download_url) {
        return {
          downloadUrl:
            typeof (item as { download_url?: unknown }).download_url === "string"
              ? ((item as { download_url: string }).download_url ?? "").trim()
              : typeof (item as { url?: unknown }).url === "string"
                ? ((item as { url: string }).url ?? "").trim()
                : null,
          fileId:
            typeof (item as { file_id?: unknown }).file_id === "string"
              ? ((item as { file_id: string }).file_id ?? "").trim()
              : null,
          thumbnailUrl:
            typeof (item as { thumbnail_url?: unknown }).thumbnail_url === "string"
              ? ((item as { thumbnail_url: string }).thumbnail_url ?? "").trim()
              : null,
          durationSeconds:
            typeof (item as { duration_seconds?: unknown }).duration_seconds === "number"
              ? Number((item as { duration_seconds: number }).duration_seconds)
              : null,
          sizeBytes:
            typeof (item as { size_bytes?: unknown }).size_bytes === "number"
              ? Number((item as { size_bytes: number }).size_bytes)
              : null,
        };
      }
    }
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

async function persistVideoAsset(
  asset: ExtractedVideoAsset,
): Promise<{
  playbackUrl: string;
  playbackId: string | null;
  assetId: string | null;
  posterUrl: string | null;
  sourceUrl: string;
}> {
  if (asset.downloadUrl) {
    const ingestion = await ingestVideoThroughMux(asset.downloadUrl);
    const fallbackUrl = asset.downloadUrl;
    return {
      playbackUrl: ingestion.playbackUrl ?? fallbackUrl,
      playbackId: ingestion.playbackId,
      assetId: ingestion.assetId,
      posterUrl: ingestion.posterUrl,
      sourceUrl: fallbackUrl,
    };
  }
  throw new Error("OpenAI response did not include a downloadable video asset.");
}

async function runOpenAIVideoPipeline(
  prompt: string,
  context: VideoRunContext,
): Promise<VideoGenerationResult> {
  const model = resolveVideoModel();
  const resolution = resolveVideoResolution();
  const maxDuration = resolveVideoDuration();
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
      maxDuration,
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

  const systemPrompt = buildSystemPrompt(context.mode);
  const inputMessages: Array<{
    role: "system" | "user";
    content: OpenAIContentItem[];
  }> = [
    {
      role: "system",
      content: [{ type: "text", text: systemPrompt }],
    },
  ];

  const userContent: OpenAIContentItem[] = [{ type: "input_text", text: prompt }];
  if (context.mode === "edit" && context.sourceUrl) {
    userContent.push({ type: "input_video", video_url: context.sourceUrl });
  }
  inputMessages.push({ role: "user", content: userContent });

  const payload = {
    model,
    input: inputMessages,
    video: {
      format: "mp4",
      resolution,
      duration: { max: maxDuration },
    },
  };

  const responseData = await postOpenAIJson<OpenAIVideoResponse>("/responses", payload);
  if (!responseData.ok || !responseData.data) {
    const message = responseData.data?.error?.message ?? responseData.rawBody ?? "unknown error";
    await updateAiVideoRun(runRecord.id, {
      status: "failed",
      errorCode: responseData.data?.error?.code ?? null,
      errorMessage: message,
      responseMetadata: responseData.parsedBody as Record<string, unknown> | null,
      attempts: [
        ...(runRecord.attempts ?? []),
        {
          ...attempt,
          completedAt: new Date().toISOString(),
          errorCode: responseData.data?.error?.code ?? null,
          errorMessage: message,
        },
      ],
      completedAt: new Date().toISOString(),
    });
    throw new Error(`OpenAI video generation failed: ${message}`);
  }

  let status = responseData.data.status;
  let polledResponse = responseData.data;
  let pollCount = 0;
  while (status !== "completed") {
    if (status === "failed") {
      const message = polledResponse.error?.message ?? "OpenAI video generation failed.";
      await updateAiVideoRun(runRecord.id, {
        status: "failed",
        errorCode: polledResponse.error?.code ?? null,
        errorMessage: message,
        responseMetadata: polledResponse as unknown as Record<string, unknown>,
        attempts: [
          ...(runRecord.attempts ?? []),
          {
            ...attempt,
            completedAt: new Date().toISOString(),
            errorCode: polledResponse.error?.code ?? null,
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
    const pollResponse = await fetchOpenAI(
      `/responses/${encodeURIComponent(polledResponse.id)}`,
      { method: "GET" },
    );
    const pollJson = (await pollResponse.json().catch(() => null)) as OpenAIVideoResponse | null;
    if (!pollResponse.ok || !pollJson) {
      throw new Error(`Failed to poll OpenAI response (${pollResponse.status})`);
    }
    polledResponse = pollJson;
    status = pollJson.status;
  }

  const asset = extractVideoAsset(polledResponse.output);
  if (!asset) {
    await updateAiVideoRun(runRecord.id, {
      status: "failed",
      errorMessage: "OpenAI response did not include a completed video.",
      responseMetadata: polledResponse as unknown as Record<string, unknown>,
      attempts: [
        ...(runRecord.attempts ?? []),
        {
          ...attempt,
          completedAt: new Date().toISOString(),
          errorMessage: "Missing video asset in OpenAI response.",
        },
      ],
      completedAt: new Date().toISOString(),
    });
    throw new Error("OpenAI response did not include a completed video.");
  }

  await updateAiVideoRun(runRecord.id, {
    status: "uploading",
    responseMetadata: polledResponse as unknown as Record<string, unknown>,
  });

  const persisted = await persistVideoAsset(asset);

  const completedAttempt: AiVideoRunAttempt = {
    ...attempt,
    completedAt: new Date().toISOString(),
  };

  const muxPlaybackUrl =
    persisted.playbackUrl ||
    buildMuxPlaybackUrl(persisted.playbackId ?? undefined, { extension: "m3u8" }) ||
    persisted.sourceUrl;

  const playbackUrlFinal =
    buildMuxPlaybackUrl(persisted.playbackId ?? undefined, { extension: "m3u8" }) ??
    muxPlaybackUrl;
  const fallbackMp4 =
    buildMuxPlaybackUrl(persisted.playbackId ?? undefined, { extension: "mp4" }) ??
    playbackUrlFinal;
  let memoryId: string | null = null;
  if (context.ownerUserId) {
    const memoryMediaUrl = playbackUrlFinal ?? muxPlaybackUrl ?? persisted.sourceUrl ?? null;
    if (memoryMediaUrl) {
      try {
        memoryId = await indexMemory({
          ownerId: context.ownerUserId,
          kind: "video",
          mediaUrl: memoryMediaUrl,
          mediaType: fallbackMp4 ? "video/mp4" : "video/*",
          title: context.mode === "edit" ? "Edited AI clip" : "Generated AI clip",
          description: prompt,
          postId: null,
          metadata: {
            muxAssetId: persisted.assetId,
            muxPlaybackId: persisted.playbackId,
            posterUrl: persisted.posterUrl ?? asset.thumbnailUrl ?? null,
            durationSeconds: asset.durationSeconds ?? null,
            videoRunId: runRecord.id,
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
    playbackUrl: playbackUrlFinal ?? muxPlaybackUrl,
    posterUrl: persisted.posterUrl ?? asset.thumbnailUrl ?? null,
    muxAssetId: persisted.assetId,
    muxPlaybackId: persisted.playbackId,
  };
  if (memoryId) {
    responseMetadata.memoryId = memoryId;
  }

  await updateAiVideoRun(runRecord.id, {
    status: "succeeded",
    videoUrl: muxPlaybackUrl,
    thumbnailUrl: asset.thumbnailUrl,
    muxAssetId: persisted.assetId,
    muxPlaybackId: persisted.playbackId,
    muxPosterUrl: persisted.posterUrl,
    durationSeconds: asset.durationSeconds ?? null,
    sizeBytes: asset.sizeBytes ?? null,
    responseMetadata,
    attempts: [...(runRecord.attempts ?? []), completedAttempt],
    completedAt: new Date().toISOString(),
  });

  return {
    url: fallbackMp4 ?? muxPlaybackUrl,
    playbackUrl: playbackUrlFinal ?? muxPlaybackUrl,
    posterUrl: persisted.posterUrl ?? asset.thumbnailUrl ?? null,
    provider: "openai",
    runId: runRecord.id,
    model: polledResponse.model ?? model,
    thumbnailUrl: asset.thumbnailUrl,
    durationSeconds: asset.durationSeconds ?? null,
    muxAssetId: persisted.assetId,
    muxPlaybackId: persisted.playbackId,
    memoryId,
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
  instruction: string,
  context: VideoRunContext,
): Promise<VideoGenerationResult> {
  const source = sourceUrl && sourceUrl.trim().length ? sourceUrl.trim() : null;
  if (!source) {
    throw new Error("A source video URL is required to perform an edit.");
  }
  return runOpenAIVideoPipeline(instruction, {
    ...context,
    sourceUrl: source,
    mode: "edit",
  });
}
