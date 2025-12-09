import { describe, expect, it, vi } from "vitest";

const uploadMock = vi.fn(async () => ({
  url: "https://cdn.example.com/deck.pptx",
  key: "storage-key",
}));

const indexMemoryMock = vi.fn(async () => "memory-123");

vi.mock("@/lib/supabase/storage", () => ({
  uploadBufferToStorage: uploadMock,
}));

vi.mock("@/server/memories/service", () => ({
  indexMemory: indexMemoryMock,
}));

vi.mock("@/lib/ai/prompter/images", () => ({
  generateImageFromPrompt: vi.fn(),
}));

vi.mock("pptxgenjs", () => {
  class MockSlide {
    shapes: Array<{ type: string; value?: unknown }> = [];
    addText(value: unknown) {
      this.shapes.push({ type: "text", value });
    }
    addImage(value: unknown) {
      this.shapes.push({ type: "image", value });
    }
    addNotes() {
      // no-op for tests
    }
  }

  return {
    default: class MockPptx {
      slides: MockSlide[] = [];
      addSlide() {
        const slide = new MockSlide();
        this.slides.push(slide);
        return slide;
      }
      async write() {
        return new ArrayBuffer(8);
      }
      set author(_value: string) {
        // ignore for tests
      }
      set company(_value: string) {
        // ignore for tests
      }
      set subject(_value: string) {
        // ignore for tests
      }
    },
  };
});

describe("generate_pptx tool", () => {
  it("creates pptx, uploads it, and indexes a memory", async () => {
    const { __test__ } = await import("@/server/composer/run");

    const runtime = {
      ownerId: "user-1",
      capsuleId: null,
      attachments: new Map(),
      composeOptions: {},
      history: [],
      latestUserText: "draft slides",
    };

    const result = (await __test__.handleGeneratePptx(
      {
        title: "My Deck",
        subtitle: "Launch plan",
        download_name: "Launch Plan.PPTX",
        slides: [
          {
            title: "Overview",
            bullets: ["Goal", "Timeline"],
            notes: "Keep it tight",
          },
        ],
      },
      runtime,
    )) as Record<string, unknown>;

    const mimeType = typeof result.mimeType === "string" ? result.mimeType : "";
    const name = typeof result.name === "string" ? result.name : "";
    const url = typeof result.url === "string" ? result.url : "";

    expect(result.status).toBe("succeeded");
    expect(result.kind).toBe("file");
    expect(mimeType).toContain("presentationml");
    expect(name.toLowerCase()).toBe("launch_plan.pptx");
    expect(url).toBe("https://cdn.example.com/deck.pptx");

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const uploadCall = uploadMock.mock.calls.at(0);
    expect(uploadCall).toBeDefined();
    if (!uploadCall || uploadCall.length < 3) throw new Error("upload not called");
    const [bufferArg, contentTypeArg, uploadNameArg] = uploadCall as unknown[];
    expect(Buffer.isBuffer(bufferArg as Buffer)).toBe(true);
    expect(String(contentTypeArg)).toContain("presentation");
    expect(uploadNameArg).toBe("Launch_Plan");

    expect(indexMemoryMock).toHaveBeenCalledTimes(1);
    const memoryCall = indexMemoryMock.mock.calls.at(0) as unknown[] | undefined;
    expect(memoryCall).toBeDefined();
    if (!memoryCall || memoryCall.length < 1) throw new Error("indexMemory not called");
    const memoryPayload = (memoryCall as unknown[])[0] as Record<string, unknown>;
    expect(memoryPayload?.ownerId).toBe("user-1");
    expect(String(memoryPayload?.mediaType)).toContain("presentationml");
    expect(String(memoryPayload?.title).toLowerCase()).toContain("my deck");
    expect((memoryPayload?.metadata as Record<string, unknown> | undefined)?.file_extension).toBe(
      "pptx",
    );
    expect(
      Array.isArray(memoryPayload?.tags) ? (memoryPayload.tags as unknown[]).includes("pptx") : false,
    ).toBe(true);
  });

  it("rejects when no slides are provided", async () => {
    const { __test__ } = await import("@/server/composer/run");
    const runtime = {
      ownerId: "user-1",
      capsuleId: null,
      attachments: new Map(),
      composeOptions: {},
      history: [],
      latestUserText: "",
    };

    await expect(
      __test__.handleGeneratePptx({ title: "Empty", slides: [] }, runtime),
    ).rejects.toThrow("needs at least one slide");
  });
});
