import { describe, expect, it, vi } from "vitest";

import { fetchCapsuleHistoryPostRows } from "../db";

function createDbMock(result: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    fetch: vi.fn().mockResolvedValue(result),
  };

  return {
    chain,
    client: {
      from: vi.fn(() => chain),
    },
  };
}

describe("fetchCapsuleHistoryPostRows", () => {
  it("returns raw rows when the query succeeds", async () => {
    const row = {
      id: "1",
      kind: "post",
      content: "hello",
      media_url: null,
      media_prompt: null,
      user_name: "casey",
      created_at: "2023-01-01",
    };
    const db = createDbMock({ data: [row], error: null });

    const rows = await fetchCapsuleHistoryPostRows("capsule-1", 5, db.client as never);

    expect(db.client.from).toHaveBeenCalledWith("posts_view");
    expect(db.chain.limit).toHaveBeenCalledWith(5);
    expect(rows).toEqual([row]);
  });

  it("throws when the query reports an error", async () => {
    const db = createDbMock({ data: null, error: { message: "fail" } });

    await expect(
      fetchCapsuleHistoryPostRows("capsule-1", 10, db.client as never),
    ).rejects.toThrow("capsules.history.posts: fail");
  });
});

