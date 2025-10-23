Banner Customizer — Minimal Literal-First Prompting

Summary
- Goal: Generate a usable banner that literally matches the user’s subject on the first try.
- Scope: Banner customizer only (avatar/logo routes unchanged).

What changed (Phases 1–3)
- Phase 1 — Baseline audit
  - Previous builder (`composeUserLedPrompt`) injected long optional cues and mood guidance.
  - Banner API requested square images (`1024x1024`) despite a 16:9 hero target.
  - Multi-purpose instructions diluted subject fidelity and could steer off-topic.
- Phase 2 — Minimal system/builder guidance
  - New literal-first rules: make the image match the subject; add only three global constraints (16:9 composition, low-noise top third, no text/logos/watermarks); keep everything else out unless user asks.
- Phase 3 — Structured prompt builder
  - Added `src/lib/ai/banner-prompt.ts`:
    - `buildLiteralBannerPrompt()` — subject-first prompt with short Composition + Constraints.
    - IP-safe note: if a brand is mentioned (e.g., “overwatch”), explicitly avoid characters/logos and lean on environment/props/palette.
  - Updated `src/app/api/ai/banner/route.ts` to use the new builder for both generate and edit.
  - Generation size switched to 16:9 (`1792x1024`).

Operational notes
- We deliberately ignore style presets/personas for banners in the new builder to keep the user subject primary.
- Edit pathway keeps `1024x1024` for the OpenAI image edit API compatibility; generation uses 16:9.

Next phases (not yet implemented)
- Phase 4: Clarifier UX for IP/character requests (single concise question), detected via the same brand heuristic.
- Phase 5: Model routing simplification (single preferred model, no multi-tries unless safety fallback).
- Phase 7: Post-check and one auto-remix when the subject cues are weak.

