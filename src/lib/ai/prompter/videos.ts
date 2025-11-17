import {
  generateVideoFromPrompt,
  editVideoWithInstruction,
  type VideoGenerationResult,
} from "@/lib/ai/video";

export type VideoDraftShape = {
  kind: string | null;
  mediaUrl: string | null;
  mediaPrompt: string | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
  muxPlaybackId: string | null;
  muxAssetId: string | null;
  durationSeconds: number | null;
  videoRunId: string | null;
  videoRunStatus: "pending" | "running" | "succeeded" | "failed" | null;
  videoRunError: string | null;
  memoryId: string | null;
  content: string;
};

export type VideoAttachment = { url?: string; mimeType?: string | null } | null;

export function composeMediaPrompt(
  instruction: string | null | undefined,
  modelPrompt: string | null | undefined,
): string {
  const primary = typeof modelPrompt === "string" && modelPrompt.trim().length ? modelPrompt : null;
  const fallback =
    typeof instruction === "string" && instruction.trim().length ? instruction.trim() : "";
  return primary ?? fallback ?? "";
}

export async function generateComposerVideo(params: {
  allowGeneratedMedia: boolean;
  requestedKind: string | null;
  videoIntent: boolean;
  preferVideo: boolean;
  videoAttachment: VideoAttachment;
  mediaUrlFromModel: string | null;
  mediaPromptFromModel: string | null;
  instructionForModel: string | null;
  postResponse: Record<string, unknown>;
  capsuleId?: string | null;
  ownerUserId?: string | null;
  statusMessage: string;
  result: VideoDraftShape;
}): Promise<{
  result: VideoDraftShape;
  statusMessage: string;
  videoResult: VideoGenerationResult | null;
}> {
  const {
    allowGeneratedMedia,
    requestedKind,
    videoIntent,
    preferVideo,
    videoAttachment,
    mediaUrlFromModel,
    mediaPromptFromModel,
    instructionForModel,
    postResponse,
    capsuleId,
    ownerUserId,
  } = params;

  let { statusMessage } = params;
  const { result } = params;
  const normalizedOwnerUserId = ownerUserId ?? null;
  const mediaPrompt = mediaPromptFromModel;
  const mediaUrl = mediaUrlFromModel;
  let videoResult: VideoGenerationResult | null = null;

  const shouldGenerateVideo =
    allowGeneratedMedia &&
    (requestedKind === "video" || videoIntent || preferVideo || Boolean(videoAttachment));

  if (shouldGenerateVideo) {
    result.videoRunStatus = "running";
    result.videoRunError = null;

    if (mediaUrl) {
      result.kind = "video";
      result.mediaUrl = mediaUrl;
      result.mediaPrompt = composeMediaPrompt(instructionForModel, mediaPrompt);
      const thumbnailFromResponse =
        typeof postResponse.thumbnail_url === "string"
          ? postResponse.thumbnail_url
          : typeof postResponse.thumbnailUrl === "string"
            ? postResponse.thumbnailUrl
            : null;
      if (thumbnailFromResponse) {
        result.thumbnailUrl = thumbnailFromResponse;
      }
      const playbackFromResponse =
        typeof postResponse.playback_url === "string"
          ? postResponse.playback_url
          : typeof postResponse.playbackUrl === "string"
            ? postResponse.playbackUrl
            : null;
      if (playbackFromResponse) {
        result.playbackUrl = playbackFromResponse;
      }
      const muxPlaybackId =
        typeof postResponse.mux_playback_id === "string"
          ? postResponse.mux_playback_id
          : typeof postResponse.muxPlaybackId === "string"
            ? postResponse.muxPlaybackId
            : null;
      if (muxPlaybackId) {
        result.muxPlaybackId = muxPlaybackId;
      }
      const muxAssetId =
        typeof postResponse.mux_asset_id === "string"
          ? postResponse.mux_asset_id
          : typeof postResponse.muxAssetId === "string"
            ? postResponse.muxAssetId
            : null;
      if (muxAssetId) {
        result.muxAssetId = muxAssetId;
      }
      if (typeof postResponse.duration_seconds === "number") {
        result.durationSeconds = Number(postResponse.duration_seconds);
      }
      if (typeof postResponse.video_run_id === "string" && postResponse.video_run_id.trim().length) {
        result.videoRunId = postResponse.video_run_id.trim();
      } else if (
        typeof postResponse.videoRunId === "string" &&
        postResponse.videoRunId.trim().length &&
        !result.videoRunId
      ) {
        result.videoRunId = postResponse.videoRunId.trim();
      }
      if (typeof postResponse.memory_id === "string" && postResponse.memory_id.trim().length) {
        result.memoryId = postResponse.memory_id.trim();
      } else if (
        typeof postResponse.memoryId === "string" &&
        postResponse.memoryId.trim().length &&
        !result.memoryId
      ) {
        result.memoryId = postResponse.memoryId.trim();
      }
      result.videoRunStatus = result.videoRunStatus ?? "succeeded";
      result.videoRunError = null;
    } else {
      try {
        const videoInstruction = composeMediaPrompt(instructionForModel, mediaPrompt);
        if (videoAttachment?.url) {
          videoResult = await editVideoWithInstruction(videoAttachment.url, videoInstruction, {
            capsuleId: capsuleId ?? null,
            ownerUserId: normalizedOwnerUserId,
            mode: "edit",
          });
        } else {
          videoResult = await generateVideoFromPrompt(videoInstruction, {
            capsuleId: capsuleId ?? null,
            ownerUserId: normalizedOwnerUserId,
            mode: "generate",
          });
        }
      } catch (error) {
        console.error("Video generation failed for composer prompt:", error);
        const errorMessage =
          error instanceof Error && error.message ? error.message.trim() : "Unknown error";
        result.videoRunStatus = "failed";
        result.videoRunError = errorMessage;
        result.videoRunId = result.videoRunId ?? null;
        if (requestedKind === "video") {
          result.kind = "text";
        }
        result.mediaUrl = null;
        result.playbackUrl = null;
        result.thumbnailUrl = null;
        if (!statusMessage || !statusMessage.trim().length) {
          statusMessage = `I hit a snag while rendering that clip: ${errorMessage}`;
        } else {
          statusMessage = `${statusMessage}\n\nVideo generation error: ${errorMessage}`;
        }
      }
    }
  }

  if (videoResult) {
    const playbackUrl = videoResult.playbackUrl ?? videoResult.url;
    const downloadUrl = videoResult.url ?? videoResult.playbackUrl;
    result.kind = "video";
    result.mediaUrl = playbackUrl;
    result.mediaPrompt = composeMediaPrompt(instructionForModel, mediaPrompt);
    result.thumbnailUrl =
      videoResult.posterUrl ?? videoResult.thumbnailUrl ?? result.thumbnailUrl ?? null;
    result.playbackUrl = downloadUrl;
    result.muxPlaybackId = videoResult.muxPlaybackId ?? null;
    result.muxAssetId = videoResult.muxAssetId ?? null;
    result.durationSeconds = videoResult.durationSeconds ?? null;
    result.videoRunId = videoResult.runId ?? result.videoRunId ?? null;
    result.videoRunStatus = "succeeded";
    result.videoRunError = null;
    if (videoResult.memoryId) {
      result.memoryId = videoResult.memoryId;
    }
  }

  return { result, statusMessage, videoResult };
}
