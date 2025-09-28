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

  OPENAI_MODEL: string;

  OPENAI_EMBED_MODEL: string | null;

  OPENAI_IMAGE_MODEL: string;

  OPENAI_TRANSCRIBE_MODEL: string;

  OPENAI_IMAGE_QUALITY: "low" | "standard" | "high" | null;

  OPENAI_IMAGE_SIZE: string;

  OPENAI_IMAGE_SIZE_LOW: string;

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

const openAiImageModel =
  getEnv("OPENAI_IMAGE_MODEL", ["AI_IMAGE_MODEL", "IMAGE_MODEL"]) || "gpt-image-1";

const openAiTranscribeModel =
  getEnv("OPENAI_TRANSCRIBE_MODEL", ["OPENAI_TRANSCRIBE", "OPENAI_MODEL_TRANSCRIBE"]) ||
  "gpt-4o-mini-transcribe";

const openAiQualityRaw =
  getEnv("OPENAI_IMAGE_QUALITY", [
    "IMAGE_QUALITY_OVERRIDE",
    "AI_IMAGE_QUALITY",
    "TEST_IMAGE_QUALITY",
  ]) || null;

const normalizedQuality = openAiQualityRaw ? openAiQualityRaw.trim().toLowerCase() : null;

const pineconeEnvironment = getEnv("PINECONE_ENVIRONMENT", ["PINECONE_REGION", "PINECONE_PROJECT_ENV"]);

const pineconeControllerHost = getEnv("PINECONE_CONTROLLER_HOST", ["PINECONE_HOST", "PINECONE_API_HOST"]);

const pineconeIndex = getEnv("PINECONE_INDEX", ["PINECONE_PROJECT_INDEX"]);

const pineconeNamespace = getEnv("PINECONE_NAMESPACE", ["PINECONE_PROJECT_NAMESPACE"]);

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

  OPENAI_MODEL: openAiModel,

  OPENAI_EMBED_MODEL: getEnv(
    "OPENAI_EMBED_MODEL",

    ["OPENAI_TRANSCRIBE_MODEL", "OPENAI_EMBEDDING_MODEL", "OPENAI_EMBED_MODEL"],
  ),

  OPENAI_IMAGE_MODEL: openAiImageModel,

  OPENAI_TRANSCRIBE_MODEL: openAiTranscribeModel,

  OPENAI_IMAGE_QUALITY:
    normalizedQuality === "low" || normalizedQuality === "standard" || normalizedQuality === "high"
      ? (normalizedQuality as "low" | "standard" | "high")
      : null,

  OPENAI_IMAGE_SIZE: getEnv("OPENAI_IMAGE_SIZE", []) || "1024x1024",

  OPENAI_IMAGE_SIZE_LOW: getEnv("OPENAI_IMAGE_SIZE_LOW", []) || "512x512",

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
};
