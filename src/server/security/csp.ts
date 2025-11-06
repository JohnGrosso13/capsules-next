const CLERK_ORIGINS = [
  "https://clerk.com",
  "https://*.clerk.com",
  "https://clerk.dev",
  "https://*.clerk.dev",
  "https://clerkstage.dev",
  "https://*.clerkstage.dev",
  "https://clerk.accounts.dev",
  "https://*.clerk.accounts.dev",
];

const R2_ORIGINS = [
  "https://*.r2.cloudflarestorage.com",
  "https://*.cloudflarestorage.com",
];

const SUPABASE_ORIGINS = ["https://*.supabase.co", "https://*.supabase.in"];

const LIVEKIT_ORIGINS = ["https://*.livekit.cloud"];

const ABLY_ORIGINS = ["https://realtime.ably.io", "https://rest.ably.io"];

const UPSTASH_ORIGINS = ["https://*.upstash.io"];

const ALGOLIA_ORIGINS = [
  "https://*.algolia.net",
  "https://*.algolia.io",
  "https://*.algolianet.com",
];

const MUX_ORIGINS = [
  "https://stream.mux.com",
  "https://*.mux.com",
  "https://*.mux.app",
  "https://*.muxcdn.net",
];

const CLOUDFLARE_TURNSTILE = ["https://challenges.cloudflare.com"];

const GOOGLE_FONTS_STYLES = ["https://fonts.googleapis.com"];
const GOOGLE_FONTS_ASSETS = ["https://fonts.gstatic.com"];

const CLOUDFLARE_IMAGES = ["https://*.imagedelivery.net"];

const DEFAULT_MEDIA_ORIGINS = [
  ...MUX_ORIGINS,
  ...R2_ORIGINS,
  ...SUPABASE_ORIGINS,
  ...CLOUDFLARE_IMAGES,
];

const DEFAULT_IMAGE_ORIGINS = [
  ...DEFAULT_MEDIA_ORIGINS,
  "https://img.clerk.com",
  "https://images.clerk.dev",
  "https://media.example.com",
];

const DEFAULT_CONNECT_ORIGINS = [
  ...CLERK_ORIGINS,
  ...SUPABASE_ORIGINS,
  ...R2_ORIGINS,
  ...LIVEKIT_ORIGINS,
  ...ABLY_ORIGINS,
  ...UPSTASH_ORIGINS,
  ...ALGOLIA_ORIGINS,
  ...MUX_ORIGINS,
  ...CLOUDFLARE_TURNSTILE,
];

type DirectiveName = string;

const DIRECTIVES_WITHOUT_VALUES = new Set<DirectiveName>([
  "upgrade-insecure-requests",
]);

interface SecurityHeaderConfig {
  nonce: string;
  isDev: boolean;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const originFor = (input?: string | null): string | null => {
  if (!isNonEmptyString(input)) return null;
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
};

const dedupe = (values: Iterable<string>): string[] => {
  const set = new Set<string>();
  for (const value of values) {
    if (isNonEmptyString(value)) {
      set.add(value);
    }
  }
  return Array.from(set);
};

const withEnvOrigin = (
  base: string[],
  ...candidates: Array<string | null>
): string[] => dedupe([...base, ...candidates.filter(isNonEmptyString)]);

const buildScriptSources = ({ nonce, isDev }: SecurityHeaderConfig): string[] => {
  const sources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "'report-sample'",
    ...CLERK_ORIGINS,
    ...CLOUDFLARE_TURNSTILE,
  ];
  if (isDev) {
    sources.push("'unsafe-eval'");
    sources.push("'unsafe-inline'");
    sources.push("http://localhost:3000");
  }
  return dedupe(sources);
};

const buildStyleSources = ({ nonce, isDev }: SecurityHeaderConfig): string[] => {
  const sources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'report-sample'",
    ...GOOGLE_FONTS_STYLES,
    ...CLERK_ORIGINS,
  ];
  if (isDev) {
    sources.push("'unsafe-inline'");
  }
  return dedupe(sources);
};

const buildConnectSources = ({
  isDev,
}: Pick<SecurityHeaderConfig, "isDev">): string[] => {
  const envSupabase = originFor(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const envSupabaseAlt = originFor(process.env.SUPABASE_URL);
  const envSite = originFor(process.env.NEXT_PUBLIC_SITE_URL);
  const envR2 = originFor(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);
  const envLivekit = originFor(process.env.NEXT_PUBLIC_LIVEKIT_URL);
  const envTelemetry = originFor(process.env.NEXT_PUBLIC_VERCEL_INSIGHTS_URL);

  const sources = withEnvOrigin(DEFAULT_CONNECT_ORIGINS, envSupabase, envSupabaseAlt, envSite, envR2, envLivekit, envTelemetry);

  sources.push("'self'");
  sources.push("https:");
  sources.push("wss:");

  if (isDev) {
    sources.push("http://localhost:3000");
    sources.push("ws://localhost:3000");
    sources.push("http://127.0.0.1:3000");
    sources.push("ws://127.0.0.1:3000");
  }

  return dedupe(sources);
};

const buildImageSources = (): string[] => {
  const envSite = originFor(process.env.NEXT_PUBLIC_SITE_URL);
  const envR2 = originFor(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);
  const envSupabase = originFor(process.env.NEXT_PUBLIC_SUPABASE_URL);

  const sources = withEnvOrigin(DEFAULT_IMAGE_ORIGINS, envSite, envR2, envSupabase);
  sources.push("'self'");
  sources.push("data:");
  sources.push("blob:");

  return dedupe(sources);
};

const buildMediaSources = (): string[] => {
  const envR2 = originFor(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);
  const envMuxPlayback = originFor(process.env.NEXT_PUBLIC_MUX_PLAYBACK_BASE_URL);

  const sources = withEnvOrigin(DEFAULT_MEDIA_ORIGINS, envR2, envMuxPlayback);
  sources.push("'self'");
  sources.push("data:");
  sources.push("blob:");

  return dedupe(sources);
};

const buildFrameSources = (): string[] =>
  dedupe(["'self'", ...CLERK_ORIGINS, ...CLOUDFLARE_TURNSTILE]);

const buildFormActionSources = (): string[] =>
  dedupe(["'self'", ...CLERK_ORIGINS]);

const buildFontSources = (): string[] =>
  dedupe(["'self'", ...GOOGLE_FONTS_ASSETS, "data:"]);

const buildWorkerSources = (): string[] =>
  dedupe(["'self'", "blob:"]);

const serializeDirectives = (directives: Array<[DirectiveName, string[]]>): string =>
  directives
    .map(([name, values]) => {
      if (!values.length && DIRECTIVES_WITHOUT_VALUES.has(name)) {
        return name;
      }
      const filtered = values.filter(isNonEmptyString);
      if (!filtered.length) return "";
      return `${name} ${dedupe(filtered).join(" ")}`;
    })
    .filter(Boolean)
    .join("; ");

export const buildContentSecurityPolicy = (
  config: SecurityHeaderConfig,
): string => {
  const directives: Array<[DirectiveName, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["frame-ancestors", ["'self'"]],
    ["form-action", buildFormActionSources()],
    ["img-src", buildImageSources()],
    ["media-src", buildMediaSources()],
    ["font-src", buildFontSources()],
    ["style-src", buildStyleSources(config)],
    ["script-src", buildScriptSources(config)],
    ["worker-src", buildWorkerSources()],
    ["connect-src", buildConnectSources(config)],
    ["frame-src", buildFrameSources()],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["prefetch-src", ["'self'", "https:"]],
    ["child-src", ["'none'"]],
    ["upgrade-insecure-requests", []],
  ];

  return serializeDirectives(directives);
};

export const buildSecurityHeaders = (
  config: SecurityHeaderConfig,
): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildContentSecurityPolicy(config),
    "Cross-Origin-Resource-Policy": "same-site",
  };

  headers["Cross-Origin-Embedder-Policy"] = config.isDev ? "credentialless" : "require-corp";

  return headers;
};

