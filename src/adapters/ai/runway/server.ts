import "server-only";

import { serverEnv } from "@/lib/env/server";

const RUNWAY_BASE_URL = (() => {
  const raw = serverEnv.RUNWAY_BASE_URL?.trim() || "https://api.runwayml.com";
  return raw.replace(/\/+$/, "");
})();

const RUNWAY_API_PREFIX = `${RUNWAY_BASE_URL}/v1`;

let cachedApiKey: string | null = null;
let cachedResolved = false;

function resolveApiKey(): string | null {
  if (cachedResolved) return cachedApiKey;
  const candidates = [serverEnv.RUNWAY_API_KEY, process.env.RUNWAY_API_KEY];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      cachedApiKey = candidate.trim();
      cachedResolved = true;
      return cachedApiKey;
    }
  }
  cachedResolved = true;
  cachedApiKey = null;
  return cachedApiKey;
}

export function getRunwayApiKey(): string | null {
  return resolveApiKey();
}

export function hasRunwayApiKey(): boolean {
  const key = resolveApiKey();
  return typeof key === "string" && key.length > 0;
}

export function requireRunwayApiKey(): string {
  const key = resolveApiKey();
  if (!key) {
    throw new Error("Runway API key is not configured");
  }
  return key;
}

function resolveUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${RUNWAY_API_PREFIX}${normalizedPath}`;
}

type RunwayRequestInit = Omit<RequestInit, "headers"> & { headers?: HeadersInit };

export async function fetchRunway(path: string, init: RunwayRequestInit = {}): Promise<Response> {
  const apiKey = requireRunwayApiKey();
  const headers = new Headers(init.headers ?? {});

  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(resolveUrl(path), {
    ...init,
    headers,
  });
}

export type RunwayJsonResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  parsedBody: unknown;
  rawBody: string;
  response: Response;
};

async function drainResponse(
  response: Response,
): Promise<{ rawBody: string; parsedBody: unknown }> {
  try {
    const raw = await response.text();
    if (!raw) {
      return { rawBody: "", parsedBody: null };
    }
    try {
      return { rawBody: raw, parsedBody: JSON.parse(raw) };
    } catch {
      return { rawBody: raw, parsedBody: raw };
    }
  } catch {
    return { rawBody: "", parsedBody: null };
  }
}

export async function postRunwayJson<T>(
  path: string,
  body: unknown,
  init: Omit<RunwayRequestInit, "body"> = {},
): Promise<RunwayJsonResult<T>> {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const response = await fetchRunway(path, {
    method: init.method ?? "POST",
    ...init,
    body: payload,
  });
  const drained = await drainResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok ? ((drained.parsedBody as T) ?? null) : null,
    parsedBody: drained.parsedBody,
    rawBody: drained.rawBody,
    response,
  };
}
