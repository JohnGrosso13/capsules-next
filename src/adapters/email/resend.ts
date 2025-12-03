import type { EmailProvider, EmailSendRequest, EmailSendResult } from "@/ports/email";

type ResendProviderOptions = {
  apiKey?: string | null;
  from?: string | null;
  replyTo?: string | null;
  baseUrl?: string | null;
};

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  return normalized.replace(/\/+$/, "");
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo: string | null;
  private readonly baseUrl: string;

  constructor(options: ResendProviderOptions = {}) {
    const apiKey = normalize(options.apiKey ?? process.env.RESEND_API_KEY);
    if (!apiKey) {
      throw new Error("resend.missing_api_key");
    }
    const from = normalize(options.from ?? process.env.EMAIL_FROM);
    if (!from) {
      throw new Error("resend.missing_from_address");
    }
    this.apiKey = apiKey;
    this.from = from;
    this.replyTo = normalize(options.replyTo ?? process.env.EMAIL_REPLY_TO);
    this.baseUrl = normalizeUrl(options.baseUrl ?? process.env.RESEND_BASE_URL) ?? "https://api.resend.com";
  }

  async send(message: EmailSendRequest): Promise<EmailSendResult> {
    const from = normalize(message.from) ?? this.from;
    const replyTo = normalize(message.replyTo) ?? this.replyTo;
    const payload = {
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text ? { text: message.text } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    };

    const response = await fetch(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await response.text();
    let data: unknown;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = rawBody;
    }

    if (!response.ok) {
      const errorMessage =
        typeof data === "object" && data && "error" in data
          ? String((data as { error?: unknown }).error ?? response.statusText)
          : response.statusText;
      throw new Error(`resend.send_failed: ${errorMessage}`);
    }

    const id =
      typeof data === "object" && data && "id" in data
        ? String((data as { id?: unknown }).id ?? "")
        : null;

    return {
      id: id && id.length ? id : null,
      to: message.to,
      vendor: this.name,
      response: data,
    };
  }
}

let cachedProvider: EmailProvider | null = null;

export function getResendEmailProvider(options?: ResendProviderOptions): EmailProvider {
  if (!options && cachedProvider) {
    return cachedProvider;
  }
  const provider = new ResendEmailProvider(options);
  if (!options) {
    cachedProvider = provider;
  }
  return provider;
}
