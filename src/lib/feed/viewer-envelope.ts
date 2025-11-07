import type { AuthClientUser } from "@/ports/auth-client";

export type ViewerEnvelope = Record<string, unknown> | null;

export function buildViewerEnvelope(user: AuthClientUser | null): ViewerEnvelope {
  if (!user) return null;

  const provider = user.provider ?? "guest";
  const clerkUser = provider === "clerk";

  const envelope: Record<string, unknown> = {
    provider,
    email: user.email ?? null,
    full_name: user.name ?? user.email ?? null,
    avatar_url: user.avatarUrl ?? null,
    clerk_id: clerkUser ? user.id : null,
  };

  envelope.key = user.key ?? (clerkUser ? `clerk:${user.id}` : user.id);

  return envelope;
}
