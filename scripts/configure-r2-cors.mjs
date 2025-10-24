#!/usr/bin/env node
/**
 * Configure Cloudflare R2 bucket CORS via S3 API using the same
 * defaults as the runtime storage adapter.
 *
 * Reads credentials and origins from environment variables. If .env.local
 * exists, this script will parse it and populate missing env vars.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvLocal() {
  const candidates = [
    path.resolve(__dirname, "..", ".env.local"),
    path.resolve(__dirname, "..", "..", ".env.local"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const contents = fs.readFileSync(p, "utf8");
        for (const rawLine of contents.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith("#")) continue;
          const idx = line.indexOf("=");
          if (idx === -1) continue;
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          if (key && !(key in process.env)) {
            // Remove optional surrounding quotes
            const unquoted = value.replace(/^['"]|['"]$/g, "");
            process.env[key] = unquoted;
          }
        }
        return;
      }
    } catch {
      // ignore
    }
  }
}

function originOf(urlLike) {
  if (!urlLike) return null;
  try {
    return new URL(urlLike).origin;
  } catch {
    // If a bare origin was provided (e.g., http://localhost:3000), accept as-is
    if (/^https?:\/\//i.test(urlLike)) return urlLike;
    return null;
  }
}

function buildCorsRule() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    console.error("Missing R2_BUCKET env var");
    process.exit(1);
  }

  const siteOrigin = originOf(process.env.SITE_URL);
  const publicOrigin = originOf(process.env.R2_PUBLIC_BASE_URL);
  const extraRaw = process.env.UPLOAD_CORS_ORIGINS || process.env.R2_UPLOAD_CORS_ORIGINS || "";

  const origins = new Set();
  if (siteOrigin) origins.add(siteOrigin);
  if (publicOrigin) origins.add(publicOrigin);

  for (const piece of extraRaw.split(",")) {
    const val = piece.trim();
    if (!val) continue;
    const o = originOf(val) ?? val;
    if (o) origins.add(o);
  }

  if ((process.env.NODE_ENV || "development") !== "production") {
    [
      "http://localhost:3000",
      "https://localhost:3000",
      "http://127.0.0.1:3000",
      "https://127.0.0.1:3000",
    ].forEach((o) => origins.add(o));
  }

  // Note: Cloudflare API rejects mixed wildcard + origin lists, so no '*' by default.

  // Always ensure OPTIONS is permitted and ETag is exposed for multipart uploads
  const allowedOrigins = Array.from(origins);

  return {
    bucket,
    corsRule: {
      allowedOrigins,
      allowedMethods: ["GET", "PUT", "POST", "HEAD", "DELETE"],
      allowedHeaders: ["*"],
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 60 * 60,
    },
  };
}

async function applyViaCloudflareApi(accountId, token, bucket, rule) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/cors`;
  const payload = {
    rules: [
      {
        allowed_origins: rule.allowedOrigins,
        allowed_methods: rule.allowedMethods,
        allowed_headers: rule.allowedHeaders,
        expose_headers: rule.exposeHeaders,
        max_age_seconds: rule.maxAgeSeconds,
      },
    ],
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success === false) {
    const message = json?.errors?.[0]?.message || response.statusText;
    throw new Error(message || "Cloudflare API request failed");
  }
  console.log("Updated CORS via Cloudflare API.");
}

async function applyViaS3(accountId, accessKeyId, secretAccessKey, bucket, rule) {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  const cors = {
    CORSRules: [
      {
        AllowedOrigins: rule.allowedOrigins,
        AllowedMethods: rule.allowedMethods,
        AllowedHeaders: rule.allowedHeaders,
        ExposeHeaders: rule.exposeHeaders,
        MaxAgeSeconds: rule.maxAgeSeconds,
      },
    ],
  };
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: cors }));
  console.log("Updated CORS via S3-compatible API.");
}

async function main() {
  loadEnvLocal();

  const { bucket, corsRule } = buildCorsRule();
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) {
    console.error("Missing R2_ACCOUNT_ID env var");
    process.exit(1);
  }

  console.log("Proposed CORS rule:");
  console.log(JSON.stringify({ bucket, corsRule }, null, 2));

  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  if (cfToken) {
    try {
      await applyViaCloudflareApi(accountId, cfToken, bucket, corsRule);
      console.log("Allowed origins:", corsRule.allowedOrigins);
      return;
    } catch (error) {
      console.warn("Cloudflare API update failed:", error?.message || error);
    }
  }

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    console.error(
      "Missing R2 access key/secret and Cloudflare API token. Provide CLOUDFLARE_API_TOKEN or R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY.",
    );
    process.exit(1);
  }

  try {
    await applyViaS3(accountId, accessKeyId, secretAccessKey, bucket, corsRule);
    console.log("Allowed origins:", corsRule.allowedOrigins);
  } catch (error) {
    console.error("Failed to update CORS via S3-compatible API:", error?.message || error);
    process.exit(1);
  }
}

main();
