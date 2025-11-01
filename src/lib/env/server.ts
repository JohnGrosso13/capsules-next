import "server-only";

import { z } from "zod";

type EnvLookupOptions = {
  fallbacks?: string[];
  format?: (value: string) => string;
};

const readEnv = (
  key: string,
  options: EnvLookupOptions | string[] = {},
): string | undefined => {
  const normalizedOptions = Array.isArray(options) ? { fallbacks: options } : options;
  const { fallbacks = [], format } = normalizedOptions;
  const keys = [key, ...fallbacks];
  for (const candidate of keys) {
    const raw = process.env[candidate];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed.length) continue;
    return format ? format(trimmed) : trimmed;
  }
  return undefined;
};

const optionalString = z.string().optional().transform((value) => value ?? null);
const optionalUrl = z
  .string()
  .url()
  .optional()
  .transform((value) => (value ? value.replace(/\/$/, "") : null));

const optionalPositiveInteger = z
  .preprocess(
    (value) => {
      if (typeof value !== "string") return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
      return Math.floor(parsed);
    },
    z.number().int().positive().optional(),
  )
  .transform((value) => value ?? null);

const optionalVideoDuration = z
  .preprocess(
    (value) => {
      if (typeof value !== "string") return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return undefined;
      const clamped = Math.max(5, Math.min(120, Math.floor(parsed)));
      return clamped;
    },
    z.number().int().min(5).max(120).optional(),
  )
  .transform((value) => value ?? null);

const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required").url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY cannot be empty"),
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_BUCKET: z.string().min(1, "SUPABASE_BUCKET cannot be empty"),
  ABLY_API_KEY: optionalString,
  ABLY_ENVIRONMENT: optionalString,
  CLERK_SECRET_KEY: optionalString,
  CLERK_PUBLISHABLE_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalUrl,
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBED_MODEL: optionalString,
  OPENAI_EMBED_DIM: optionalPositiveInteger,
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  OPENAI_IMAGE_MODEL_DEV: z.string().default("dall-e-2"),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_IMAGE_QUALITY: z
    .enum(["low", "standard", "high"])
    .optional()
    .transform((value) => value ?? null),
  OPENAI_IMAGE_SIZE: z
    .string()
    .regex(/^\d+x\d+$/, "OPENAI_IMAGE_SIZE must match <width>x<height>")
    .default("1024x1024"),
  OPENAI_IMAGE_SIZE_LOW: z
    .string()
    .regex(/^\d+x\d+$/, "OPENAI_IMAGE_SIZE_LOW must match <width>x<height>")
    .default("512x512"),
  OPENAI_VIDEO_MODEL: optionalString,
  OPENAI_VIDEO_RESOLUTION: optionalString,
  OPENAI_VIDEO_MAX_DURATION: optionalVideoDuration,
  SITE_URL: z
    .string()
    .url("SITE_URL must be a valid URL")
    .default("http://localhost:3000")
    .transform((value) => value.replace(/\/$/, "")),
  ADMIN_USERNAME: optionalString,
  ADMIN_PASSWORD: optionalString,
  ADMIN_PASSWORD_HASH: optionalString,
  ADMIN_SESSION_SECRET: optionalString,
  ADMIN_ACCESS_TOKEN: optionalString,
  PINECONE_API_KEY: optionalString,
  PINECONE_ENVIRONMENT: optionalString,
  PINECONE_CONTROLLER_HOST: optionalString,
  PINECONE_INDEX: optionalString,
  PINECONE_NAMESPACE: optionalString,
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID cannot be empty"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID cannot be empty"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY cannot be empty"),
  R2_BUCKET: z.string().min(1, "R2_BUCKET cannot be empty"),
  R2_UPLOAD_PREFIX: z.string().default("uploads"),
  R2_PUBLIC_BASE_URL: optionalUrl,
  CLOUDFLARE_API_TOKEN: optionalString,
  R2_KV_NAMESPACE_ID: optionalString,
  R2_UPLOAD_COMPLETIONS_QUEUE: optionalString,
  CLOUDFLARE_IMAGE_RESIZE_BASE_URL: optionalUrl,
  TURNSTILE_SECRET_KEY: optionalString,
  ALGOLIA_APP_ID: optionalString,
  ALGOLIA_API_KEY: optionalString,
  ALGOLIA_INDEX_PREFIX: optionalString,
  ARTIFACT_EMBEDDING_QUEUE: optionalString,
  ARTIFACT_EMBED_GATEWAY: optionalUrl,
  MUX_TOKEN_ID: optionalString,
  MUX_TOKEN_SECRET: optionalString,
  MUX_WEBHOOK_SECRET: optionalString,
  MUX_ENVIRONMENT: optionalString,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
  STABILITY_API_KEY: optionalString,
  STABILITY_BASE_URL: optionalUrl,
  STABILITY_IMAGE_MODEL: optionalString,
  GIPHY_API_KEY: optionalString,
  GIPHY_RATING: optionalString,
  TENOR_API_KEY: optionalString,
  TENOR_CLIENT_KEY: optionalString,
});

const rawServerEnv = {
  SUPABASE_URL: readEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]),
  SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY", [
    "SUPABASE_SERVICE_ROLE",
    "SUPABASE_SECRET",
    "SUPABASE_KEY",
  ]),
  SUPABASE_ANON_KEY: readEnv("SUPABASE_ANON_KEY", ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
  SUPABASE_BUCKET: readEnv("SUPABASE_BUCKET", ["AI_IMAGES_BUCKET"]),
  ABLY_API_KEY: readEnv("ABLY_API_KEY", ["ABLY_SERVER_KEY", "ABLY_KEY", "ABLY_REST_KEY"]),
  ABLY_ENVIRONMENT: readEnv("ABLY_ENVIRONMENT"),
  CLERK_SECRET_KEY: readEnv("CLERK_SECRET_KEY", ["CLERK_API_KEY"]),
  CLERK_PUBLISHABLE_KEY: readEnv("CLERK_PUBLISHABLE_KEY", ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]),
  OPENAI_API_KEY: readEnv("OPENAI_API_KEY", ["OPENAI_KEY", "OPENAI_SECRET_KEY"]),
  OPENAI_BASE_URL: readEnv("OPENAI_BASE_URL", ["AI_BASE_URL"]),
  OPENAI_MODEL: readEnv("OPENAI_MODEL", ["AI_MODEL", "GPT_MODEL"]),
  OPENAI_EMBED_MODEL: readEnv("OPENAI_EMBED_MODEL", ["OPENAI_EMBEDDING_MODEL"]),
  OPENAI_EMBED_DIM: readEnv("OPENAI_EMBED_DIM", ["OPENAI_EMBED_DIMENSIONS"]),
  OPENAI_IMAGE_MODEL: readEnv("OPENAI_IMAGE_MODEL", ["AI_IMAGE_MODEL", "IMAGE_MODEL"]),
  OPENAI_IMAGE_MODEL_DEV: readEnv("OPENAI_IMAGE_MODEL_DEV", ["AI_IMAGE_MODEL_DEV", "IMAGE_MODEL_DEV"]),
  OPENAI_TRANSCRIBE_MODEL: readEnv("OPENAI_TRANSCRIBE_MODEL", [
    "OPENAI_TRANSCRIBE",
    "OPENAI_MODEL_TRANSCRIBE",
  ]),
  OPENAI_IMAGE_QUALITY: readEnv("OPENAI_IMAGE_QUALITY", [
    "IMAGE_QUALITY_OVERRIDE",
    "AI_IMAGE_QUALITY",
    "TEST_IMAGE_QUALITY",
  ])?.toLowerCase(),
  OPENAI_IMAGE_SIZE: readEnv("OPENAI_IMAGE_SIZE"),
  OPENAI_IMAGE_SIZE_LOW: readEnv("OPENAI_IMAGE_SIZE_LOW"),
  OPENAI_VIDEO_MODEL: readEnv("OPENAI_VIDEO_MODEL", ["AI_VIDEO_MODEL", "VIDEO_MODEL"]),
  OPENAI_VIDEO_RESOLUTION: readEnv("OPENAI_VIDEO_RESOLUTION", ["AI_VIDEO_RESOLUTION"]),
  OPENAI_VIDEO_MAX_DURATION: readEnv("OPENAI_VIDEO_MAX_DURATION", [
    "AI_VIDEO_MAX_DURATION",
    "VIDEO_MAX_DURATION",
  ]),
  SITE_URL: readEnv("SITE_URL", ["NEXT_PUBLIC_SITE_URL"]),
  ADMIN_USERNAME: readEnv("ADMIN_USERNAME", ["CAPSULES_ADMIN_USERNAME", "ADMIN_USER"]),
  ADMIN_PASSWORD: readEnv("ADMIN_PASSWORD", ["CAPSULES_ADMIN_PASSWORD"]),
  ADMIN_PASSWORD_HASH: readEnv("ADMIN_PASSWORD_HASH", ["CAPSULES_ADMIN_PASSWORD_HASH"]),
  ADMIN_SESSION_SECRET: readEnv("ADMIN_SESSION_SECRET", ["CAPSULES_ADMIN_SESSION_SECRET"]),
  ADMIN_ACCESS_TOKEN: readEnv("ADMIN_ACCESS_TOKEN", ["CAPSULES_ADMIN_ACCESS_TOKEN", "ADMIN_TOKEN"]),
  PINECONE_API_KEY: readEnv("PINECONE_API_KEY"),
  PINECONE_ENVIRONMENT: readEnv("PINECONE_ENVIRONMENT", [
    "PINECONE_REGION",
    "PINECONE_PROJECT_ENV",
  ]),
  PINECONE_CONTROLLER_HOST: readEnv("PINECONE_CONTROLLER_HOST", [
    "PINECONE_HOST",
    "PINECONE_API_HOST",
  ]),
  PINECONE_INDEX: readEnv("PINECONE_INDEX", ["PINECONE_PROJECT_INDEX"]),
  PINECONE_NAMESPACE: readEnv("PINECONE_NAMESPACE", ["PINECONE_PROJECT_NAMESPACE"]),
  R2_ACCOUNT_ID: readEnv("R2_ACCOUNT_ID", ["CLOUDFLARE_ACCOUNT_ID"]),
  R2_ACCESS_KEY_ID: readEnv("R2_ACCESS_KEY_ID", [
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
  ]),
  R2_SECRET_ACCESS_KEY: readEnv("R2_SECRET_ACCESS_KEY", [
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  ]),
  R2_BUCKET: readEnv("R2_BUCKET", ["CLOUDFLARE_R2_BUCKET"]),
  R2_UPLOAD_PREFIX: readEnv("R2_UPLOAD_PREFIX"),
  R2_PUBLIC_BASE_URL: readEnv("R2_PUBLIC_BASE_URL", ["NEXT_PUBLIC_R2_PUBLIC_BASE_URL"]),
  CLOUDFLARE_API_TOKEN: readEnv("CLOUDFLARE_API_TOKEN", ["CF_API_TOKEN", "CLOUDFLARE_TOKEN"]),
  R2_KV_NAMESPACE_ID: readEnv("R2_KV_NAMESPACE_ID", ["CLOUDFLARE_R2_KV_NAMESPACE_ID"]),
  R2_UPLOAD_COMPLETIONS_QUEUE: readEnv("R2_UPLOAD_COMPLETIONS_QUEUE", [
    "CLOUDFLARE_R2_UPLOAD_QUEUE",
    "CLOUDFLARE_UPLOAD_QUEUE",
  ]),
  CLOUDFLARE_IMAGE_RESIZE_BASE_URL: readEnv("CLOUDFLARE_IMAGE_RESIZE_BASE_URL"),
  TURNSTILE_SECRET_KEY: readEnv("TURNSTILE_SECRET_KEY", ["CLOUDFLARE_TURNSTILE_SECRET"]),
  ALGOLIA_APP_ID: readEnv("ALGOLIA_APP_ID", ["NEXT_PUBLIC_ALGOLIA_APP_ID"]),
  ALGOLIA_API_KEY: readEnv("ALGOLIA_API_KEY"),
  ALGOLIA_INDEX_PREFIX: readEnv("ALGOLIA_INDEX_PREFIX", ["NEXT_PUBLIC_ALGOLIA_INDEX_PREFIX"]),
  ARTIFACT_EMBEDDING_QUEUE: readEnv("ARTIFACT_EMBEDDING_QUEUE"),
  ARTIFACT_EMBED_GATEWAY: readEnv("ARTIFACT_EMBED_GATEWAY", ["ARTIFACT_EMBEDDING_GATEWAY"]),
  MUX_TOKEN_ID: readEnv("MUX_TOKEN_ID"),
  MUX_TOKEN_SECRET: readEnv("MUX_TOKEN_SECRET"),
  MUX_WEBHOOK_SECRET: readEnv("MUX_WEBHOOK_SECRET", ["MUX_SIGNING_SECRET"]),
  MUX_ENVIRONMENT: readEnv("MUX_ENVIRONMENT"),
  UPSTASH_REDIS_REST_URL: readEnv("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: readEnv("UPSTASH_REDIS_REST_TOKEN"),
  STABILITY_API_KEY: readEnv("STABILITY_API_KEY"),
  STABILITY_BASE_URL: readEnv("STABILITY_BASE_URL"),
  STABILITY_IMAGE_MODEL: readEnv("STABILITY_IMAGE_MODEL"),
  GIPHY_API_KEY: readEnv("GIPHY_API_KEY"),
  GIPHY_RATING: readEnv("GIPHY_RATING"),
  TENOR_API_KEY: readEnv("TENOR_API_KEY"),
  TENOR_CLIENT_KEY: readEnv("TENOR_CLIENT_KEY"),
} satisfies Record<string, string | undefined>;

const parsedServerEnv = serverEnvSchema.safeParse(rawServerEnv);

if (!parsedServerEnv.success) {
  const formattedErrors = parsedServerEnv.error.flatten();
  const details = Object.entries(formattedErrors.fieldErrors)
    .map(([field, issues]) => `${field}: ${issues?.join(", ") ?? "invalid"}`)
    .join("; ");
  throw new Error(`Invalid server environment configuration: ${details}`);
}

export const serverEnv = Object.freeze(parsedServerEnv.data);
export type ServerEnv = typeof serverEnv;
