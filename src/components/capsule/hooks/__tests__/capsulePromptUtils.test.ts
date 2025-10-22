// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { buildPromptEnvelope } from "../capsulePromptUtils";

describe("buildPromptEnvelope", () => {
  it("combines base and refinements into a labeled envelope", () => {
    const result = buildPromptEnvelope(
      "Base prompt about synthwave",
      [" add neon skyline ", "focus on dusk lighting"],
      "keep the energy upbeat",
    );

    expect(result).toBe(
      [
        "Base prompt about synthwave",
        "Refine with: add neon skyline",
        "Refine with: focus on dusk lighting",
        "Refine with: keep the energy upbeat",
      ].join("\n\n"),
    );
  });

  it("falls back to the latest prompt when base and refinements are empty", () => {
    const result = buildPromptEnvelope(null, ["   "], "  final touch  ");
    expect(result).toBe("final touch");
  });

  it("filters blank refinements and trims segments", () => {
    const result = buildPromptEnvelope(
      "  initial ",
      ["", "   improve contrast   ", " "],
      "  adjust framing ",
    );

    expect(result).toBe(
      ["initial", "Refine with: improve contrast", "Refine with: adjust framing"].join("\n\n"),
    );
  });
});

