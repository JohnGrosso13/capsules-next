export type AssistantTaskSummary = {
  id: string;
  kind: string;
  status: string;
  prompt: string | null;
  createdAt: string;
  updatedAt: string;
  result: Record<string, unknown> | null;
  totals: {
    recipients: number;
    awaitingResponses: number;
    responded: number;
    failed: number;
    completed: number;
    pending: number;
  };
  lastResponseAt: string | null;
};
