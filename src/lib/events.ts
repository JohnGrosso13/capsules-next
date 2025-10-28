export const SUMMARIZE_FEED_REQUEST_EVENT = "capsule:summarize-feed";
export const SUMMARIZE_FEED_STATUS_EVENT = "capsule:summarize-feed-status";

export type SummarizeFeedRequestOrigin = "chip" | "prompt" | "button" | "external";

export type SummarizeFeedRequestDetail = {
  origin?: SummarizeFeedRequestOrigin;
};

export type SummarizeFeedStatus = "started" | "success" | "error" | "empty" | "busy";

export type SummarizeFeedStatusDetail = {
  status: SummarizeFeedStatus;
  origin?: SummarizeFeedRequestOrigin;
  reason?: string | null;
};
