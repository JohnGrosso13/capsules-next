import "server-only";

import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError, expectResult, maybeResult } from "@/lib/database/utils";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

const TABLE_NAME = "capsule_style_personas";

type StylePersonaRow = {
  id: string;
  owner_user_id: string;
  capsule_id: string | null;
  name: string;
  palette: string | null;
  medium: string | null;
  camera: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CapsuleStylePersonaRecord = {
  id: string;
  ownerUserId: string;
  capsuleId: string | null;
  name: string;
  palette: string | null;
  medium: string | null;
  camera: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateStylePersonaInput = {
  ownerUserId: string;
  capsuleId?: string | null;
  name: string;
  palette?: string | null;
  medium?: string | null;
  camera?: string | null;
  notes?: string | null;
};

type ListStylePersonasInput = {
  ownerUserId: string;
  capsuleId?: string | null;
  limit?: number;
};

function mapRow(row: StylePersonaRow): CapsuleStylePersonaRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    capsuleId: row.capsule_id,
    name: row.name,
    palette: row.palette,
    medium: row.medium,
    camera: row.camera,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createStylePersona(input: CreateStylePersonaInput): Promise<CapsuleStylePersonaRecord> {
  const db = getDatabaseAdminClient();
  const payload = {
    owner_user_id: input.ownerUserId,
    capsule_id: input.capsuleId ?? null,
    name: input.name,
    palette: input.palette ?? null,
    medium: input.medium ?? null,
    camera: input.camera ?? null,
    notes: input.notes ?? null,
  };

  const result = await db
    .from(TABLE_NAME)
    .insert(payload, { returning: "representation" })
    .select<StylePersonaRow>("*")
    .single();

  const row = expectResult(result, `${TABLE_NAME}.insert`);
  return mapRow(row);
}

export async function listStylePersonas(input: ListStylePersonasInput): Promise<CapsuleStylePersonaRecord[]> {
  const db = getDatabaseAdminClient();
  const limit = Math.max(1, Math.min(input.limit ?? 20, 50));

  let query = db
    .from(TABLE_NAME)
    .select<StylePersonaRow>("*")
    .eq("owner_user_id", input.ownerUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  query = input.capsuleId ? query.eq("capsule_id", input.capsuleId) : query;

  const result = (await query) as unknown as DatabaseResult<StylePersonaRow[]>;
  if (result.error) {
    throw decorateDatabaseError(`${TABLE_NAME}.list`, result.error);
  }

  const rows = result.data ?? [];
  return rows.map(mapRow);
}

export async function getStylePersona(
  personaId: string,
  ownerUserId: string,
): Promise<CapsuleStylePersonaRecord | null> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from(TABLE_NAME)
    .select<StylePersonaRow>("*")
    .eq("id", personaId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  const row = maybeResult<StylePersonaRow | null>(result, `${TABLE_NAME}.get`);
  return row ? mapRow(row) : null;
}

export async function deleteStylePersona(personaId: string, ownerUserId: string): Promise<boolean> {
  const db = getDatabaseAdminClient();
  const result = (await db
    .from(TABLE_NAME)
    .delete({ count: "exact" })
    .eq("id", personaId)
    .eq("owner_user_id", ownerUserId)) as unknown as { error: DatabaseError | null; count: number | null };

  if (result.error) {
    throw decorateDatabaseError(`${TABLE_NAME}.delete`, result.error);
  }
  return (result.count ?? 0) > 0;
}
