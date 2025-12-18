/**
 * Minimal debug helper to gate noisy logs behind DEBUG/CAPSULES_DEBUG env vars.
 * Usage: debugLog("session", "message", payload);
 */
const RAW_DEBUG =
  (typeof process !== "undefined" && process?.env?.DEBUG) ||
  (typeof process !== "undefined" && process?.env?.CAPSULES_DEBUG) ||
  "";

const DEBUG_NAMESPACES = new Set(
  RAW_DEBUG.split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean),
);

export function isDebugEnabled(namespace: string): boolean {
  if (!namespace) return false;
  if (DEBUG_NAMESPACES.has("*")) return true;
  return DEBUG_NAMESPACES.has(namespace);
}

export function debugLog(namespace: string, ...args: unknown[]): void {
  if (!isDebugEnabled(namespace)) return;
  console.debug(`[${namespace}]`, ...args);
}
