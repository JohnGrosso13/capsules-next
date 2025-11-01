import { findUserIdentity } from "./repository";
import type { ChatParticipantRow } from "./repository";
import { ResolvedIdentity, UUID_PATTERN, normalizeId } from "./utils";

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
  if (UUID_PATTERN.test(normalized)) {
    const resolved: ResolvedIdentity = { canonicalId: normalized, profile: null };
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
