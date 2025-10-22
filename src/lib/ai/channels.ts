const AI_IMAGE_CHANNEL_PREFIX = "ai:image";

function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase();
}

export function getAiImageChannel(userId: string): string {
  const normalized = normalize(userId);
  if (!normalized) {
    throw new Error("AI image channel requires a user id");
  }
  return `${AI_IMAGE_CHANNEL_PREFIX}:${normalized}`;
}

export const AI_REALTIME_CONSTANTS = {
  IMAGE_CHANNEL_PREFIX: AI_IMAGE_CHANNEL_PREFIX,
};
