import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/database", () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    fetch: async () => ({ data: [], error: null }),
    insert: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return {
    getDatabaseAdminClient: () => ({ from: () => builder }),
  };
});

import { getPrompterChipsForSurface } from "./chips";

describe("getPrompterChipsForSurface", () => {
  it("includes at least one dynamic chip (recent/context/ai) alongside base chips", async () => {
    const chips = await getPrompterChipsForSurface({ userId: "user-1", surface: "home" });
    const dynamic = chips.find((chip) => {
      const source = (chip.meta?.source as string | null) ?? null;
      return source === "context" || source === "ai" || source === "recent";
    });
    expect(chips.length).toBeGreaterThan(0);
    expect(dynamic).toBeTruthy();
  });
});
