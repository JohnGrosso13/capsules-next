import { createAiJob, type MuxAiJobRecord } from "@/server/mux/repository";

export const MUX_AI_JOB_TYPES = {
  LIVE_TRANSCRIPTION_START: "live_transcription.start",
  LIVE_TRANSCRIPTION_STOP: "live_transcription.stop",
  CLIP_DETECTION: "clips.detect",
  HIGHLIGHT_SUMMARY: "highlights.summary",
  THUMBNAIL_GENERATION: "thumbnails.generate",
  TITLE_SUGGESTION: "titles.generate",
  DESCRIPTION_SUGGESTION: "descriptions.generate",
  SOCIAL_COPY: "social.copy",
  RECAP: "recap.generate",
} as const;

type QueueParams = {
  capsuleId: string;
  liveStreamId?: string | null;
  assetId?: string | null;
  payload?: Record<string, unknown> | null;
  priority?: number;
  jobType: (typeof MUX_AI_JOB_TYPES)[keyof typeof MUX_AI_JOB_TYPES];
};

async function queueJob(params: QueueParams): Promise<MuxAiJobRecord | null> {
  try {
    return await createAiJob({
      capsuleId: params.capsuleId,
      jobType: params.jobType,
      status: "pending",
      priority: params.priority ?? 0,
      liveStreamId: params.liveStreamId ?? null,
      assetId: params.assetId ?? null,
      payload: params.payload ?? null,
    });
  } catch (error) {
    console.error("mux.ai.queueJob error", params.jobType, error);
    return null;
  }
}

export async function queueLiveTranscriptionStart(params: {
  capsuleId: string;
  liveStreamId: string;
  muxLiveStreamId: string;
}): Promise<MuxAiJobRecord | null> {
  return queueJob({
    capsuleId: params.capsuleId,
    liveStreamId: params.liveStreamId,
    jobType: MUX_AI_JOB_TYPES.LIVE_TRANSCRIPTION_START,
    priority: 50,
    payload: { muxLiveStreamId: params.muxLiveStreamId },
  });
}

export async function queueLiveTranscriptionStop(params: {
  capsuleId: string;
  liveStreamId: string;
  muxLiveStreamId: string;
}): Promise<MuxAiJobRecord | null> {
  return queueJob({
    capsuleId: params.capsuleId,
    liveStreamId: params.liveStreamId,
    jobType: MUX_AI_JOB_TYPES.LIVE_TRANSCRIPTION_STOP,
    priority: 45,
    payload: { muxLiveStreamId: params.muxLiveStreamId },
  });
}

export async function queueClipDetection(params: {
  capsuleId: string;
  liveStreamId: string | null;
  assetId: string;
  muxAssetId: string;
}): Promise<MuxAiJobRecord | null> {
  return queueJob({
    capsuleId: params.capsuleId,
    liveStreamId: params.liveStreamId,
    assetId: params.assetId,
    jobType: MUX_AI_JOB_TYPES.CLIP_DETECTION,
    priority: 40,
    payload: { muxAssetId: params.muxAssetId },
  });
}

export async function queueAssetHighlightSummaries(params: {
  capsuleId: string;
  liveStreamId: string | null;
  assetId: string;
  muxAssetId: string;
}): Promise<void> {
  await Promise.all([
    queueJob({
      capsuleId: params.capsuleId,
      liveStreamId: params.liveStreamId,
      assetId: params.assetId,
      jobType: MUX_AI_JOB_TYPES.HIGHLIGHT_SUMMARY,
      priority: 35,
      payload: { muxAssetId: params.muxAssetId },
    }),
    queueJob({
      capsuleId: params.capsuleId,
      liveStreamId: params.liveStreamId,
      assetId: params.assetId,
      jobType: MUX_AI_JOB_TYPES.RECAP,
      priority: 30,
      payload: { muxAssetId: params.muxAssetId },
    }),
    queueJob({
      capsuleId: params.capsuleId,
      liveStreamId: params.liveStreamId,
      assetId: params.assetId,
      jobType: MUX_AI_JOB_TYPES.THUMBNAIL_GENERATION,
      priority: 25,
      payload: { muxAssetId: params.muxAssetId },
    }),
    queueJob({
      capsuleId: params.capsuleId,
      liveStreamId: params.liveStreamId,
      assetId: params.assetId,
      jobType: MUX_AI_JOB_TYPES.TITLE_SUGGESTION,
      priority: 20,
      payload: { muxAssetId: params.muxAssetId },
    }),
    queueJob({
      capsuleId: params.capsuleId,
      liveStreamId: params.liveStreamId,
      assetId: params.assetId,
      jobType: MUX_AI_JOB_TYPES.DESCRIPTION_SUGGESTION,
      priority: 18,
      payload: { muxAssetId: params.muxAssetId },
    }),
    queueJob({
      capsuleId: params.capsuleId,
      liveStreamId: params.liveStreamId,
      assetId: params.assetId,
      jobType: MUX_AI_JOB_TYPES.SOCIAL_COPY,
      priority: 16,
      payload: { muxAssetId: params.muxAssetId },
    }),
  ]);
}
