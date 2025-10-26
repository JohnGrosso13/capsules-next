## Capsules Theme Authoring Primer

This guide explains how to craft curated presets and supply high quality examples to the AI stylist.
It pairs with `docs/theme-surface-token-map.json`, which maps surfaces to semantic tokens.

### Core Tokens

- Prioritise the exported `coreSiteThemeTokens` from `src/lib/theme/token-registry.ts` when shaping a palette.
- Always drive hero mood through `--app-bg`, `--surface-app`, and a single `--background-fx-*` token.
- Keep one accent family across `--cta-gradient`, `--brand-gradient`, and `--color-brand`.

### Curated Preset Roster

The baseline library now ships with:

- Seasonal: `summer`, `fall`, `winter`, `spring`, `holiday`, `halloween`
- Conceptual: `space`, `ocean`, `forest`, `cyberpunk`, `retro`, `minimal`, `vaporwave`

Each preset offers coordinated light and dark variants that rely on the same accent family.

### Light/Dark Variants

Every preset defines both `light` and `dark` variants (see `src/lib/theme/preset-config.ts`).
Light variants may override more properties to counter wash-out, but both variants should:

1. Maintain ≥4.5:1 contrast for text on interactive surfaces. Rely on `stabilizeThemeVars` if unsure.
2. Reuse the same accent/brand hues so switching between modes still “feels” like the same theme.
3. Provide CTA chip/button gradients and text overrides so hero actions stay legible.

### Background FX Tokens

Use the dedicated FX tokens for scenic moods:
- `--background-fx-stars` (night sky, space)
- `--background-fx-snow` (winter, holiday)
- `--background-fx-confetti` (celebration)
- `--background-fx-scanlines` (retro, arcade)

Only ever store gradients or layered color mixes in these values—never images or URLs.

### Preset Checklist

For each preset:

1. Pick `seedHex` (base neutral) and optional `accentHex` (brand hue) for both variants.
2. Override the following anchors when you need additional control:
   - Surfaces: `--app-bg`, `--surface-app`, `--card-bg-*`, `--surface-muted`, `--surface-elevated`.
   - Header/Dock: `--header-glass-*`, `--header-border-color`, `--dock-bg-*`, `--dock-border`.
   - CTA & chips: `--cta-gradient`, `--cta-button-text`, `--cta-chip-gradient`, `--cta-chip-text`.
   - Feedback: `--color-success`, `--color-warning`, `--color-danger` (only if the defaults clash).
3. Leave contextual tokens (friends/chats/party specific) untouched unless the theme demands it.
4. Validate with real UI:
   - Feed card background + hover
   - Header translucency over hero imagery
   - CTA button legibility
   - Dock icon readability

### AI Prompt Examples

When supplying examples to the AI stylist, describe the mood + accent + background treatment. Example:

```
Prompt: “Give me a space station theme with deep indigo glass and neon cyan highlights.”
Key tokens: --app-bg (starfield gradient with --background-fx-stars), --color-brand (neon cyan), --card-shadow (cool purple glow), --cta-gradient (cyan-to-magenta).
```

The AI should emit JSON with only whitelisted CSS variables, favouring the core list. Avoid references to copyrighted characters/logos—focus on colors, lighting, texture words, and gradients.

### Validation Tips

- Run `pnpm lint` and `pnpm test --filter theme` (when present) after editing theme files.
- Save candidate overrides in `/api/memory/theme/save` via the in-app UI for quick real-user smoke.
- Capture before/after screenshots in both light and dark mode; keep them in design QA docs.
