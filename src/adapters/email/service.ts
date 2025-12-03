import type { EmailProvider, EmailSendRequest, EmailSendResult } from "@/ports/email";

export type EmailServiceOperation = "send";

export type EmailTelemetryEvent = {
  operation: EmailServiceOperation;
  status: "success" | "error";
  durationMs: number;
  metadata?: Record<string, unknown>;
  error?: Error;
};

export interface EmailTelemetry {
  record(event: EmailTelemetryEvent): void;
}

export class NoopEmailTelemetry implements EmailTelemetry {
  record(): void {
    // intentionally empty
  }
}

export class ConsoleEmailTelemetry implements EmailTelemetry {
  constructor(private readonly label: string = "email") {}

  record(event: EmailTelemetryEvent): void {
    const { operation, status, durationMs, metadata, error } = event;
    const payload = {
      label: this.label,
      op: operation,
      status,
      durationMs,
      ...(metadata ?? {}),
      ...(error ? { error: error.message } : {}),
    };
    if (status === "error") {
      console.error("[EmailService]", payload);
    } else {
      console.debug("[EmailService]", payload);
    }
  }
}

export type EmailServiceErrorCode = "PROVIDER_UNAVAILABLE" | "SEND_FAILED";

export class EmailServiceError extends Error {
  readonly code: EmailServiceErrorCode;
  override readonly name = "EmailServiceError";
  override readonly cause?: unknown;

  constructor(code: EmailServiceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

type EmailServiceOptions = {
  provider: EmailProvider | null;
  telemetry?: EmailTelemetry | null;
  now?: () => number;
};

export class EmailService {
  private provider: EmailProvider | null;
  private telemetry: EmailTelemetry;
  private readonly now: () => number;

  constructor(options: EmailServiceOptions) {
    this.provider = options.provider;
    this.telemetry = options.telemetry ?? new NoopEmailTelemetry();
    this.now = options.now ?? Date.now;
  }

  withProvider(provider: EmailProvider): EmailService {
    this.provider = provider;
    return this;
  }

  async send(message: EmailSendRequest): Promise<EmailSendResult> {
    const start = this.now();
    try {
      const provider = this.ensureProvider();
      const result = await provider.send(message);
      this.record("send", "success", start, {
        vendor: provider.name,
        to: message.to,
      });
      return result;
    } catch (error) {
      this.record("send", "error", start, { to: message.to }, error);
      if (error instanceof EmailServiceError) {
        throw error;
      }
      throw new EmailServiceError("SEND_FAILED", "Failed to send email.", error);
    }
  }

  private ensureProvider(): EmailProvider {
    if (!this.provider) {
      throw new EmailServiceError(
        "PROVIDER_UNAVAILABLE",
        "Email provider has not been configured.",
      );
    }
    return this.provider;
  }

  private record(
    operation: EmailServiceOperation,
    status: "success" | "error",
    start: number,
    metadata?: Record<string, unknown>,
    error?: unknown,
  ): void {
    const durationMs = Math.max(0, this.now() - start);
    const normalizedError =
      error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    this.telemetry.record({
      operation,
      status,
      durationMs,
      ...(metadata ? { metadata } : {}),
      ...(normalizedError ? { error: normalizedError } : {}),
    });
  }
}
