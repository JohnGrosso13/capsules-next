import "server-only";

export {
  mergeUserPayloadFromRequest,
  normalizeProfileFromPayload,
  ensureUserFromRequest,
  ensureSupabaseUser,
  resolveUserKey,
  isAdminRequest,
  getAuthVendor,
} from "@/services/auth/server";

export type {
  IncomingUserPayload,
  NormalizedProfile,
  EnsureUserOptions,
} from "@/services/auth/server";
