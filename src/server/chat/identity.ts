import { findUserIdentity } from "./repository";
import type { ChatParticipantRow } from "./repository";
import { normalizeId, type ResolvedIdentity } from "./utils";
import { ASSISTANT_DISPLAY_NAME, ASSISTANT_DEFAULT_AVATAR, isAssistantUserId } from "@/shared/assistant/constants";

export async function resolveIdentity(
  cache: Map<string, ResolvedIdentity | null>,
  identifier: string,
  original?: string | null,
): Promise<ResolvedIdentity | null> {
  const normalized = normalizeId(identifier);
  if (!normalized) return null;
  if (cache.has(normalized)) {
    return cache.get(normalized) ?? null;
  }

  if (isAssistantUserId(normalized)) {
    const synthetic: ChatParticipantRow = {
      id: normalized,
      full_name: ASSISTANT_DISPLAY_NAME,
      avatar_url: ASSISTANT_DEFAULT_AVATAR,
      user_key: ASSISTANT_DISPLAY_NAME.toLowerCase(),
    };
    const resolved: ResolvedIdentity = { canonicalId: normalized, profile: synthetic };
    cache.set(normalized, resolved);
    return resolved;
  }

  const probes = new Set<string>();
  if (original && typeof original === "string" && original.trim()) {
    probes.add(original.trim());
  }
  probes.add(identifier);
  probes.add(normalized);

  for (const probe of probes) {
    const match = await findUserIdentity(probe);
    if (match) {
      const profile: ChatParticipantRow = {
        id: match.id,
        full_name: match.full_name,
        avatar_url: match.avatar_url,
        user_key: match.user_key,
      };
      const resolved: ResolvedIdentity = { canonicalId: match.id, profile };
      cache.set(normalized, resolved);
      const probeNormalized = normalizeId(probe);
      if (probeNormalized && probeNormalized !== normalized) {
        cache.set(probeNormalized, resolved);
      }
      return resolved;
    }
  }

  cache.set(normalized, null);
  return null;
}
