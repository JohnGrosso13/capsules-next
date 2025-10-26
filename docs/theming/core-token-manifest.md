# Core Design Token Manifest

This manifest outlines the canonical token set that every refactored component should consume. Each token is backed by a CSS custom property and is considered **core** unless otherwise noted.

## Surfaces
- `--surface-app` — primary app background; fallback to `--app-bg`
- `--surface-muted` — subdued panels, quiet cards
- `--surface-elevated` — elevated panels, dialogs
- `--surface-overlay` — scrims, popovers
- `--surface-accent` — optional accent layer (contextual)

## Text
- `--color-fg` — primary text
- `--color-fg-muted` — secondary text
- `--color-fg-subtle` — tertiary text
- `--text-on-brand` — text on brand surfaces

## Brand & Feedback
- `--color-brand`, `--color-brand-strong`, `--color-accent`
- `--color-success`, `--color-warning`, `--color-danger`, `--color-info`
- `--gradient-brand` — default gradient, keeps CTA parity

## Borders & Radii
- `--border-default` — 1px neutral border
- `--border-strong` — high-contrast border
- `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`

## Shadows
- `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- `--shadow-overlay` — scrims, modal drops

## Spacing & Layout
- `--space-2xs` … `--space-6xl` — standard spacing scale
- `--layout-page-width`, `--layout-column-gap`, `--layout-rail-width`

## Motion
- `--motion-duration-quick`, `--motion-duration-medium`, `--motion-duration-slow`
- `--motion-ease-standard`, `--motion-ease-emphasized-in`, `--motion-ease-emphasized-out`

## Typography
- `--font-sans`, `--font-display`, `--font-mono`
- `--font-weight-regular`, `--font-weight-semibold`, `--font-weight-bold`

## Utilities (Optional)
- `--glass-bg-1`, `--glass-bg-2` — shared glassmorphism backgrounds
- `--tile-shadow` — reusable tile elevation
- `--cta-button-gradient` — CTA gradient override hook

## Contextual Tokens
Tokens prefixed with feature namespaces (e.g., `home.`, `capsule.`, `friends.`) should alias back to the core set above. When a component needs bespoke values, define the contextual token as an alias (`--home-feed-card-bg: var(--surface-elevated)`) rather than introducing new raw values.

## Governance
- All tokens live in `src/lib/theme/token-registry.ts`
- Tailwind bindings are generated via `buildTailwindThemeExtension`
- New tokens require design approval and documentation in this manifest
