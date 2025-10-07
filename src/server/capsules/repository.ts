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

function normalizeName(value: unknown): string {
  const normalized = normalizeString(value);
  return normalized ?? "Untitled Capsule";
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
