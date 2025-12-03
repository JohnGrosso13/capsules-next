export type EmailSendRequest = {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
  from?: string | null;
  stream?: string | null;
};

export type EmailSendResult = {
  id: string | null;
  to: string;
  vendor: string;
  stream?: string | null;
  response?: unknown;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailSendRequest): Promise<EmailSendResult>;
}
