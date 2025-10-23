export const CAPSULE_MEMBER_UI_ROLE_VALUES = [
  "member",
  "leader",
  "admin",
  "founder",
] as const;
export type CapsuleMemberUiRole = (typeof CAPSULE_MEMBER_UI_ROLE_VALUES)[number];

const UI_ROLE_LOOKUP = new Set<string>(CAPSULE_MEMBER_UI_ROLE_VALUES);

export type CapsuleMemberDbRole = "owner" | "admin" | "moderator" | "member" | "guest";

const UI_TO_DB_ROLE: Record<CapsuleMemberUiRole, CapsuleMemberDbRole> = {
  member: "member",
  leader: "moderator",
  admin: "admin",
  founder: "owner",
};

const DB_TO_UI_ROLE: Record<CapsuleMemberDbRole, CapsuleMemberUiRole> = {
  owner: "founder",
  admin: "admin",
  moderator: "leader",
  member: "member",
  guest: "member",
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export function isCapsuleMemberUiRole(value: unknown): value is CapsuleMemberUiRole {
  const normalized = normalizeString(value);
  return Boolean(normalized && UI_ROLE_LOOKUP.has(normalized));
}

export function uiRoleToDbRole(role: CapsuleMemberUiRole): CapsuleMemberDbRole {
  return UI_TO_DB_ROLE[role];
}

export function dbRoleToUiRole(role: unknown): CapsuleMemberUiRole | null {
  const normalized = normalizeString(role);
  if (!normalized) return null;
  const mapped = DB_TO_UI_ROLE[normalized as CapsuleMemberDbRole] ?? null;
  return mapped ?? null;
}

export function resolveMemberUiRole(
  role: unknown,
  isOwner: boolean,
  fallback: CapsuleMemberUiRole = "member",
): CapsuleMemberUiRole {
  if (isOwner) return "founder";
  const mapped = dbRoleToUiRole(role);
  return mapped ?? fallback;
}

export function resolveViewerUiRole(role: unknown, isOwner: boolean): CapsuleMemberUiRole | null {
  if (isOwner) return "founder";
  const mapped = dbRoleToUiRole(role);
  return mapped;
}
