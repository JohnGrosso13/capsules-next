export type ServerEnv = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string | null;
  SUPABASE_BUCKET: string;
  ABLY_API_KEY: string | null;
  ABLY_ENVIRONMENT: string | null;
  CLERK_SECRET_KEY: string | null;
  CLERK_PUBLISHABLE_KEY: string | null;
  OPENAI_API_KEY: string | null;
  OPENAI_BASE_URL: string | null;
  OPENAI_MODEL: string;
  OPENAI_EMBED_MODEL: string | null;
  OPENAI_EMBED_DIM: number | null;
  OPENAI_IMAGE_MODEL: string;
  OPENAI_IMAGE_MODEL_DEV: string | null;
  OPENAI_TRANSCRIBE_MODEL: string;
  OPENAI_IMAGE_QUALITY: "low" | "standard" | "high" | null;
  OPENAI_IMAGE_SIZE: string;
  OPENAI_IMAGE_SIZE_LOW: string;
  OPENAI_VIDEO_MODEL: string | null;
  OPENAI_VIDEO_RESOLUTION: string | null;
  OPENAI_VIDEO_MAX_DURATION: number | null;
  SITE_URL: string;
  ADMIN_USERNAME: string | null;
  ADMIN_PASSWORD: string | null;
  ADMIN_PASSWORD_HASH: string | null;
  ADMIN_SESSION_SECRET: string | null;
  ADMIN_ACCESS_TOKEN: string | null;
  PINECONE_API_KEY: string | null;
  PINECONE_ENVIRONMENT: string | null;
  PINECONE_CONTROLLER_HOST: string | null;
  PINECONE_INDEX: string | null;
  PINECONE_NAMESPACE: string | null;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_UPLOAD_PREFIX: string;
  R2_PUBLIC_BASE_URL: string | null;
  CLOUDFLARE_API_TOKEN: string | null;
  R2_KV_NAMESPACE_ID: string | null;
  R2_UPLOAD_COMPLETIONS_QUEUE: string | null;
  CLOUDFLARE_IMAGE_RESIZE_BASE_URL: string | null;
  TURNSTILE_SECRET_KEY: string | null;
  ALGOLIA_APP_ID: string | null;
  ALGOLIA_API_KEY: string | null;
  ALGOLIA_INDEX_PREFIX: string | null;
  ARTIFACT_EMBEDDING_QUEUE: string | null;
  ARTIFACT_EMBED_GATEWAY: string | null;
  MUX_TOKEN_ID: string | null;
  MUX_TOKEN_SECRET: string | null;
  MUX_WEBHOOK_SECRET: string | null;
  MUX_ENVIRONMENT: string | null;
  UPSTASH_REDIS_REST_URL: string | null;
  UPSTASH_REDIS_REST_TOKEN: string | null;
  STABILITY_API_KEY: string | null;
  STABILITY_BASE_URL: string | null;
  STABILITY_IMAGE_MODEL: string | null;
  GIPHY_API_KEY: string | null;
  GIPHY_RATING: string | null;
  TENOR_API_KEY: string | null;
  TENOR_CLIENT_KEY: string | null;
};

function getEnv(name: string, fallbacks: string[] = [], options: { required?: boolean } = {}) {
  const sources = [process.env[name], ...fallbacks.map((key) => process.env[key])];
  const value = sources.find((entry) => typeof entry === "string" && entry.length > 0);
  if (!value && options.required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? null;
}

const siteUrl = getEnv("SITE_URL", ["NEXT_PUBLIC_SITE_URL"]) || "http://localhost:3000";
const openAiModel = getEnv("OPENAI_MODEL", ["AI_MODEL", "GPT_MODEL"]) || "gpt-4o-mini";
const openAiBaseUrlRaw = getEnv("OPENAI_BASE_URL", ["AI_BASE_URL"]);
const openAiImageModel =
  getEnv("OPENAI_IMAGE_MODEL", ["AI_IMAGE_MODEL", "IMAGE_MODEL"]) || "gpt-image-1";
const openAiImageModelDev =
  getEnv("OPENAI_IMAGE_MODEL_DEV", ["AI_IMAGE_MODEL_DEV", "IMAGE_MODEL_DEV"]) || "dall-e-2";
const openAiTranscribeModel =
  getEnv("OPENAI_TRANSCRIBE_MODEL", ["OPENAI_TRANSCRIBE", "OPENAI_MODEL_TRANSCRIBE"]) ||
  "gpt-4o-mini-transcribe";
const openAiVideoModel = getEnv("OPENAI_VIDEO_MODEL", ["AI_VIDEO_MODEL", "VIDEO_MODEL"]);
const openAiVideoResolution = getEnv("OPENAI_VIDEO_RESOLUTION", ["AI_VIDEO_RESOLUTION"]);
const openAiVideoDurationRaw =
  getEnv("OPENAI_VIDEO_MAX_DURATION", ["AI_VIDEO_MAX_DURATION", "VIDEO_MAX_DURATION"]) ?? null;
const openAiVideoDuration =
  openAiVideoDurationRaw && Number.isFinite(Number(openAiVideoDurationRaw))
    ? Number(openAiVideoDurationRaw)
    : null;
const openAiQualityRaw =
  getEnv("OPENAI_IMAGE_QUALITY", [
    "IMAGE_QUALITY_OVERRIDE",
    "AI_IMAGE_QUALITY",
    "TEST_IMAGE_QUALITY",
  ]) || null;
const normalizedQuality = openAiQualityRaw ? openAiQualityRaw.trim().toLowerCase() : null;
const pineconeEnvironment = getEnv("PINECONE_ENVIRONMENT", [
  "PINECONE_REGION",
  "PINECONE_PROJECT_ENV",
]);
const pineconeControllerHost = getEnv("PINECONE_CONTROLLER_HOST", [
  "PINECONE_HOST",
  "PINECONE_API_HOST",
]);
const pineconeIndex = getEnv("PINECONE_INDEX", ["PINECONE_PROJECT_INDEX"]);
const pineconeNamespace = getEnv("PINECONE_NAMESPACE", ["PINECONE_PROJECT_NAMESPACE"]);
const r2PublicBaseUrlRaw = getEnv("R2_PUBLIC_BASE_URL", ["NEXT_PUBLIC_R2_PUBLIC_BASE_URL"]);
const r2PublicBaseUrl = r2PublicBaseUrlRaw ? r2PublicBaseUrlRaw.replace(/\/$/, "") : null;
const imageResizeBaseUrlRaw = getEnv("CLOUDFLARE_IMAGE_RESIZE_BASE_URL", []);
const imageResizeBaseUrl = imageResizeBaseUrlRaw ? imageResizeBaseUrlRaw.replace(/\/$/, "") : null;
const algoliaAppId = getEnv("ALGOLIA_APP_ID", ["NEXT_PUBLIC_ALGOLIA_APP_ID"]);
const algoliaApiKey = getEnv("ALGOLIA_API_KEY", []);
const algoliaIndexPrefix = getEnv("ALGOLIA_INDEX_PREFIX", ["NEXT_PUBLIC_ALGOLIA_INDEX_PREFIX"]);
const artifactEmbeddingQueue = getEnv("ARTIFACT_EMBEDDING_QUEUE", []);
const artifactEmbedGateway = getEnv("ARTIFACT_EMBED_GATEWAY", ["ARTIFACT_EMBEDDING_GATEWAY"]);
const stabilityApiKey = getEnv("STABILITY_API_KEY", []);
const stabilityBaseUrlRaw = getEnv("STABILITY_BASE_URL", []);
const stabilityBaseUrl = stabilityBaseUrlRaw ? stabilityBaseUrlRaw.trim() : null;
const stabilityImageModel = getEnv("STABILITY_IMAGE_MODEL", ["STABILITY_MODEL"]);
const tenorApiKey = getEnv("TENOR_API_KEY", []);
const tenorClientKey = getEnv("TENOR_CLIENT_KEY", ["NEXT_PUBLIC_TENOR_CLIENT_KEY"]);
const giphyApiKey = getEnv("GIPHY_API_KEY", []);
const giphyRating = getEnv("GIPHY_RATING", ["NEXT_PUBLIC_GIPHY_RATING"]);

export const serverEnv: ServerEnv = {
  SUPABASE_URL: getEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"], { required: true })!,
  SUPABASE_SERVICE_ROLE_KEY: getEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    ["SUPABASE_SERVICE_ROLE", "SUPABASE_SECRET", "SUPABASE_KEY"],
    { required: true },
  )!,
  SUPABASE_ANON_KEY: getEnv("SUPABASE_ANON_KEY", ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
  SUPABASE_BUCKET: getEnv("SUPABASE_BUCKET", ["AI_IMAGES_BUCKET"], { required: true })!,
  ABLY_API_KEY: getEnv("ABLY_API_KEY", ["ABLY_SERVER_KEY", "ABLY_KEY", "ABLY_REST_KEY"]),
  ABLY_ENVIRONMENT: getEnv("ABLY_ENVIRONMENT", []),
  CLERK_SECRET_KEY: getEnv("CLERK_SECRET_KEY", ["CLERK_API_KEY"]),
  CLERK_PUBLISHABLE_KEY: getEnv("CLERK_PUBLISHABLE_KEY", ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]),
  OPENAI_API_KEY: getEnv("OPENAI_API_KEY", ["OPENAI_KEY", "OPENAI_SECRET_KEY"]),
  OPENAI_BASE_URL: openAiBaseUrlRaw ? openAiBaseUrlRaw.trim() : null,
  OPENAI_MODEL: openAiModel,
  OPENAI_EMBED_MODEL: getEnv("OPENAI_EMBED_MODEL", ["OPENAI_EMBEDDING_MODEL"]),
  OPENAI_EMBED_DIM: (function () {
    const raw = getEnv("OPENAI_EMBED_DIM", ["OPENAI_EMBED_DIMENSIONS"]);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  })(),
  OPENAI_IMAGE_MODEL: openAiImageModel,
  OPENAI_IMAGE_MODEL_DEV: openAiImageModelDev,
  OPENAI_TRANSCRIBE_MODEL: openAiTranscribeModel,
  OPENAI_IMAGE_QUALITY:
    normalizedQuality === "low" || normalizedQuality === "standard" || normalizedQuality === "high"
      ? (normalizedQuality as "low" | "standard" | "high")
      : null,
  OPENAI_IMAGE_SIZE: getEnv("OPENAI_IMAGE_SIZE", []) || "1024x1024",
  OPENAI_IMAGE_SIZE_LOW: getEnv("OPENAI_IMAGE_SIZE_LOW", []) || "512x512",
  OPENAI_VIDEO_MODEL: openAiVideoModel ? openAiVideoModel.trim() : null,
  OPENAI_VIDEO_RESOLUTION: openAiVideoResolution ? openAiVideoResolution.trim() : null,
  OPENAI_VIDEO_MAX_DURATION:
    openAiVideoDuration !== null && Number.isFinite(openAiVideoDuration)
      ? Math.max(5, Math.min(120, Math.floor(openAiVideoDuration)))
      : null,
  SITE_URL: siteUrl.replace(/\/$/, ""),
  ADMIN_USERNAME: getEnv("ADMIN_USERNAME", ["CAPSULES_ADMIN_USERNAME", "ADMIN_USER"]),
  ADMIN_PASSWORD: getEnv("ADMIN_PASSWORD", ["CAPSULES_ADMIN_PASSWORD"]),
  ADMIN_PASSWORD_HASH: getEnv("ADMIN_PASSWORD_HASH", ["CAPSULES_ADMIN_PASSWORD_HASH"]),
  ADMIN_SESSION_SECRET: getEnv("ADMIN_SESSION_SECRET", ["CAPSULES_ADMIN_SESSION_SECRET"]),
  ADMIN_ACCESS_TOKEN: getEnv("ADMIN_ACCESS_TOKEN", ["CAPSULES_ADMIN_ACCESS_TOKEN", "ADMIN_TOKEN"]),
  PINECONE_API_KEY: getEnv("PINECONE_API_KEY", []),
  PINECONE_ENVIRONMENT: pineconeEnvironment,
  PINECONE_CONTROLLER_HOST: pineconeControllerHost,
  PINECONE_INDEX: pineconeIndex,
  PINECONE_NAMESPACE: pineconeNamespace,
  R2_ACCOUNT_ID: getEnv("R2_ACCOUNT_ID", ["CLOUDFLARE_ACCOUNT_ID"], { required: true })!,
  R2_ACCESS_KEY_ID: getEnv(
    "R2_ACCESS_KEY_ID",
    ["CLOUDFLARE_R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"],
    { required: true },
  )!,
  R2_SECRET_ACCESS_KEY: getEnv(
    "R2_SECRET_ACCESS_KEY",
    ["CLOUDFLARE_R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"],
    { required: true },
  )!,
  R2_BUCKET: getEnv("R2_BUCKET", ["CLOUDFLARE_R2_BUCKET"], { required: true })!,
  R2_UPLOAD_PREFIX: getEnv("R2_UPLOAD_PREFIX", []) || "uploads",
  R2_PUBLIC_BASE_URL: r2PublicBaseUrl,
  CLOUDFLARE_API_TOKEN: getEnv("CLOUDFLARE_API_TOKEN", ["CF_API_TOKEN", "CLOUDFLARE_TOKEN"]),
  R2_KV_NAMESPACE_ID: getEnv("R2_KV_NAMESPACE_ID", ["CLOUDFLARE_R2_KV_NAMESPACE_ID"]),
  R2_UPLOAD_COMPLETIONS_QUEUE: getEnv("R2_UPLOAD_COMPLETIONS_QUEUE", [
    "CLOUDFLARE_R2_UPLOAD_QUEUE",
    "CLOUDFLARE_UPLOAD_QUEUE",
  ]),
  CLOUDFLARE_IMAGE_RESIZE_BASE_URL: imageResizeBaseUrl,
  TURNSTILE_SECRET_KEY: getEnv("TURNSTILE_SECRET_KEY", ["CLOUDFLARE_TURNSTILE_SECRET"]),
  ALGOLIA_APP_ID: algoliaAppId,
  ALGOLIA_API_KEY: algoliaApiKey,
  ALGOLIA_INDEX_PREFIX: algoliaIndexPrefix,
  ARTIFACT_EMBEDDING_QUEUE: artifactEmbeddingQueue,
  ARTIFACT_EMBED_GATEWAY: artifactEmbedGateway,
  MUX_TOKEN_ID: getEnv("MUX_TOKEN_ID", []),
  MUX_TOKEN_SECRET: getEnv("MUX_TOKEN_SECRET", []),
  MUX_WEBHOOK_SECRET: getEnv("MUX_WEBHOOK_SECRET", ["MUX_SIGNING_SECRET"]),
  MUX_ENVIRONMENT: getEnv("MUX_ENVIRONMENT", []),
  UPSTASH_REDIS_REST_URL: getEnv("UPSTASH_REDIS_REST_URL", []),
  UPSTASH_REDIS_REST_TOKEN: getEnv("UPSTASH_REDIS_REST_TOKEN", []),
  STABILITY_API_KEY: stabilityApiKey,
  STABILITY_BASE_URL: stabilityBaseUrl,
  STABILITY_IMAGE_MODEL: stabilityImageModel,
  GIPHY_API_KEY: giphyApiKey,
  GIPHY_RATING: giphyRating,
  TENOR_API_KEY: tenorApiKey,
  TENOR_CLIENT_KEY: tenorClientKey,
};
