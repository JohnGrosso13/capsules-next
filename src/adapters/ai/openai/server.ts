import "server-only";

import { serverEnv } from "@/lib/env/server";

const OPENAI_BASE_URL = (() => {
  const raw = serverEnv.OPENAI_BASE_URL?.trim() || "https://api.openai.com";
  return raw.replace(/\/+$/, "");
})();

const OPENAI_API_PREFIX = `${OPENAI_BASE_URL}/v1`;

let cachedApiKey: string | null = null;
let cachedResolved = false;

function resolveApiKey(): string | null {
  if (cachedResolved) return cachedApiKey;
  const candidates = [
    serverEnv.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_KEY,
    process.env.OPENAI_SECRET_KEY,
  ];
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

export function getOpenAIApiKey(): string | null {
  return resolveApiKey();
}

export function hasOpenAIApiKey(): boolean {
  const key = resolveApiKey();
  return typeof key === "string" && key.length > 0;
}

export function requireOpenAIApiKey(): string {
  const key = resolveApiKey();
  if (!key) {
    throw new Error("OpenAI API key is not configured");
  }
  return key;
}

function resolveUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${OPENAI_API_PREFIX}${normalizedPath}`;
}

type OpenAIRequestInit = Omit<RequestInit, "headers"> & { headers?: HeadersInit };

export async function fetchOpenAI(path: string, init: OpenAIRequestInit = {}): Promise<Response> {
  const apiKey = requireOpenAIApiKey();
  const headers = new Headers(init.headers ?? {});

  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  const body = init.body ?? null;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(resolveUrl(path), {
    ...init,
    headers,
  });
}

export type OpenAIJsonResult<T> = {
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

export async function postOpenAIJson<T>(
  path: string,
  body: unknown,
  init: Omit<OpenAIRequestInit, "body"> = {},
): Promise<OpenAIJsonResult<T>> {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const response = await fetchOpenAI(path, {
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

export async function postOpenAIForm<T>(
  path: string,
  formData: FormData,
  init: Omit<OpenAIRequestInit, "body"> = {},
): Promise<OpenAIJsonResult<T>> {
  const response = await fetchOpenAI(path, {
    method: init.method ?? "POST",
    ...init,
    body: formData,
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
