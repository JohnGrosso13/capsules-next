const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProfileIdentifierInput =
  | string
  | null
  | undefined
  | {
      userId?: string | null;
      userKey?: string | null;
    };

export const PROFILE_SELF_ALIAS = "me";

function normalizeCandidate(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function preferProfileIdentifier(
  input: ProfileIdentifierInput,
): string | null {
  if (input == null) return null;
  if (typeof input === "string") {
    return normalizeCandidate(input);
  }
  const fromKey = normalizeCandidate(input.userKey);
  if (fromKey) return fromKey;
  const fromId = normalizeCandidate(input.userId);
  return fromId ?? null;
}

export function buildProfileHref(
  input: ProfileIdentifierInput,
): string | null {
  const candidate = preferProfileIdentifier(input);
  if (!candidate) return null;
  const encoded = encodeURIComponent(candidate);
  return `/profile/${encoded}`;
}

export function looksLikeProfileId(value: string | null | undefined): boolean {
  const normalized = normalizeCandidate(value);
  if (!normalized) return false;
  if (normalized === PROFILE_SELF_ALIAS) return true;
  return UUID_PATTERN.test(normalized);
}
