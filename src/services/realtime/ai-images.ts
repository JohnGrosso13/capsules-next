import "server-only";

import { getRealtimePublisher } from "@/config/realtime-server";
import { getAiImageChannel } from "@/lib/ai/channels";

export type AiImageRunRealtimeEvent =
  | {
      type: "ai.image.run.started";
      runId: string;
      assetKind: string;
      mode: "generate" | "edit";
      userPrompt: string;
      resolvedPrompt: string;
      stylePreset: string | null;
      options: Record<string, unknown>;
    }
  | {
      type: "ai.image.run.attempt";
      runId: string;
      attempt: number;
      model: string | null;
      status: "started" | "succeeded" | "failed";
      errorCode?: string | null;
      errorMessage?: string | null;
    }
  | {
      type: "ai.image.run.completed";
      runId: string;
      status: "succeeded" | "failed";
      imageUrl: string | null;
      errorCode: string | null;
      errorMessage: string | null;
    };

export async function publishAiImageEvent(
  userId: string | null | undefined,
  event: AiImageRunRealtimeEvent,
): Promise<void> {
  if (!userId) return;
  const publisher = getRealtimePublisher();
  if (!publisher) return;
  try {
    const channel = getAiImageChannel(userId);
    await publisher.publish(channel, event.type, event);
  } catch (error) {
    console.error("AI image realtime publish error", { userId, event: event.type, error });
  }
}
