// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { GifPicker } from "../GifPicker";

describe("GifPicker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("passes provider metadata with selection", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: "giphy",
        results: [
          {
            id: "gif-1",
            title: "Happy",
            url: "https://giphy.example/happy.gif",
            previewUrl: "https://giphy.example/happy-preview.gif",
            width: 200,
            height: 200,
            size: 1024,
          },
        ],
        next: null,
      }),
    } satisfies Partial<Response>);

    vi.stubGlobal("fetch", mockFetch);

    const onSelect = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(<GifPicker onSelect={onSelect} onClose={onClose} />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const img = container.querySelector('img[alt="Happy"]');
    expect(img).toBeTruthy();
    const button = img?.closest("button");
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "gif-1",
        provider: "giphy",
        url: "https://giphy.example/happy.gif",
      }),
    );
  });
});
