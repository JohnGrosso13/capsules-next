export class CapsuleLadderAccessError extends Error {
  constructor(
    public code: "invalid" | "forbidden" | "not_found" | "conflict",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
