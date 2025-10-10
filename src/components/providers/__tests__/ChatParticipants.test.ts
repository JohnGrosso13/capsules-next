import { describe, expect, it } from "vitest";

import { __chatTestUtils } from "../ChatProvider";

const { standardizeUserId, resolveParticipantId, canonicalParticipantKey, normalizeParticipant, mergeParticipants } =
  __chatTestUtils;

describe("Chat participant normalization", () => {
  it("standardizes user identifiers from varied formats", () => {
    expect(standardizeUserId("user_ABC123")).toBe("user_abc123");
    expect(standardizeUserId("USER:Def456")).toBe("user_def456");
    expect(standardizeUserId("client:user-Ghi789#device")).toBe("user_ghi789");
  });

  it("prefers supplied userId metadata when resolving participant ids", () => {
    const resolved = resolveParticipantId({
      id: "client:somethingElse",
      userId: "user_Jkl012",
      identifier: "client:user_Jkl012",
    });
    expect(resolved).toBe("user_jkl012");
  });

  it("extracts embedded user ids from client identifiers", () => {
    const resolved = resolveParticipantId({
      id: "client:user_Mno345:mobile",
    });
    expect(resolved).toBe("user_mno345");
  });

  it("normalizes participant entries and deduplicates aliases", () => {
    const johnFromUser = { id: "user_pqr678", name: "John", avatar: null };
    const johnFromClient = { id: "client:user_Pqr678#session", name: "John", avatar: null };
    const merged = mergeParticipants([johnFromUser], [johnFromClient]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("user_pqr678");
    expect(merged[0]?.name).toBe("John");
  });

  it("uses canonical participant keys across multiple aliases", () => {
    expect(canonicalParticipantKey("client:user_Stu901#desktop")).toBe("user_stu901");
    expect(canonicalParticipantKey("USER-stu901")).toBe("user_stu901");
    expect(canonicalParticipantKey("user:stu901")).toBe("user_stu901");
  });

  it("keeps provided display names when normalizing", () => {
    const normalized = normalizeParticipant({
      id: "client:user_Vwx234",
      name: "Alex",
    });
    expect(normalized?.id).toBe("user_vwx234");
    expect(normalized?.name).toBe("Alex");
  });
});

