import type { AuthClientUser } from "@/ports/auth-client";

export type RealtimeEnvelope = Record<string, unknown> | null;

type ClerkUserDetails = {
  emailAddresses?: Array<{ id: string; emailAddress?: string | null }>;
  primaryEmailAddressId?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

function resolvePrimaryEmail(details: ClerkUserDetails): string | null {
  const addresses = details.emailAddresses ?? [];
  const primaryId = details.primaryEmailAddressId;
  if (primaryId) {
    const primary = addresses.find((address) => address.id === primaryId);
    if (primary?.emailAddress) {
      return primary.emailAddress;
    }
  }
  return addresses[0]?.emailAddress ?? null;
}

function resolveDisplayName(details: ClerkUserDetails): string | null {
  const direct = typeof details.name === "string" ? details.name.trim() : "";
  if (direct) return direct;
  const first = typeof details.firstName === "string" ? details.firstName.trim() : "";
  const last = typeof details.lastName === "string" ? details.lastName.trim() : "";
  const combined = `${first} ${last}`.trim();
  return combined.length > 0 ? combined : null;
}

export function buildRealtimeEnvelope(
  user: (AuthClientUser & ClerkUserDetails) | AuthClientUser | null,
): RealtimeEnvelope {
  if (!user) return null;

  const details = user as AuthClientUser & ClerkUserDetails;
  const primaryEmail = resolvePrimaryEmail(details);
  const displayName = resolveDisplayName(details);

  return {
    clerk_id: user.id,
    email: primaryEmail,
    full_name: displayName ?? primaryEmail ?? null,
    avatar_url: user.avatarUrl ?? null,
    provider: "clerk",
    key: `clerk:${user.id}`,
  } as Record<string, unknown>;
}
