import {
  getCloudflareApiToken,
  getStorageKvNamespaceId,
  getStorageUploadQueueName,
} from "@/config/storage";
import { serverEnv } from "@/lib/env/server";

const CF_API_BASE = serverEnv.R2_ACCOUNT_ID
  ? `https://api.cloudflare.com/client/v4/accounts/${serverEnv.R2_ACCOUNT_ID}`
  : null;

async function callCloudflare(path: string, init: RequestInit & { method: string }) {
  const apiToken = getCloudflareApiToken();
  if (!CF_API_BASE || !apiToken) {
    console.warn("Cloudflare API credentials missing; skipping call to", path);
    return null;
  }
  const response = await fetch(`${CF_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      console.warn(
        `Cloudflare API ${path} unauthorized (${response.status}). Skipping dev-side call.`,
      );
      return null;
    }
    throw new Error(`Cloudflare API ${path} failed (${response.status}): ${text}`);
  }
  return response;
}

export async function putUploadSessionKv(key: string, value: unknown): Promise<void> {
  const namespaceId = getStorageKvNamespaceId();
  if (!namespaceId) return;
  await callCloudflare(`/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify(value),
  });
}

export async function enqueueUploadEvent(body: unknown): Promise<void> {
  const queueName = getStorageUploadQueueName();
  if (!queueName) return;
  await callCloudflare(`/queues/${queueName}/messages`, {
    method: "POST",
    body: JSON.stringify({ messages: [{ body }] }),
  });
}
