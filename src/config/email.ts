import { getPostmarkEmailProvider } from "@/adapters/email/postmark";
import { getResendEmailProvider } from "@/adapters/email/resend";
import { ConsoleEmailTelemetry, EmailService } from "@/adapters/email/service";
import type { EmailProvider } from "@/ports/email";

const rawEmailVendor =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? process.env.EMAIL_VENDOR
    : undefined;

const emailVendor = (rawEmailVendor ?? "resend").trim().toLowerCase();

let provider: EmailProvider | null | undefined;
let service: EmailService | null = null;

function tryCreateResend(): EmailProvider | null {
  try {
    return getResendEmailProvider();
  } catch (error) {
    console.warn("Resend provider initialization failed", error);
    return null;
  }
}

function tryCreatePostmark(): EmailProvider | null {
  try {
    return getPostmarkEmailProvider();
  } catch (error) {
    console.warn("Postmark provider initialization failed", error);
    return null;
  }
}

function resolveProvider(): EmailProvider | null {
  switch (emailVendor) {
    case "resend":
    case "":
      return tryCreateResend() ?? tryCreatePostmark();
    case "postmark":
      return tryCreatePostmark();
    default:
      console.warn(`Unknown email vendor "${emailVendor}". Attempting Resend then Postmark.`);
      return tryCreateResend() ?? tryCreatePostmark();
  }
}

export function getEmailProvider(): EmailProvider | null {
  if (provider === undefined) {
    provider = resolveProvider();
  }
  return provider ?? null;
}

export function getEmailService(): EmailService {
  if (!service) {
    service = new EmailService({
      provider: getEmailProvider(),
      telemetry: new ConsoleEmailTelemetry(`email:${getEmailVendor()}`),
    });
  }
  return service;
}

export function getEmailVendor(): string {
  const fallbackVendor = emailVendor || "resend";
  return (provider ?? null)?.name ?? fallbackVendor;
}
