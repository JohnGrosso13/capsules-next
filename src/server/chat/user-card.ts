import { getUserProfileSummary } from "@/server/users/service";
import { listCapsulesForUser } from "@/server/capsules/repository";
import { getRedis } from "@/server/redis/client";

type CapsuleOwnership = "owner" | "member" | "follower";

export type UserCardResult = {
  text: string | null;
  summary: {
    name: string | null;
    avatarUrl: string | null;
    capsules: Array<{
      id: string;
      name: string;
      ownership: CapsuleOwnership;
    }>;
  };
};

function formatCapsuleLine(
  entry: { id: string; name: string; ownership: CapsuleOwnership },
  index: number,
): string {
  const prefix =
    entry.ownership === "owner"
      ? "owns"
      : entry.ownership === "member"
        ? "member of"
        : "follows";
  return `${index === 0 ? "Capsules:" : "         "} ${prefix} ${entry.name} (${entry.id})`;
}

export async function buildUserCard(ownerId: string): Promise<UserCardResult | null> {
  if (typeof ownerId !== "string" || !ownerId.trim().length) return null;
  try {
    const profile = await getUserProfileSummary(ownerId, {});
    const capsules = await listCapsulesForUser(ownerId).catch(() => []);

    const capsuleSummaries = capsules.slice(0, 4).map((capsule) => ({
      id: capsule.id,
      name: capsule.name,
      ownership: capsule.ownership,
    }));

    const intro = profile?.name
      ? `User: ${profile.name} (${profile.id})`
      : `User ID: ${profile?.id ?? ownerId}`;

    const lines: string[] = [intro];

    if (profile?.avatarUrl) {
      lines.push(`Avatar: ${profile.avatarUrl}`);
    }

    if (capsuleSummaries.length) {
      capsuleSummaries.forEach((capsule, index) => {
        lines.push(formatCapsuleLine(capsule, index));
      });
    } else {
      lines.push("Capsules: no active capsules yet.");
    }

    const text = lines.join("\n");

    return {
      text,
      summary: {
        name: profile?.name ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        capsules: capsuleSummaries,
      },
    };
  } catch (error) {
    console.warn("user card build failed", error);
    return null;
  }
}

const USER_CARD_CACHE_TTL_SECONDS = 15 * 60; // 15 minutes

function buildUserCardCacheKey(ownerId: string): string {
  return `composer:user-card:${ownerId}`;
}

export async function getUserCardCached(ownerId: string): Promise<UserCardResult | null> {
  const redis = getRedis();
  if (!redis) return buildUserCard(ownerId);
  const cacheKey = buildUserCardCacheKey(ownerId);

  try {
    const cached = await redis.get<UserCardResult>(cacheKey);
    if (cached) return cached;
  } catch (error) {
    console.warn("user card cache read failed", error);
  }

  const card = await buildUserCard(ownerId);
  if (!card) return null;

  try {
    await redis.set(cacheKey, card, { ex: USER_CARD_CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn("user card cache write failed", error);
  }

  return card;
}
