import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/posts", () => ({
  createPostRecord: vi.fn(),
}));

import { createPostSlim } from "./api";
import { createPostRecord } from "@/lib/supabase/posts";

describe("createPostSlim", () => {
  const createPostRecordMock = vi.mocked(createPostRecord);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns success when record is created", async () => {
    createPostRecordMock.mockResolvedValue("post-123");

    const result = await createPostSlim({ post: {}, ownerId: "owner-1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toEqual({ success: true, id: "post-123" });
    }
    expect(createPostRecordMock).toHaveBeenCalledWith({}, "owner-1");
  });

  it("returns error when persistence fails", async () => {
    const error = new Error("boom");
    createPostRecordMock.mockRejectedValue(error);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let result;
    try {
      result = await createPostSlim({ post: {}, ownerId: "owner-2" });
    } finally {
      errorSpy.mockRestore();
    }

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.body.error).toBe("post_save_failed");
      expect(result.body.message).toBe("Failed to save post");
    }
  });
});
