const BILLING_SETTINGS_PATH = "/settings?tab=billing";

export class BillingClientError extends Error {
  code: string | null;
  upgradePath: string | null;

  constructor(message: string, code?: string | null, upgradePath?: string | null) {
    super(message);
    this.name = "BillingClientError";
    this.code = code ?? null;
    this.upgradePath = upgradePath ?? null;
  }
}

type BillingErrorPayload = {
  error?: unknown;
  message?: unknown;
  details?: unknown;
};

type BillingErrorDetails = {
  requiredTier?: string | null;
  metric?: string | null;
};

function isBillingCode(code: string | null): code is
  | "insufficient_compute"
  | "insufficient_storage"
  | "billing_disabled" {
  return code === "insufficient_compute" || code === "insufficient_storage" || code === "billing_disabled";
}

function titleCase(value: string | null | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function extractDetails(details: unknown): BillingErrorDetails {
  if (!details || typeof details !== "object") return {};
  const record = details as Record<string, unknown>;
  return {
    requiredTier:
      typeof record.requiredTier === "string"
        ? record.requiredTier
        : typeof record.required_tier === "string"
          ? record.required_tier
          : null,
    metric:
      typeof record.metric === "string"
        ? record.metric
        : typeof record.metric === "number"
          ? String(record.metric)
          : null,
  };
}

function buildBillingMessage(code: string, payload: BillingErrorPayload): string {
  const details = extractDetails(payload.details);
  const requiredTier = titleCase(details.requiredTier);
  const defaultMessage =
    code === "insufficient_compute"
      ? "You're out of compute credits for this period."
      : code === "insufficient_storage"
        ? "You're out of storage for this period."
        : requiredTier
          ? `This feature requires the ${requiredTier} plan.`
          : "Upgrade required to access this feature.";
  const fromServer = typeof payload.message === "string" && payload.message.trim().length ? payload.message : null;
  const upgradeHint = `Open Settings -> Billing to upgrade${requiredTier ? ` to ${requiredTier}` : ""}.`;
  return [fromServer ?? defaultMessage, upgradeHint].filter(Boolean).join(" ");
}

export function toBillingClientError(
  status: number,
  payload: BillingErrorPayload | null,
): BillingClientError | null {
  if (status !== 402 && status !== 429 && status < 400) return null;
  const code = payload && typeof payload.error === "string" ? payload.error : null;
  if (!isBillingCode(code)) return null;
  const message = buildBillingMessage(code, payload ?? {});
  return new BillingClientError(message, code, BILLING_SETTINGS_PATH);
}

export { BILLING_SETTINGS_PATH };
