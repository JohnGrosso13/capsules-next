# Style Modifier Catalog

The backend builds image prompts with `composeUserLedPrompt` (see `src/lib/ai/prompt-styles.ts`).
Each request can pass an optional `stylePreset` so future UI surfaces can apply reusable looks without hard-coding them into prompt strings.

- **Modifiers** enrich or suppress cue buckets such as palette, lighting, medium, or mood.
  Add new presets by extending `STYLE_MODIFIERS`; use `aliases` when you want multiple identifiers to resolve to the same preset.
- **Cue buckets** map to optional guidance inside the final prompt. When you remove a bucket via `suppress`, the user's words become the only authority for that aspect.
- **Constraints** remain mandatory guardrails (e.g. "avoid text"). Modifiers can add or remove constraint lines via `addConstraints` / `removeConstraints`.

For API routes, the prompt helpers already pass through any `stylePreset` provided in the JSON payload (avatar, banner, logo). Downstream services only need to forward a preset id to opt-in. If no preset is supplied, the default behaviour keeps a balanced Capsule-friendly baseline.
