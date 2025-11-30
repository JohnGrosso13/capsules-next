export type AssistantTaskSummary = {
  id: string;
  kind: string;
  status: string;
  prompt: string | null;
  createdAt: string;
  updatedAt: string;
  result: Record<string, unknown> | null;
  direction: "incoming" | "outgoing";
  conversationId?: string | null;
  counterpartName?: string | null;
  counterpartUserId?: string | null;
  recipients: Array<{
    userId: string;
    name: string | null;
    status: string;
    conversationId?: string | null;
  }>;
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
