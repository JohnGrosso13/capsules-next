export type SummaryTarget = "document" | "feed" | "text" | "memory";

export type SummaryLengthHint = "brief" | "medium" | "detailed";

export type SummaryResult = {
  summary: string;
  highlights: string[];
  hashtags: string[];
  nextActions: string[];
  insights: string[];
  tone: string | null;
  sentiment: string | null;
  postTitle: string | null;
  postPrompt: string | null;
  wordCount: number | null;
  model: string | null;
  source: SummaryTarget;
};

export type SummaryRequestMeta = {
  title?: string | null;
  author?: string | null;
  audience?: string | null;
  capsuleId?: string | null;
  timeframe?: string | null;
};

export type SummaryAttachmentInput = {
  id: string;
  name?: string | null;
  excerpt?: string | null;
  text?: string | null;
  url?: string | null;
  mimeType?: string | null;
};

export type SummaryRequestPayload = {
  target: SummaryTarget;
  text?: string | null;
  segments?: string[];
  attachments?: SummaryAttachmentInput[];
  capsuleId?: string | null;
  limit?: number;
  hint?: SummaryLengthHint;
  meta?: SummaryRequestMeta | null;
};

export type SummaryApiResponse = {
  status: "ok";
  summary: string;
  highlights: string[];
  hashtags: string[];
  nextActions: string[];
  insights: string[];
  tone: string | null;
  sentiment: string | null;
  postTitle: string | null;
  postPrompt: string | null;
  wordCount: number | null;
  model: string | null;
  source: SummaryTarget;
};
