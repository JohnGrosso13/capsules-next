import type { AuthClientUser } from "@/ports/auth-client";

export type MemoryEnvelope = Record<string, unknown>;

export function buildMemoryEnvelope(user: AuthClientUser | null): MemoryEnvelope | null {
  if (!user) return null;
  const fullName = user.name ?? user.email ?? null;
  const provider = user.provider ?? "guest";
  const baseKey =
    user.key ?? (provider === "clerk" && typeof user.id === "string" ? `clerk:${user.id}` : user.id);
  return {
    clerk_id: provider === "clerk" ? user.id : null,
    email: user.email ?? null,
    full_name: fullName,
    avatar_url: user.avatarUrl ?? null,
    provider,
    key: baseKey,
  };
}
