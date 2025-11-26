export const ASSISTANT_USER_ID = "26c6d7b6-b15d-4e0e-9d11-5c457769278e";
export const ASSISTANT_USER_KEY = "capsules-assistant";
export const ASSISTANT_DISPLAY_NAME = "Assistant";
export const ASSISTANT_DEFAULT_AVATAR: string | null = null;

export function isAssistantUserId(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === ASSISTANT_USER_ID;
}

export function isAssistantUserKey(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === ASSISTANT_USER_KEY;
}
