// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { base64ToFile, blobToBase64, loadImageElement } from "../capsuleImageUtils";

const ONE_BY_ONE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAnEB9HS49bEAAAAASUVORK5CYII=";

describe("capsuleImageUtils", () => {
  it("converts a blob to a base64 payload", async () => {
    const encoder = new TextEncoder();
    const payload = encoder.encode("hello");
    const blob = new Blob([payload], { type: "text/plain" }) as Blob & {
      arrayBuffer?: () => Promise<ArrayBuffer>;
    };
    if (typeof blob.arrayBuffer !== "function") {
      blob.arrayBuffer = async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    }
    await expect(blobToBase64(blob)).resolves.toBe("aGVsbG8=");
  });

  it("creates a File from a base64 string", async () => {
    const file = base64ToFile("aGVsbG8=", "text/plain", "greeting.txt");
    expect(file).not.toBeNull();
    expect(file?.name).toBe("greeting.txt");
    expect(file?.type).toBe("text/plain");
    if (file) {
      if (typeof file.arrayBuffer === "function") {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder();
        expect(decoder.decode(buffer)).toBe("hello");
      } else {
        expect(file.size).toBe(5);
      }
    }
  });

  it("loads an image element from a data URL", async () => {
    const OriginalImage = globalThis.Image;
    class MockImage implements Partial<HTMLImageElement> {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1;
      height = 1;
      decoding: "auto" | "sync" | "async" = "async";
      set crossOrigin(_: string | null) {
        // no-op for mock
      }
      set src(_: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      writable: true,
      value: MockImage,
    });

    try {
      const img = await loadImageElement(ONE_BY_ONE_PNG, {
        allowCrossOrigin: false,
        label: "Test",
      });
      expect(img.width).toBe(1);
      expect(img.height).toBe(1);
    } finally {
      Object.defineProperty(globalThis, "Image", {
        configurable: true,
        writable: true,
        value: OriginalImage,
      });
    }
  });
});
