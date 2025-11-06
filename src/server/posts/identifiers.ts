import {
  fetchPostRowByIdentifier as fetchPostRowByIdentifierFromRepository,
  resolvePostIdByClientId,
} from "./repository";

export async function resolvePostId(maybeId: string | null | undefined) {
  const value = String(maybeId ?? "").trim();
  if (!value) return null;
  const resolved = await fetchPostRowByIdentifierFromRepository(value);
  if (resolved?.id) {
    return typeof resolved.id === "string" ? resolved.id : String(resolved.id);
  }
  const byClient = await resolvePostIdByClientId(value);
  return byClient;
}
