import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
const environment =
  process.env.SENTRY_ENVIRONMENT ||
  process.env.NEXT_PUBLIC_STAGE ||
  process.env.NODE_ENV ||
  "development";
const tracesSampleRateRaw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
const tracesSampleRate = Number.isFinite(tracesSampleRateRaw)
  ? tracesSampleRateRaw
  : 0.05;

Sentry.init({
  dsn: dsn || "",
  enabled: Boolean(dsn),
  environment,
  tracesSampleRate,
});
