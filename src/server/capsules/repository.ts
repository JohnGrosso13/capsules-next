import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError } from "@/lib/database/utils";

const db = getDatabaseAdminClient();

type CapsuleRow = {
  id: string | null;
  name: string | null;
  slug: string | null;
  banner_url: string | null;
  logo_url: string | null;
  created_by_id: string | null;
  created_at?: string | null;
};

type CapsuleMemberRow = {
  capsule_id: string | null;
  role: string | null;
  joined_at: string | null;
  capsule: CapsuleRow | null;
};

export type CapsuleSummary = {
  id: string;
  name: string;
  slug: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  role: string | null;
  ownership: "owner" | "member";
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

const NAME_LIMIT = 80;
const SLUG_LIMIT = 50;
const SLUG_MAX_ATTEMPTS = 4;

function normalizeName(value: unknown): string {
  const normalized = normalizeString(value);
  if (!normalized) return "Untitled Capsule";
  if (normalized.length <= NAME_LIMIT) return normalized;
  return normalized.slice(0, NAME_LIMIT).trim();
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSlugCandidate(source: string, attempt: number): string | null {
  const base = slugify(source).slice(0, SLUG_LIMIT);
  if (!base) return null;
  if (attempt === 0) return base;
  const suffix =
    attempt === 1
      ? Math.random().toString(36).slice(-4)
      : `${attempt}-${Math.random().toString(36).slice(-3)}`;
  const candidate = `${base}-${suffix}`.slice(0, SLUG_LIMIT);
  return candidate.length ? candidate : null;
}

function upsertSummary(
  map: Map<string, CapsuleSummary>,
  order: string[],
  capsule: CapsuleRow,
  meta: { role?: string | null; ownership: "owner" | "member" },
): void {
  const rawId = capsule?.id;
  if (!rawId) return;
  const id = String(rawId);
  const existing = map.get(id) ?? null;

  const baseSummary: CapsuleSummary = {
    id,
    name: normalizeName(capsule?.name ?? null),
    slug: normalizeString(capsule?.slug ?? null),
    bannerUrl: normalizeString(capsule?.banner_url ?? null),
    logoUrl: normalizeString(capsule?.logo_url ?? null),
    role: normalizeString(meta.role ?? existing?.role ?? null),
    ownership:
      meta.ownership === "owner" || existing?.ownership === "owner" ? "owner" : "member",
  };

  if (!existing) {
    map.set(id, baseSummary);
    order.push(id);
    return;
  }

  map.set(id, {
    ...existing,
    ...baseSummary,
    role: baseSummary.role ?? existing.role,
    ownership: baseSummary.ownership,
  });
}

export async function listCapsulesForUser(userId: string): Promise<CapsuleSummary[]> {
  const summaries = new Map<string, CapsuleSummary>();
  const order: string[] = [];

  const membershipResult = await db
    .from("capsule_members")
    .select<CapsuleMemberRow>(
      "capsule_id, role, joined_at, capsule:capsule_id!inner(id,name,slug,banner_url,logo_url,created_by_id)",
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .fetch();

  if (membershipResult.error)
    throw decorateDatabaseError("capsules.memberships", membershipResult.error);

  for (const row of membershipResult.data ?? []) {
    if (!row?.capsule) continue;
    const ownership = row.capsule.created_by_id === userId ? "owner" : "member";
    upsertSummary(summaries, order, row.capsule, { role: row.role, ownership });
  }

  const ownedResult = await db
    .from("capsules")
    .select<CapsuleRow>("id, name, slug, banner_url, logo_url, created_by_id, created_at")
    .eq("created_by_id", userId)
    .order("created_at", { ascending: true })
    .fetch();

  if (ownedResult.error) throw decorateDatabaseError("capsules.owned", ownedResult.error);

  for (const row of ownedResult.data ?? []) {
    if (!row) continue;
    upsertSummary(summaries, order, row, { ownership: "owner" });
  }

  return order
    .map((id) => summaries.get(id) ?? null)
    .filter((entry): entry is CapsuleSummary => entry !== null);
}

type CapsuleInsert = {
  name: string;
  slug?: string | null;
  created_by_id: string;
};

function makeSummary(row: CapsuleRow, role: "owner" | string | null): CapsuleSummary {
  return {
    id: String(row.id),
    name: normalizeName(row.name),
    slug: normalizeString(row.slug),
    bannerUrl: normalizeString(row.banner_url),
    logoUrl: normalizeString(row.logo_url),
    role: role ?? null,
    ownership: "owner",
  };
}

export async function createCapsuleForUser(
  userId: string,
  params: { name: string },
): Promise<CapsuleSummary> {
  const name = normalizeName(params.name);
  const attempts = SLUG_MAX_ATTEMPTS + 1;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidateSlug = buildSlugCandidate(name, attempt);
    const payload: CapsuleInsert = {
      name,
      created_by_id: userId,
      ...(candidateSlug ? { slug: candidateSlug } : {}),
    };

    const inserted = await db
      .from("capsules")
      .insert<CapsuleInsert>(payload)
      .select<CapsuleRow>("id, name, slug, banner_url, logo_url, created_by_id")
      .single();

    if (inserted.error) {
      // 23505 => unique violation (likely slug). Retry with a new slug candidate.
      if (inserted.error.code === "23505") {
        lastError = inserted.error;
        continue;
      }
      throw decorateDatabaseError("capsules.create", inserted.error);
    }

    const row = inserted.data;
    if (!row?.id) {
      throw new Error("capsules.create: insert returned invalid row");
    }

    const membership = await db
      .from("capsule_members")
      .upsert(
        { capsule_id: row.id, user_id: userId, role: "owner" },
        { onConflict: "capsule_id,user_id" },
      );

    if (membership.error) {
      throw decorateDatabaseError("capsules.createMembership", membership.error);
    }

    return makeSummary(row, "owner");
  }

  throw decorateDatabaseError("capsules.create", lastError);
}

export async function deleteCapsuleOwnedByUser(
  userId: string,
  capsuleId: string,
): Promise<boolean> {
  const normalizedId = normalizeString(capsuleId);
  if (!normalizedId) {
    throw new Error("capsules.delete: capsuleId is required");
  }

  const result = await db
    .from("capsules")
    .delete({ count: "exact" })
    .eq("id", normalizedId)
    .eq("created_by_id", userId)
    .select("id")
    .fetch();

  if (result.error) {
    throw decorateDatabaseError("capsules.delete", result.error);
  }

  const deleted = (result.data ?? []).length;
  return deleted > 0;
}
