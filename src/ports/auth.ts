export type IncomingUserPayload = Record<string, unknown> & {
  key?: string | undefined;
  provider?: string | undefined;
  clerk_id?: string | null | undefined;
  email?: string | null | undefined;
  full_name?: string | null | undefined;
  avatar_url?: string | null | undefined;
};

export type NormalizedProfile = {
  key: string;
  provider: string;
  clerk_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type EnsureUserOptions = {
  allowGuests?: boolean;
};

export interface AuthServerAdapter {
  mergeUserPayloadFromRequest(
    req: Request,
    basePayload?: IncomingUserPayload | null,
  ): IncomingUserPayload;
  normalizeProfileFromPayload(payload?: IncomingUserPayload | null): NormalizedProfile | null;
  ensureUserFromRequest(
    req: Request,
    basePayload?: IncomingUserPayload | null,
    options?: EnsureUserOptions,
  ): Promise<string | null>;
  resolveUserKey(payload: IncomingUserPayload): Promise<string | null>;
  isAdminRequest?(
    req: Request,
    payload?: IncomingUserPayload,
    supabaseUserId?: string | null,
  ): Promise<boolean>;
}
