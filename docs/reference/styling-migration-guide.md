# Styling Migration Guide (Wave 1)

This guide walks engineers through migrating legacy CSS modules to the consolidated token + utility system. The first wave targets the home experience (AppShell, Home feed, Composer overlay, Primary Header).

## Prerequisites
- Read the [Core Design Token Manifest](../theming/core-token-manifest.md)
- Ensure `npm run lint:css` (coming soon) passes locally
- Install Playwright + axe (`npm run test:ui`) for visual/accessibility checks

## Step 1: Prune Dead Selectors
1. Use the selector audit script (`scripts/analyze-css.mjs`) to list unused classes.
2. Delete unused blocks outright; re-run the script to confirm reduction.
3. Update JSX references as needed (`rg "styles\." src/components/app-shell.tsx`).

## Step 2: Map Styles to Tokens
1. For each remaining selector, log declarations in the mapping sheet (Notion/Sheets).
2. Replace raw colors/gradients with token references (`var(--surface-elevated)`, etc.).
3. Introduce contextual aliases only when absolutely necessary, defined adjacent to the component.

## Step 3: Introduce Utilities
1. Use Tailwind utilities for layout/spacing where possible (`grid`, `gap-4`, `px-6`).
2. For repeated patterns (glass panels, CTA buttons), add token-backed utilities in `globals.css` under `@layer utilities`.
3. Document any new utility in `docs/theming/core-token-manifest.md`.

## Step 4: Update Components
1. Refactor JSX to consume utilities or smaller class sets.
2. Replace string concatenations (`${styles.layout} ${styles.layoutHome}`) with variant helpers (e.g., `clsx(styles.layout, isHome && styles.layoutHome)`).
3. Ensure props surface variants explicitly (e.g., `<AppShell layoutVariant="capsule" />`).

## Step 5: Validate
1. Run `npm run test:ui` to generate screenshots and axe reports.
2. Execute `npm run lint` (includes CSS lint) and `npm run typecheck`.
3. Capture selector count + bundle size post-build (`npm run build && node scripts/css-metrics.mjs`).

## Step 6: Document & Ship
1. Update changelog with selector count and bundle delta.
2. Note design review outcomes and accessibility sign-off.
3. Flip feature flag for the migrated routes after staging verification.

## FAQ
- **Where do contextual tokens live?** Define them alongside feature modules (e.g., `home.tokens.css`) and alias back to core tokens.
- **What if I need a new token?** Propose it via design review; document rationale and update the manifest + Tailwind bindings.
- **How do I handle gradients?** Use `--gradient-brand` or introduce `--feature-gradient` that references core colors; avoid raw hex sequences.
