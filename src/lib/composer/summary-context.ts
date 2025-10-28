import type { SummaryTarget } from "@/types/summary";

export type SummaryConversationEntry = {
  id: string;
  postId?: string | null;
  title?: string | null;
  author?: string | null;
  summary: string;
  highlights?: string[];
  relativeTime?: string | null;
  permalink?: string | null;
  attachmentId?: string | null;
};

export type SummaryConversationContext = {
  source: SummaryTarget;
  title?: string | null;
  entries: SummaryConversationEntry[];
};

export type SummaryPresentationOptions = {
  title?: string | null;
  sourceLabel?: string | null;
  sourceType: SummaryTarget;
};
