import { describe, expect, it } from "vitest";

import {
  composeUserLedPrompt,
  resolveStyleModifier,
  type PromptCueMap,
} from "./prompt-styles";

const BASE_CUES: PromptCueMap = {
  composition: ["Keep subject centered."],
  lighting: ["Use soft diffused lighting."],
  palette: ["Lean on balanced, product-friendly tones."],
  mood: ["Friendly and confident."],
};

describe("composeUserLedPrompt", () => {
  it("prioritizes user prompt and applies enrichments for a style preset", () => {
    const prompt = composeUserLedPrompt({
      userPrompt: "Make it neon cyberpunk.",
      objective: "Create a banner for launch.",
      subjectContext: "Fits a 16:9 hero area with safe UI margins.",
      baseCues: BASE_CUES,
      styleId: "capsule-default",
    });

    expect(prompt).toMatch(/User prompt: Make it neon cyberpunk\./);
    expect(prompt).toMatch(/Primary objective: Create a banner for launch\./);
    expect(prompt).toMatch(/Subject context: Fits a 16:9 hero area with safe UI margins\./);

    // Capsule default should keep palette guidance and add mood enrichment.
    expect(prompt).toMatch(/Optional cues:/);
    expect(prompt).toMatch(/Palette: Lean on balanced, product-friendly tones\./);
    expect(prompt).toMatch(/Mood: Friendly and confident\./);
  });

  it("suppresses palette cues when style preset removes them", () => {
    const preset = resolveStyleModifier("minimal-matte");
    expect(preset).not.toBeNull();

    const prompt = composeUserLedPrompt({
      userPrompt: "Create a minimal monochrome logo.",
      objective: "Design a square capsule logo.",
      subjectContext: "Needs to be legible in a rounded-square mask.",
      baseCues: BASE_CUES,
      style: preset,
    });

    expect(prompt).toMatch(/User prompt: Create a minimal monochrome logo\./);

    // Minimal Matte suppresses palette cues so we should not see the palette guidance.
    expect(prompt).not.toMatch(/Palette:/);
    expect(prompt).toMatch(/Composition: Keep subject centered\./);
  });

  it("resolves style aliases case-insensitively", () => {
    const preset = resolveStyleModifier("NEON");
    expect(preset).not.toBeNull();
    expect(preset?.id).toBe("vibrant-future");
  });
});

