import { ServerClient, type Models } from "postmark";

import type { EmailProvider, EmailSendRequest, EmailSendResult } from "@/ports/email";

type PostmarkProviderOptions = {
  token?: string | null;
  from?: string | null;
  messageStream?: string | null;
  replyTo?: string | null;
};

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

class PostmarkEmailProvider implements EmailProvider {
  readonly name = "postmark";
  private readonly client: ServerClient;
  private readonly from: string;
  private readonly messageStream: string;
  private readonly replyTo: string | null;

  constructor(options: PostmarkProviderOptions = {}) {
    const token = normalize(options.token ?? process.env.POSTMARK_SERVER_TOKEN);
    if (!token) {
      throw new Error("postmark.missing_token");
    }
    const from = normalize(options.from ?? process.env.EMAIL_FROM);
    if (!from) {
      throw new Error("postmark.missing_from_address");
    }
    this.client = new ServerClient(token);
    this.from = from;
    this.messageStream =
      normalize(options.messageStream ?? process.env.POSTMARK_MESSAGE_STREAM) ?? "outbound";
    this.replyTo = normalize(options.replyTo ?? process.env.EMAIL_REPLY_TO);
  }

  async send(message: EmailSendRequest): Promise<EmailSendResult> {
    const from = normalize(message.from) ?? this.from;
    const stream = normalize(message.stream) ?? this.messageStream;
    const replyTo = normalize(message.replyTo) ?? this.replyTo;

    const payload: Models.Message = {
      From: from,
      To: message.to,
      Subject: message.subject,
      HtmlBody: message.html,
      MessageStream: stream ?? undefined,
    };

    if (message.text) payload.TextBody = message.text;
    if (replyTo) payload.ReplyTo = replyTo;

    const response = await this.client.sendEmail(payload);
    const messageId =
      typeof response.MessageID === "string" || typeof response.MessageID === "number"
        ? String(response.MessageID)
        : null;

    return {
      id: messageId,
      to: message.to,
      vendor: this.name,
      stream: payload.MessageStream ?? null,
      response,
    };
  }
}

let cachedProvider: EmailProvider | null = null;

export function getPostmarkEmailProvider(options?: PostmarkProviderOptions): EmailProvider {
  if (!options && cachedProvider) {
    return cachedProvider;
  }
  const provider = new PostmarkEmailProvider(options);
  if (!options) {
    cachedProvider = provider;
  }
  return provider;
}
