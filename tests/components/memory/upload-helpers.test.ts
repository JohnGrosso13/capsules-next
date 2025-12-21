import { describe, expect, it } from "vitest";

import { isImage, isVideo } from "@/components/memory/upload-helpers";

describe("upload helper media detection", () => {
  it("detects videos via MIME or extension", () => {
    expect(isVideo("video/mp4")).toBe(true);
    expect(isVideo(null, "mov")).toBe(true);
    expect(isVideo(null, "mkv")).toBe(true);
    expect(isVideo("application/octet-stream", "mp4")).toBe(true);
  });

  it("detects images via MIME or extension", () => {
    expect(isImage("image/jpeg")).toBe(true);
    expect(isImage(null, "png")).toBe(true);
    expect(isImage(null, "heic")).toBe(true);
    expect(isImage("application/octet-stream", "dng")).toBe(true);
  });
});
