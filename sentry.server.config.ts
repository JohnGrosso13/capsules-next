import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
const enabled = dsn !== "" && process.env.SENTRY_DISABLED !== "true";

Sentry.init({
  dsn: enabled ? dsn : undefined,
  enabled,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: readSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
  profilesSampleRate: readSampleRate(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0),
  debug: process.env.SENTRY_DEBUG === "true",
});

function readSampleRate(value: string | undefined, defaultValue: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.min(Math.max(parsed, 0), 1);
}
