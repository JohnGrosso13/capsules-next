export const ASSISTANT_USER_ID = "26c6d7b6-b15d-4e0e-9d11-5c457769278e";
export const ASSISTANT_USER_KEY = "capsules-assistant";
export const ASSISTANT_DISPLAY_NAME = "Assistant";
export const ASSISTANT_DEFAULT_AVATAR: string | null = null;

const ASSISTANT_OWNER_PREFIX = `${ASSISTANT_USER_ID}-owner-`;

export function isAssistantUserId(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === ASSISTANT_USER_ID || normalized.startsWith(ASSISTANT_OWNER_PREFIX);
}

export function isAssistantUserKey(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === ASSISTANT_USER_KEY || normalized.startsWith(ASSISTANT_OWNER_PREFIX);
}

export function getScopedAssistantUserId(ownerUserId: string): string {
  const owner = typeof ownerUserId === "string" ? ownerUserId.trim().toLowerCase() : "";
  return owner ? `${ASSISTANT_OWNER_PREFIX}${owner}` : ASSISTANT_USER_ID;
}
