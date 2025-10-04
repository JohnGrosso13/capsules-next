import { describe, expect, it } from "vitest";

import { resolveStylerHeuristicPlan } from "@/lib/theme/styler-heuristics";

describe('resolveStylerHeuristicPlan', () => {
  it('produces a full site theme for simple color intents', () => {
    const plan = resolveStylerHeuristicPlan('make it green');
    expect(plan).not.toBeNull();
    expect(plan?.source).toBe('heuristic');
    expect(plan?.vars['--card-bg-1']).toBeTruthy();
    expect(plan?.vars['--text']).toBeTruthy();
  });

  it('targets feed cards when explicitly mentioned', () => {
    const plan = resolveStylerHeuristicPlan('make the feed cards blue');
    expect(plan).not.toBeNull();
    expect(plan?.vars['--feed-action-bg-1']).toBeTruthy();
    expect(plan?.vars['--feed-action-border']).toBeTruthy();
  });

  it('maps theme presets like neon directly', () => {
    const plan = resolveStylerHeuristicPlan('give me a neon theme');
    expect(plan).not.toBeNull();
    expect(plan?.summary.toLowerCase()).toContain('neon');
    expect(plan?.vars['--cta-gradient']).toContain('linear-gradient');
  });

  it('falls back when prompt is beyond heuristics', () => {
    const complex = 'theme my site after the solar system with unique colors for each planet and a space black background';
    const plan = resolveStylerHeuristicPlan(complex);
    expect(plan).toBeNull();
  });
});
