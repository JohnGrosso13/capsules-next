export type AssistantMessage = {
  id: string;
  sender: "ai" | "user";
  text: string;
  timestamp: number;
};

