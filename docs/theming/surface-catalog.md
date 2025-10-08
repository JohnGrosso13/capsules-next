# Surface Token Catalog

This guide enumerates the key UI surfaces and the shared design tokens they now consume. Each section links back to the implementation so custom theming can target the right variables quickly.

## App Shell
- Implementation: `src/components/app-shell.module.css`
- Backed tokens: `--text`, `--text-2`, `--text-on-brand`, `--pill-bg-1`, `--pill-bg-2`, `--pill-border`, `--gradient-brand`, `--header-height`.
- Defaults: `src/app/globals.css`

## Feed Scaffold & Prompter
- Implementation: `src/components/home.module.css`
- Shared tokens: `--feed-action-*`, `--tile-*`, `--style-friends-*`, `--style-chats-*`, `--style-requests-*`, `--surface-1`, `--surface-3`, `--surface-outline`, `--icon-plate-*`, `--prompt-glow-*`, `--link-color`.
- Defaults: `src/app/globals.css`

## Tile Galleries (Create, Suggestions)
- Implementation: `src/components/create-tiles.module.css`
- Shared tokens: `--card-*`, `--tile-*`, `--pill-*`, `--text`, `--text-2`.
- Defaults: `src/app/globals.css`, light overrides in `src/app/light-theme.css`.

## Rails & Secondary Panels
- Implementation: `src/components/home.module.css`, `src/app/(authenticated)/friends/friends.module.css`
- Tokens: `--rail-bg-1`, `--rail-bg-2`, `--rail-border`, `--accent-glow`, `--link-color`, `--pill-*`.

## Modals & Overlays
- Implementation: `src/components/global-search.module.css`
- Tokens: `--surface-overlay`, `--surface-elevated`, `--blur-amount`, `--card-border`, `--card-shadow`, `--pill-*`, `--text-*`, `--color-brand`.

## Composer Surface
- Implementation: `src/components/ai-composer.module.css`
- Tokens: `--surface-overlay`, `--pill-*`, `--text-*`, `--cta-gradient`, `--card-shadow`.

## Auth & Entry Points
- Implementation: `src/components/landing-auth-card.tsx`, `src/components/header-auth.tsx`
- Tokens: `--card-*`, `--text-*`, `--gradient-brand`, `--cta-*`.

## Admin Placeholders
- Implementation: `src/app/(authenticated)/admin/page.module.css`
- Tokens: `--color-brand`, `--color-accent`, `--text-*`, `--surface-*`.

## Token Sources
- Registry: `src/lib/theme/token-registry.ts`
- Dark defaults: `src/app/globals.css`
- Light overrides: `src/app/light-theme.css`
