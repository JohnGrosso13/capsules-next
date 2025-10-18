export type { PartyInviteSummary, PartyInviteStatus } from "@/types/party";

export type RawInviteRow = Record<string, unknown>;

export class PartyInviteError extends Error {
  constructor(
    public code: "invalid" | "not_found" | "forbidden" | "expired" | "conflict",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
