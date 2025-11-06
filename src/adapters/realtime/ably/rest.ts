import { encodeBase64String } from "@/lib/base64";

type AblyRestConfig = {
  baseUrl: string;
  authorizationHeader: string;
  keyName: string;
  environment: string | null;
};

type TokenRequestResponse = {
  token: unknown;
  environment: string | null;
};

let cachedConfig: AblyRestConfig | null = null;
let configFailed = false;

function getEnv(key: string): string | null {
  if (typeof process === "undefined" || !process?.env) return null;
  const raw = process.env[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

function resolveConfig(): AblyRestConfig | null {
  if (configFailed) return null;
  if (cachedConfig) return cachedConfig;

  const rawKey = getEnv("ABLY_API_KEY");
  if (!rawKey) {
    configFailed = true;
    return null;
  }

  const separatorIndex = rawKey.indexOf(":");
  if (separatorIndex === -1) {
    console.error("Ably REST configuration is invalid: missing secret separator");
    configFailed = true;
    return null;
  }

  const keyName = rawKey.slice(0, separatorIndex).trim();
  const secret = rawKey.slice(separatorIndex + 1).trim();

  if (!keyName || !secret) {
    console.error("Ably REST configuration is invalid: missing key name or secret");
    configFailed = true;
    return null;
  }

  const environment = getEnv("ABLY_ENVIRONMENT");
  const baseUrl = environment
    ? `https://rest-${environment}.ably.io`
    : "https://rest.ably.io";

  const authorizationHeader = `Basic ${encodeBase64String(`${keyName}:${secret}`)}`;

  cachedConfig = {
    baseUrl,
    authorizationHeader,
    keyName,
    environment,
  };

  return cachedConfig;
}

export function resetAblyRestConfig(): void {
  cachedConfig = null;
  configFailed = false;
}

export async function publishAblyMessage(
  channel: string,
  name: string,
  payload: unknown,
): Promise<boolean> {
  const config = resolveConfig();
  if (!config) return false;

  const url = `${config.baseUrl}/channels/${encodeURIComponent(channel)}/messages`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: config.authorizationHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ name, data: payload }]),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("Ably REST publish failed", {
        status: response.status,
        statusText: response.statusText,
        body: text,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Ably REST publish error", error);
    return false;
  }
}

export async function createAblyTokenRequest(params: {
  clientId: string;
  ttl: number;
  capability: string;
}): Promise<TokenRequestResponse | null> {
  const config = resolveConfig();
  if (!config) return null;

  const url = `${config.baseUrl}/keys/${encodeURIComponent(config.keyName)}/requestToken`;
  try {
    const timestamp = Date.now();
    const nonce =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${timestamp}-${Math.random().toString(36).slice(2)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: config.authorizationHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: params.clientId,
        ttl: params.ttl,
        capability: params.capability,
        timestamp,
        nonce,
        keyName: config.keyName,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("Ably REST token request failed", {
        status: response.status,
        statusText: response.statusText,
        body: text,
      });
      return null;
    }

    const tokenRequest = await response.json().catch(() => null);
    if (!tokenRequest || typeof tokenRequest !== "object") {
      console.error("Ably REST token request returned invalid payload");
      return null;
    }

    return {
      token: tokenRequest,
      environment: config.environment,
    };
  } catch (error) {
    console.error("Ably REST token request error", error);
    return null;
  }
}
