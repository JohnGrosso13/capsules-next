import "server-only";

import { serverEnv } from "@/lib/env/server";
import { generateStorageObjectKey } from "@/lib/storage/keys";
import type {
  StorageMultipartAbortParams,
  StorageMultipartCompleteParams,
  StorageMultipartInitParams,
  StorageMultipartInitResult,
  StorageProvider,
  StorageUploadBufferParams,
  StorageUploadBufferResult,
} from "@/ports/storage";

const AWS_ALGORITHM = "AWS4-HMAC-SHA256";
const AWS_SERVICE = "s3";
const AWS_REGION = "auto";
const MAX_PARTS = 10_000;
const MIN_PART_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PART_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const DEFAULT_PART_URL_TTL_SECONDS = 60 * 30;

const textEncoder = new TextEncoder();

type StringMap = Record<string, string>;

type SignedRequest = {
  url: string;
  headers: Record<string, string>;
  body?: BodyInit;
};

type BuildRequestOptions = {
  method: string;
  key?: string;
  bucketLevel?: boolean;
  query?: Record<string, string | number | null | undefined>;
  headers?: Record<string, string | null | undefined>;
  body?: Uint8Array | ArrayBuffer | ArrayBufferView | string | null;
  presign?: { expiresIn?: number };
};

function sanitizePrefix(value: string): string {
  const trimmed = value.replace(/\/$/, "").trim();
  return trimmed.length ? trimmed : "uploads";
}

function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const entries: Record<string, string> = {};
  const sanitizeKey = (rawKey: string): string | null => {
    const normalized = rawKey
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return normalized.length ? normalized : null;
  };
  const sanitizeValue = (rawValue: unknown): string | null => {
    if (rawValue === undefined || rawValue === null) return null;
    const text = String(rawValue);
    if (!text.length) return null;
    let buffer = "";
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code <= 31 || code === 127) continue;
      if (code > 126) {
        buffer += encodeURIComponent(char);
      } else {
        buffer += char;
      }
    }
    buffer = buffer.trim();
    if (!buffer.length) return null;
    if (buffer.length > 1024) {
      let truncated = buffer.slice(0, 1024);
      const percentIndex = truncated.lastIndexOf("%");
      if (percentIndex !== -1 && percentIndex > truncated.length - 3) {
        truncated = truncated.slice(0, percentIndex);
      }
      buffer = truncated;
    }
    return buffer.length ? buffer : null;
  };
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = sanitizeKey(key);
    if (!normalizedKey) continue;
    const sanitizedValue = sanitizeValue(value);
    if (sanitizedValue === null) continue;
    entries[normalizedKey] = sanitizedValue;
  }
  return Object.keys(entries).length ? entries : undefined;
}

function resolvePartSize(fileSize: number | null | undefined): number {
  if (!fileSize || fileSize <= 0) {
    return 16 * 1024 * 1024; // default 16 MB
  }
  const raw = Math.ceil(fileSize / MAX_PARTS);
  const bounded = Math.max(raw, MIN_PART_SIZE_BYTES);
  return Math.min(bounded, MAX_PART_SIZE_BYTES);
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKeyPath(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function toHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < view.length; i += 1) {
    const byte = view[i];
    if (byte === undefined) continue;
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function toArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  const view = input as ArrayBufferView;
  const uintView = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const copy = new Uint8Array(uintView.length);
  copy.set(uintView);
  return copy.buffer;
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return toHex(digest);
}

async function hmac(keyData: ArrayBuffer | ArrayBufferView, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyData),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, toArrayBuffer(textEncoder.encode(data)));
}

async function deriveSigningKey(secretAccessKey: string, dateStamp: string): Promise<ArrayBuffer> {
  const kSecret = textEncoder.encode(`AWS4${secretAccessKey}`);
  const kDate = await hmac(kSecret, dateStamp);
  const kRegion = await hmac(kDate, AWS_REGION);
  const kService = await hmac(kRegion, AWS_SERVICE);
  return hmac(kService, "aws4_request");
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function ensureUint8Array(input: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  throw new TypeError("Invalid binary payload");
}

function buildMetadataHeaders(metadata: Record<string, string> | undefined): StringMap {
  if (!metadata) return {};
  const headers: StringMap = {};
  for (const [key, value] of Object.entries(metadata)) {
    headers[`x-amz-meta-${key}`] = value;
  }
  return headers;
}

function buildQueryEntries(
  query: Record<string, string | number | null | undefined> | undefined,
): Array<[string, string]> {
  if (!query) return [];
  const entries: Array<[string, string]> = [];
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) {
      entries.push([key, ""]);
    } else {
      entries.push([key, String(rawValue)]);
    }
  }
  return entries;
}

function sortQueryEntries(entries: Array<[string, string]>): Array<[string, string]> {
  return entries
    .map(([key, value]) => [key, value] as [string, string])
    .sort((a, b) => {
      if (a[0] === b[0]) {
        return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
      }
      return a[0] < b[0] ? -1 : 1;
    });
}

function buildQueryString(entries: Array<[string, string]>): string {
  if (!entries.length) return "";
  return entries
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function extractXmlTagValue(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(pattern);
  if (!match) return null;
  return match[1]?.trim() ?? null;
}

class R2StorageProvider implements StorageProvider {
  readonly name = "r2";

  private readonly bucket: string;
  private readonly accountId: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly uploadPrefix: string;
  private readonly host: string;
  private corsConfigured = false;
  private corsPromise: Promise<void> | null = null;

  constructor() {
    this.bucket = serverEnv.R2_BUCKET;
    this.accountId = serverEnv.R2_ACCOUNT_ID;
    this.accessKeyId = serverEnv.R2_ACCESS_KEY_ID;
    this.secretAccessKey = serverEnv.R2_SECRET_ACCESS_KEY;
    this.uploadPrefix = sanitizePrefix(serverEnv.R2_UPLOAD_PREFIX);
    this.host = `${this.accountId}.r2.cloudflarestorage.com`;
  }

  getUploadPrefix(): string {
    return this.uploadPrefix;
  }

  private buildResourcePath(key?: string, bucketLevel = false): string {
    if (bucketLevel || typeof key !== "string" || !key.length) {
      return `/${this.bucket}`;
    }
    const encodedKey = encodeKeyPath(key.replace(/^\/+/, ""));
    return `/${this.bucket}/${encodedKey}`;
  }

  private async buildSignedRequest(options: BuildRequestOptions): Promise<SignedRequest> {
    const method = options.method.toUpperCase();
    const resourcePath = this.buildResourcePath(options.key, options.bucketLevel);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${AWS_REGION}/${AWS_SERVICE}/aws4_request`;
    const queryEntries = buildQueryEntries(options.query);

    const headers: Record<string, string> = {
      host: this.host,
    };

    if (!options.presign) {
      headers["x-amz-date"] = amzDate;
    }

    if (options.headers) {
      for (const [rawKey, rawValue] of Object.entries(options.headers)) {
        if (rawValue === undefined || rawValue === null) continue;
        headers[rawKey.toLowerCase()] = rawValue;
      }
    }

    const isPresign = Boolean(options.presign);
    let bodyInit: BodyInit | undefined;
    let payloadHash = "UNSIGNED-PAYLOAD";

    if (!isPresign) {
      if (typeof options.body === "string") {
        payloadHash = await sha256Hex(options.body);
        bodyInit = options.body;
      } else if (options.body instanceof Uint8Array) {
        payloadHash = await sha256Hex(options.body);
        bodyInit = toArrayBuffer(options.body);
      } else if (options.body) {
        const bytes = ensureUint8Array(options.body);
        payloadHash = await sha256Hex(bytes);
        bodyInit = toArrayBuffer(bytes);
      }
      headers["x-amz-content-sha256"] = payloadHash;
      if (!headers["x-amz-date"]) {
        headers["x-amz-date"] = amzDate;
      }
    }

    const canonicalHeadersEntries: Array<[string, string]> = Object.entries(headers).map(
      ([key, value]) => [key.toLowerCase(), normalizeHeaderValue(value)] as [string, string],
    );
    canonicalHeadersEntries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    const canonicalHeaders = canonicalHeadersEntries.map(([key, value]) => `${key}:${value}\n`).join("");
    const signedHeaders = canonicalHeadersEntries.map(([key]) => key).join(";");

    const presignParams: Array<[string, string]> = [];
    if (isPresign) {
      const expiresIn = options.presign?.expiresIn ?? DEFAULT_PART_URL_TTL_SECONDS;
      presignParams.push(["X-Amz-Algorithm", AWS_ALGORITHM]);
      presignParams.push(["X-Amz-Credential", `${this.accessKeyId}/${credentialScope}`]);
      presignParams.push(["X-Amz-Date", amzDate]);
      presignParams.push(["X-Amz-Expires", String(expiresIn)]);
      presignParams.push(["X-Amz-SignedHeaders", signedHeaders]);
    }

    const canonicalQueryEntries = sortQueryEntries([...queryEntries, ...presignParams]);
    const canonicalQueryString = buildQueryString(canonicalQueryEntries);

    const canonicalRequest = [
      method,
      resourcePath,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      isPresign ? "UNSIGNED-PAYLOAD" : payloadHash,
    ].join("\n");

    const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
    const stringToSign = [AWS_ALGORITHM, amzDate, credentialScope, hashedCanonicalRequest].join("\n");
    const signingKey = await deriveSigningKey(this.secretAccessKey, dateStamp);
    const signature = toHex(await hmac(signingKey, stringToSign));

    let finalQueryEntries = canonicalQueryEntries;
    if (isPresign) {
      finalQueryEntries = sortQueryEntries([...canonicalQueryEntries, ["X-Amz-Signature", signature]]);
    }

    const finalQueryString = buildQueryString(finalQueryEntries);
    const signedUrl = `https://${this.host}${resourcePath}${finalQueryString ? `?${finalQueryString}` : ""}`;

    if (isPresign) {
      return { url: signedUrl, headers: {} };
    }

    const authorizationHeader = `${AWS_ALGORITHM} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    headers.authorization = authorizationHeader;

    const request: SignedRequest = {
      url: signedUrl,
      headers,
    };
    if (bodyInit !== undefined) {
      request.body = bodyInit;
    }
    return request;
  }

  private async signedFetch(options: BuildRequestOptions): Promise<Response> {
    const signed = await this.buildSignedRequest(options);
    const fetchInit: RequestInit = {
      method: options.method,
      headers: signed.headers,
      ...(signed.body !== undefined ? { body: signed.body } : {}),
    };
    const response = await fetch(signed.url, fetchInit);
    if (!response.ok) {
      let details = "";
      try {
        details = await response.text();
      } catch {
        // ignore
      }
      throw new Error(
        `R2 request failed (${options.method} ${signed.url}): ${response.status} ${
          details ? `- ${details.slice(0, 200)}` : ""
        }`,
      );
    }
    return response;
  }

  private async ensureCors(): Promise<void> {
    if (this.corsConfigured) return;
    if (this.corsPromise) {
      try {
        await this.corsPromise;
      } catch {
        // handled below
      }
      return;
    }

    const resolveOrigin = (candidate: string | null | undefined): string | null => {
      if (!candidate) return null;
      try {
        return new URL(candidate).origin;
      } catch {
        return null;
      }
    };

    const origins = new Set<string>();
    const siteOrigin = resolveOrigin(serverEnv.SITE_URL);
    if (siteOrigin) origins.add(siteOrigin);
    const publicOrigin = resolveOrigin(serverEnv.R2_PUBLIC_BASE_URL);
    if (publicOrigin) origins.add(publicOrigin);

    const extraOriginsRaw =
      process.env.UPLOAD_CORS_ORIGINS || process.env.R2_UPLOAD_CORS_ORIGINS || "";
    extraOriginsRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const origin = resolveOrigin(entry) ?? entry;
        if (origin) origins.add(origin);
      });

    if (process.env.NODE_ENV !== "production") {
      origins.add("*");
    }

    const hasWildcard = origins.has("*");
    if (hasWildcard) origins.delete("*");
    let allowedOrigins = Array.from(origins).filter((origin) => {
      if (!origin) return false;
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(origin) || origin === "*";
    });
    if (!allowedOrigins.length || hasWildcard) {
      allowedOrigins = ["*"];
    }

    const corsXml = `<CORSConfiguration><CORSRule>${[
      ...allowedOrigins.map((origin) => `<AllowedOrigin>${origin}</AllowedOrigin>`),
      "<AllowedMethod>GET</AllowedMethod>",
      "<AllowedMethod>PUT</AllowedMethod>",
      "<AllowedMethod>POST</AllowedMethod>",
      "<AllowedHeader>*</AllowedHeader>",
      "<ExposeHeader>ETag</ExposeHeader>",
      "<MaxAgeSeconds>3600</MaxAgeSeconds>",
    ].join("")}</CORSRule></CORSConfiguration>`;

    this.corsPromise = this.signedFetch({
      method: "PUT",
      bucketLevel: true,
      query: { cors: "" },
      headers: { "content-type": "application/xml" },
      body: corsXml,
    })
      .then(() => {
        this.corsConfigured = true;
      })
      .catch((error) => {
        console.warn("R2 CORS configuration failed", error);
      })
      .finally(() => {
        this.corsPromise = null;
      });

    await this.corsPromise;
  }

  async createMultipartUpload(
    params: StorageMultipartInitParams,
  ): Promise<StorageMultipartInitResult> {
    await this.ensureCors();

    const key = generateStorageObjectKey({
      prefix: this.uploadPrefix,
      ownerId: params.ownerId,
      filename: params.filename,
      contentType: params.contentType,
      kind: params.kind ?? null,
    });

    const sanitizedMetadata = sanitizeMetadata(params.metadata);
    const metadataHeaders = buildMetadataHeaders(sanitizedMetadata);
    const headers: Record<string, string> = { ...metadataHeaders };
    if (params.contentType) {
      headers["content-type"] = params.contentType;
    }

    const response = await this.signedFetch({
      method: "POST",
      key,
      query: { uploads: "" },
      headers,
    });

    const xml = await response.text();
    const uploadId = extractXmlTagValue(xml, "UploadId");
    if (!uploadId) {
      throw new Error("Failed to initialize multipart upload");
    }

    const partSize = resolvePartSize(params.fileSize);
    const effectiveParts =
      params.totalParts && params.totalParts > 0
        ? params.totalParts
        : Math.ceil((params.fileSize ?? partSize) / partSize);
    const count = Math.max(1, Math.min(effectiveParts, MAX_PARTS));
    const expires = new Date(Date.now() + DEFAULT_PART_URL_TTL_SECONDS * 1000);

    const parts = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const partNumber = index + 1;
        const presigned = await this.buildSignedRequest({
          method: "PUT",
          key,
          query: { partNumber, uploadId },
          presign: { expiresIn: DEFAULT_PART_URL_TTL_SECONDS },
        });
        return { partNumber, url: presigned.url, expiresAt: expires.toISOString() };
      }),
    );

    const absoluteUrl = this.getPublicUrl(key);

    return {
      uploadId,
      key,
      bucket: this.bucket,
      partSize,
      parts,
      absoluteUrl,
    };
  }

  async completeMultipartUpload(params: StorageMultipartCompleteParams): Promise<void> {
    if (!params.parts.length) {
      throw new Error("No parts provided for completion");
    }

    const sortedParts = [...params.parts]
      .map((part) => ({
        partNumber: part.partNumber,
        etag: part.etag.replace(/"/g, ""),
      }))
      .sort((a, b) => a.partNumber - b.partNumber);

    const payload = `<CompleteMultipartUpload>${sortedParts
      .map(
        (part) =>
          `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`,
      )
      .join("")}</CompleteMultipartUpload>`;

    await this.signedFetch({
      method: "POST",
      key: params.key,
      query: { uploadId: params.uploadId },
      headers: { "content-type": "application/xml" },
      body: payload,
    });
  }

  async abortMultipartUpload(params: StorageMultipartAbortParams): Promise<void> {
    await this.signedFetch({
      method: "DELETE",
      key: params.key,
      query: { uploadId: params.uploadId },
    });
  }

  getPublicUrl(key: string): string {
    const normalizedKey = key.replace(/^\/+/, "");
    const base = serverEnv.R2_PUBLIC_BASE_URL;
    let baseHost = "";
    if (base) {
      try {
        baseHost = new URL(base).host.toLowerCase();
      } catch {
        baseHost = "";
      }
    }
    const isPlaceholder = baseHost.endsWith(".local.example");
    const shouldUseProxy = !base || isPlaceholder;
    if (shouldUseProxy) {
      const encodedKey = normalizedKey.split("/").map(encodeURIComponent).join("/");
      return `/api/uploads/r2/object/${encodedKey}`;
    }

    if (base) {
      return `${base.replace(/\/$/, "")}/${normalizedKey}`;
    }

    try {
      return `https://${this.bucket}.${this.host}/${normalizedKey}`;
    } catch {
      return `https://${this.host}/${normalizedKey}`;
    }
  }

  async uploadBuffer(params: StorageUploadBufferParams): Promise<StorageUploadBufferResult> {
    const metadata = params.metadata ? sanitizeMetadata(params.metadata) : undefined;
    const metadataHeaders = buildMetadataHeaders(metadata);
    const bytes = ensureUint8Array(params.body);

    await this.signedFetch({
      method: "PUT",
      key: params.key,
      headers: {
        ...metadataHeaders,
        "content-type": params.contentType,
      },
      body: bytes,
    });

    return {
      key: params.key,
      url: this.getPublicUrl(params.key),
    };
  }

  async getSignedObjectUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const signed = await this.buildSignedRequest({
      method: "GET",
      key,
      presign: { expiresIn: expiresInSeconds },
    });
    return signed.url;
  }
}

let providerInstance: StorageProvider | null = null;

export function getR2StorageProvider(): StorageProvider {
  if (!providerInstance) {
    providerInstance = new R2StorageProvider();
  }
  return providerInstance;
}

export async function getR2SignedObjectUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const provider = getR2StorageProvider() as R2StorageProvider;
  return provider.getSignedObjectUrl(key, expiresInSeconds);
}
