import { describe, expect, it } from "vitest";

import { resolveStylerHeuristicPlan } from "@/lib/theme/styler-heuristics";
import { isVariantEmpty } from "@/lib/theme/variants";

describe("resolveStylerHeuristicPlan", () => {
  it("switches to dark mode when asked", () => {
    const plan = resolveStylerHeuristicPlan("can you put me on dark mode?");
    expect(plan).not.toBeNull();
    expect(plan?.source).toBe("heuristic");
    expect(plan?.summary.toLowerCase()).toContain("dark");

    const variants = plan!.variants;
    expect(isVariantEmpty(variants)).toBe(false);
    const lightKeys = Object.keys(variants.light ?? {});
    const darkKeys = Object.keys(variants.dark ?? {});
    expect(lightKeys.length).toBeGreaterThan(0);
    expect(darkKeys.length).toBeGreaterThan(0);
    expect(variants.light).toEqual(variants.dark);
  });

  it("applies a named preset when requested", () => {
    const plan = resolveStylerHeuristicPlan("apply the summer theme");
    expect(plan).not.toBeNull();
    expect(plan?.summary).toContain("Summer");

    const variants = plan!.variants;
    const lightBrand = variants.light?.["--color-brand"];
    const darkBrand = variants.dark?.["--color-brand"];
    expect(lightBrand ?? darkBrand).toBe("#f97316");
    expect(Object.keys(variants.light ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(variants.dark ?? {}).length).toBeGreaterThan(0);
  });

  it("defers complex color prompts to the AI path", () => {
    const plan = resolveStylerHeuristicPlan("make it green with purple buttons");
    expect(plan).toBeNull();
  });

  it("falls back when prompt is beyond heuristics", () => {
    const complex =
      "theme my site after the solar system with unique colors for each planet and a space black background";
    const plan = resolveStylerHeuristicPlan(complex);
    expect(plan).toBeNull();
  });
});
