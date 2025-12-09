import { describe, expect, it } from "vitest";

import { isPowerpointMemory } from "@/components/memory/uploads-carousel";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";

const baseItem: DisplayMemoryUpload = {
  id: "1",
  media_type: "",
  meta: null,
  kind: "upload",
  created_at: "",
  media_url: "",
  title: "",
  description: "",
  displayUrl: "https://cdn/test",
  fullUrl: "https://cdn/test",
};

describe("isPowerpointMemory", () => {
  it("detects pptx by mime type", () => {
    const item: DisplayMemoryUpload = {
      ...baseItem,
      media_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    expect(isPowerpointMemory(item)).toBe(true);
  });

  it("detects pptx by extension", () => {
    const item: DisplayMemoryUpload = {
      ...baseItem,
      media_type: "application/octet-stream",
      meta: { file_extension: "pptx" },
      media_url: "https://cdn/test.pptx",
    };
    expect(isPowerpointMemory(item)).toBe(true);
  });

  it("detects pptx via meta tokens", () => {
    const item: DisplayMemoryUpload = {
      ...baseItem,
      media_type: "application/octet-stream",
      meta: { type: "presentation" },
    };
    expect(isPowerpointMemory(item)).toBe(true);
  });
});
