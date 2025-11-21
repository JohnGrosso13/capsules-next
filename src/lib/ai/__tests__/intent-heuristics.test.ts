import { describe, expect, it } from "vitest";

import { detectIntentHeuristically } from "@/lib/ai/intent";

describe("detectIntentHeuristically", () => {
  it("defaults to chat when no prompt is provided", () => {
    const result = detectIntentHeuristically("");
    expect(result.intent).toBe("chat");
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.reason).toMatch(/ready when you are/i);
  });

  it("assumes chat for ambiguous phrasing", () => {
    const result = detectIntentHeuristically("Thinking about what to share today");
    expect(result.intent).toBe("chat");
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
    expect(result.reason).toMatch(/ready when you are/i);
  });

  it("detects explicit manual posting commands", () => {
    const result = detectIntentHeuristically("Post: Hello Capsule friends!");
    expect(result.intent).toBe("post");
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.reason).toMatch(/post/i);
  });

  it("detects styling requests for the capsule", () => {
    const result = detectIntentHeuristically("Restyle my capsule buttons with neon colors");
    expect(result.intent).toBe("style");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.reason).toMatch(/styl|color|theme/i);
  });

  it("detects navigation requests to known surfaces", () => {
    const result = detectIntentHeuristically("Open the settings page");
    expect(result.intent).toBe("navigate");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.reason).toMatch(/settings|navigation/i);
  });

  it("detects asset generation for polls", () => {
    const result = detectIntentHeuristically("Create a poll about weekend plans");
    expect(result.intent).toBe("generate");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.reason).toMatch(/poll|survey/i);
  });

  it("detects summary requests as generation", () => {
    const result = detectIntentHeuristically("Summarize my latest capsule activity");
    expect(result.intent).toBe("generate");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.reason).toMatch(/summary|summarize|recap/i);
  });
});
