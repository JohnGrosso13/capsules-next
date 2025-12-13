import { describe, expect, it } from "vitest";

import { __test__ } from "@/lib/ai/video";

describe("runway helpers", () => {
  it("parseResolution handles valid and invalid sizes", () => {
    expect(__test__.parseResolution("1280x720")).toEqual({ width: 1280, height: 720 });
    expect(__test__.parseResolution("720x1280")).toEqual({ width: 720, height: 1280 });
    expect(__test__.parseResolution("bad")).toEqual({ width: 1280, height: 720 });
    expect(__test__.parseResolution(null)).toEqual({ width: 1280, height: 720 });
  });

  it("extractRunwayOutputs prefers explicit assets", () => {
    const output = __test__.extractRunwayOutputs({
      id: "gen-1",
      status: "succeeded",
      assets: { video: "https://cdn/video.mp4", thumbnail: "https://cdn/thumb.jpg" },
    });
    expect(output.videoUrl).toBe("https://cdn/video.mp4");
    expect(output.thumbnailUrl).toBe("https://cdn/thumb.jpg");
  });

  it("extractRunwayOutputs falls back to output array", () => {
    const output = __test__.extractRunwayOutputs({
      id: "gen-2",
      status: "succeeded",
      output: ["https://cdn/video2.mp4", "https://cdn/thumb2.jpg"],
    });
    expect(output.videoUrl).toBe("https://cdn/video2.mp4");
    expect(output.thumbnailUrl).toBe("https://cdn/thumb2.jpg");
  });
});
