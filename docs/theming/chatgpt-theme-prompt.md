# ChatGPT Theme Prompt Contract

Use this contract when soliciting new site themes from ChatGPT or other LLM assistants. It ensures output aligns with our schema and passes validation without manual cleanup.

## Prompt Structure
```
You are designing a theme for the Capsules app.
Return JSON only, matching this schema:
{
  "name": "string <= 80",
  "description": "string <= 240",
  "modes": {
    "light": { "--token-id": "value" },
    "dark": { "--token-id": "value" }
  },
  "metadata": {
    "source": "chatgpt",
    "author": "string?",
    "tags": ["string", ...]
  }
}

Allowed tokens are listed at https://capsules.internal/docs/theming/core-token-manifest.
Values must be CSS literals (hex/rgb/hsl/gradients) or `var(--token)` references.
Respect WCAG AA contrast between text and backgrounds.
Prefer cohesive palettes built around one primary hue and one accent.
```

## Guidance for Assistants
- Theme should include both `light` and `dark` maps; if one mode matches default, provide empty object `{}`.
- Limit each mode to ≤ 80 overrides; rely on derived defaults where possible.
- Use gradients sparingly — no more than three custom gradient definitions.
- Provide metadata tags describing the vibe (`"tags": ["warm", "sunset"]`).
- Avoid direct references to copyrighted brands or imagery.

## Post-Processing
1. Run the output through the validation endpoint (`POST /api/themes/validate`).
2. Surface validation errors back to the assistant for correction.
3. Once valid, persist via `POST /api/themes`.
4. Attach provenance metadata (prompt id, timestamp, reviewer).

## Review Checklist
- ✅ Passes schema + token whitelist
- ✅ Contrast ≥ 4.5:1 for text on surfaces, ≥ 3:1 for UI elements
- ✅ Adheres to selector budget (< 256 overrides)
- ✅ Metadata populated (name, tags, description)

## Example Response (truncated)
```json
{
  "name": "Aurora Drift",
  "description": "Cool twilight hues with neon accents.",
  "modes": {
    "light": {
      "--surface-app": "linear-gradient(180deg,#f5f7ff 0%,#eaf1ff 100%)",
      "--color-brand": "#2563eb",
      "--color-accent": "#22d3ee"
    },
    "dark": {
      "--surface-app": "linear-gradient(180deg,#030617 0%,#0b1229 100%)",
      "--color-brand": "#60a5fa",
      "--color-accent": "#38bdf8"
    }
  },
  "metadata": {
    "source": "chatgpt",
    "tags": ["cool", "futuristic"]
  }
}
```
