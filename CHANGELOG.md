# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

## [2025-09-23]

### Highlights
- Fluent + Glassmorphic + soft‑Neumorphic style pass across header, AI prompter, feed cards, and promo tiles.
- Cleaner, more focused signed‑in home experience inspired by the provided screenshot.

### Header
- Increased contrast with lighter acrylic tint, blur, and subtle bottom fade.
- Reordered actions to: Profile → Settings → Launch Capsule.
- Replaced the settings glyph with a premium gradient‑stroke SVG gear.
- Enlarged and aligned profile and settings icons (both 44×44) for consistent sizing.

### AI Prompter
- Centered and simplified container; removed outer outline box.
- Increased spacing above and below for visual focus.
- Added localized, balanced glow around the prompt bar (no bleed to other elements).
- Chips centered beneath the input; kept glass/neumorphic control styling.
- Fixed broken characters in placeholder; uses “…” and an ✨ icon for the Generate button.

### Promo Tiles (YouTube Shorts‑style)
- Moved tiles outside the prompter into their own row.
- 4 tall vertical cards (9:16) with acrylic depth and responsive fallback to 2 columns < 900px.
- Aligned exactly with the feed width; friends rail aligns to the row.

### Feed
- Post layout: username + humanized timestamp above the content; text above media.
- Added equal‑width action bar (Like, Comment, Share, Delete).
- “Delete” wired to `DELETE /api/posts/[id]` (falls back to local removal on error).
- Neumorphic cards with hover lift and subtle dividers; action pills match glass style.

### Right Rail
- Acrylic card style; friends list pills and avatars updated for cohesion.

### Fixes / Dev Notes
- Resolved JSX compile error by replacing HTML comments inside inline SVG.
- New/updated files:
  - src/app/landing.module.css
  - src/app/page.tsx
  - src/components/header-auth.module.css
  - src/components/home-signed-in.tsx
  - src/components/home.module.css
  - src/components/promo-row.tsx
  - src/components/promo-row.module.css

