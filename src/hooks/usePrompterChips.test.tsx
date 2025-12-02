// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrompterChipOption } from "@/components/prompter/hooks/usePrompterStageController";
import { usePrompterChips } from "./usePrompterChips";

type HarnessProps = {
  userId?: string | null;
  fallback?: PrompterChipOption[];
};

function renderHarness(
  props: HarnessProps,
  onChange: (chips: PrompterChipOption[] | undefined) => void,
  root: Root,
) {
  function Harness(p: HarnessProps) {
    const result = usePrompterChips("home", p.fallback, p.userId);
    React.useEffect(() => {
      onChange(result.chips);
    }, [result.chips]);
    return null;
  }

  return act(async () => {
    root.render(<Harness {...props} />);
    // Flush effects
    await Promise.resolve();
  });
}

describe("usePrompterChips cache scoping", () => {
  let container: HTMLDivElement;
  let root: Root;
  const now = Date.now();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ chips: [] }) })));
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("does not leak cached chips between users", async () => {
    const userA = { ts: now, user: "user-a", chips: [{ id: "a", label: "User A" }] };
    const userB = { ts: now, user: "user-b", chips: [{ id: "b", label: "User B" }] };
    sessionStorage.setItem("prompter_chips:home:user-a", JSON.stringify(userA));
    sessionStorage.setItem("prompter_chips:home:user-b", JSON.stringify(userB));

    (fetch as unknown as vi.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ chips: userB.chips }),
    });

    let seen: PrompterChipOption[] | undefined;
    await renderHarness({ userId: "user-b" }, (chips) => {
      seen = chips;
    }, root);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(seen?.[0]?.label).toBe("User B");
  });

  it("drops expired cache entries", async () => {
    const expired = {
      ts: now - 60 * 60 * 1000,
      user: "user-expired",
      chips: [{ id: "expired", label: "Old" }],
    };
    sessionStorage.setItem("prompter_chips:home:user-expired", JSON.stringify(expired));

    const fallback: PrompterChipOption[] = [{ id: "fresh", label: "Fresh" }];
    (fetch as unknown as vi.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ chips: fallback }),
    });
    let seen: PrompterChipOption[] | undefined;
    await renderHarness({ userId: "user-expired", fallback }, (chips) => {
      seen = chips;
    }, root);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(seen?.[0]?.label).toBe("Fresh");
  });
});
