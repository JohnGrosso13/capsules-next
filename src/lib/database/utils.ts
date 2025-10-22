import type { DatabaseError, DatabaseResult } from "@/ports/database";

export function decorateDatabaseError(context: string, error: DatabaseError): Error {
  const enhanced = new Error(`${context}: ${error.message}`);
  const extended = enhanced as Error & Record<string, unknown>;
  if (error.code) extended.code = error.code;
  if (error.details) extended.details = error.details;
  if (error.hint) extended.hint = error.hint;
  return enhanced;
}

export function expectResult<T>(result: DatabaseResult<T>, context: string): T {
  if (result.error) throw decorateDatabaseError(context, result.error);
  if (result.data === null || result.data === undefined) {
    throw new Error(`${context}: missing result data`);
  }
  return result.data;
}

export function maybeResult<T>(result: DatabaseResult<T>, context: string): T | null {
  if (result.error) throw decorateDatabaseError(context, result.error);
  return result.data ?? null;
}

export function ensureResult(result: DatabaseResult<unknown>, context: string): void {
  if (result.error) throw decorateDatabaseError(context, result.error);
}
