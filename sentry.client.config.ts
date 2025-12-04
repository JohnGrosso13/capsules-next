import * as Sentry from "@sentry/nextjs";

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined;
const environment =
  process.env.NEXT_PUBLIC_STAGE ||
  process.env.SENTRY_ENVIRONMENT ||
  process.env.NODE_ENV ||
  "development";
const tracesSampleRateRaw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
const tracesSampleRate = Number.isFinite(tracesSampleRateRaw)
  ? tracesSampleRateRaw
  : 0.05;
const profilesSampleRateRaw = Number(process.env.SENTRY_PROFILES_SAMPLE_RATE);
const profilesSampleRate = Number.isFinite(profilesSampleRateRaw)
  ? profilesSampleRateRaw
  : 0;

Sentry.init({
  dsn: dsn || "",
  enabled: Boolean(dsn),
  environment,
  // Keep low defaults; override with env vars in staging/prod if you want higher coverage.
  tracesSampleRate,
  profilesSampleRate,
});
