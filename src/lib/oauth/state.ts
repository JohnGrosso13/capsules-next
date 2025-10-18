import { Buffer } from "node:buffer";

export function encodeState(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeState<T = Record<string, unknown>>(
  state: string | null | undefined,
): T | null {
  try {
    return JSON.parse(Buffer.from(String(state ?? ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
