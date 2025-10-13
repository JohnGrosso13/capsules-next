import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

const TABLE = "user_panel_layouts";

type LayoutRow = {
  storage_key: string;
  state: unknown;
};

export type PanelLayoutEntry = {
  storageKey: string;
  state: unknown;
};

function raise(context: string, error: DatabaseError): Error {
  const err = new Error(`${context}: ${error.message}`);
  const extended = err as Error & Record<string, unknown>;
  if (error.code) extended.code = error.code;
  if (error.details) extended.details = error.details;
  if (error.hint) extended.hint = error.hint;
  return err;
}

function ensure<T>(result: DatabaseResult<T>, context: string): T | null {
  if (result.error) throw raise(context, result.error);
  return result.data ?? null;
}

export async function getUserPanelLayouts(
  userId: string,
  view: string,
  storageKeys?: readonly string[],
): Promise<Record<string, unknown>> {
  const db = getDatabaseAdminClient();

  let query = db
    .from(TABLE)
    .select<LayoutRow>("storage_key, state")
    .eq("user_id", userId)
    .eq("view", view);

  if (storageKeys && storageKeys.length) {
    query = query.in("storage_key", [...storageKeys]);
  }

  const result = await query.fetch();
  const rows = ensure(result, "studioLayouts.fetch") ?? [];

  const map: Record<string, unknown> = {};
  for (const row of rows) {
    if (!row) continue;
    map[row.storage_key] = row.state ?? null;
  }
  return map;
}

export async function upsertUserPanelLayouts(
  userId: string,
  view: string,
  entries: readonly PanelLayoutEntry[],
): Promise<void> {
  if (!entries.length) return;

  const db = getDatabaseAdminClient();
  const payload = entries.map((entry) => ({
    user_id: userId,
    view,
    storage_key: entry.storageKey,
    state: entry.state ?? null,
  }));

  const result = await db
    .from(TABLE)
    .upsert(payload, { onConflict: "user_id,storage_key" })
    .select("storage_key");

  ensure(result, "studioLayouts.upsert");
}
