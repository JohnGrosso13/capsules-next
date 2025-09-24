import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? "";
const enabled = dsn !== "" && process.env.SENTRY_DISABLED !== "true";
const tracesSampleRate = readSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1);
const replaysSessionSampleRate = readSampleRate(process.env.SENTRY_REPLAYS_SESSION_SAMPLE_RATE, 0);
const replaysOnErrorSampleRate = readSampleRate(process.env.SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 1);

Sentry.init({
  dsn: enabled ? dsn : undefined,
  enabled,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate,
  replaysSessionSampleRate,
  replaysOnErrorSampleRate,
  integrations: [
    ...(replaysSessionSampleRate > 0 || replaysOnErrorSampleRate > 0
      ? [Sentry.replayIntegration()]
      : []),
  ],
});

function readSampleRate(value: string | undefined, defaultValue: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.min(Math.max(parsed, 0), 1);
}
