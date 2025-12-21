import { describe, expect, it } from "vitest";

import { computeDisplayUploads } from "@/components/memory/process-uploads";

const ORIGIN = "https://app.example.com";

describe("computeDisplayUploads", () => {
  it("prefers explicit thumbnail URLs when present", () => {
    const result = computeDisplayUploads(
      [
        {
          id: "thumb-1",
          media_url: "https://cdn.example.com/file.mov",
          media_type: null,
          meta: { thumbnail_url: "/thumb.jpg" },
        },
      ],
      { origin: ORIGIN, cloudflareEnabled: false },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.displayUrl).toBe("https://app.example.com/thumb.jpg");
    expect(result[0]?.fullUrl).toBe("https://cdn.example.com/file.mov");
  });

  it("falls back to derived assets when no thumbnail is provided", () => {
    const result = computeDisplayUploads(
      [
        {
          id: "derived-1",
          media_url: "https://cdn.example.com/file.mov",
          media_type: null,
          meta: { derived_assets: [{ url: "/derived.png" }] },
        },
      ],
      { origin: ORIGIN, cloudflareEnabled: false },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.displayUrl).toBe("https://app.example.com/derived.png");
    expect(result[0]?.fullUrl).toBe("https://cdn.example.com/file.mov");
  });

  it("infers video MIME types from common extensions", () => {
    const result = computeDisplayUploads(
      [
        {
          id: "video-1",
          media_url: "https://cdn.example.com/clip.mov",
          media_type: null,
          meta: {},
        },
      ],
      { origin: ORIGIN, cloudflareEnabled: false },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.media_type).toBe("video/mp4");
  });

  it("infers image MIME types for raw photo extensions", () => {
    const result = computeDisplayUploads(
      [
        {
          id: "image-1",
          media_url: "https://cdn.example.com/photo.dng",
          media_type: null,
          meta: {},
        },
      ],
      { origin: ORIGIN, cloudflareEnabled: false },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.media_type).toBe("image/x-adobe-dng");
    expect(result[0]?.displayUrl).toBe("https://cdn.example.com/photo.dng");
  });
});
