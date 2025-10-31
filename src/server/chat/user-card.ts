import { getUserProfileSummary } from "@/server/users/service";
import { listCapsulesForUser } from "@/server/capsules/repository";

export type UserCardResult = {
  text: string | null;
  summary: {
    name: string | null;
    avatarUrl: string | null;
    capsules: Array<{
      id: string;
      name: string;
      ownership: "owner" | "member";
    }>;
  };
};

function formatCapsuleLine(
  entry: { id: string; name: string; ownership: "owner" | "member" },
  index: number,
): string {
  const prefix = entry.ownership === "owner" ? "owns" : "member of";
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
