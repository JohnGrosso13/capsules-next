import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

export type AdminSubscriber = {
  email: string;
  source: string | null;
  confirmed_at: string | null;
  created_at: string | null;
};

function raise(context: string, error: DatabaseError): Error {
  const err = new Error(`${context}: ${error.message}`);
  const extended = err as Error & Record<string, unknown>;
  if (error.code) extended.code = error.code;
  if (error.details) extended.details = error.details;
  if (error.hint) extended.hint = error.hint;
  return err;
}

function ensureRows<T>(result: DatabaseResult<T[]>, context: string): T[] {
  if (result.error) throw raise(context, result.error);
  return result.data ?? [];
}

export async function loadSubscribers() {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("subscribers")
    .select<{
      email: string | null;
      source: string | null;
      confirmed_at: string | null;
      created_at: string | null;
      confirmed: boolean | null;
      status: string | null;
    }>("email, source, confirmed_at, created_at, confirmed, status")
    .or("confirmed.eq.true,confirmed_at.not.is.null")
    .eq("status", "active")
    .order("confirmed_at", { ascending: false })
    .fetch();

  const rows = ensureRows(result, "admin.subscribers.list");

  return rows.map(
    (row) =>
      ({
        email: row.email ?? "",
        source: row.source ?? null,
        confirmed_at: row.confirmed_at ?? row.created_at ?? null,
        created_at: row.created_at ?? null,
      }) satisfies AdminSubscriber,
  );
}
