# Composer Experience Architecture � Phase 2

## Overview

- **Entry surface**: `/create/composer` route will host the new artifact workspace inside the global `AppShell` but replace the default feed layout with the tri-pane composer experience.
- **Core shells**:
  - `ContextRail` (left, collapsed by default) exposes recents, retrieval results, and action history.
  - `ArtifactCanvas` (center) renders the block tree with slot previews, inline diff annotations, and focus affordances.
  - `ChatControl` (right) houses conversational history, action chips, typing indicators, and status toasts.
- **State machine alignment**: viewport transitions are keyed to the existing `ComposerViewState` (`idle ? drafting ? focusing-slot ? reviewing-action`). View depth toggles determine which micro-surfaces (slot inspector, diff panel) become visible.
- **Event flow**: UI surfaces listen to the shared composer event bus (`insert_block`, `update_slot`, etc.) to stay synchronized with chat intents and persistence outcomes.

## Layout Blueprint

| Breakpoint  | Left Rail                       | Canvas         | Chat Column | Notes                                                        |
| ----------- | ------------------------------- | -------------- | ----------- | ------------------------------------------------------------ |
| = 1440px    | 280px expanded / 72px collapsed | min 720px flex | 360px fixed | Default desktop layout.                                      |
| 1200�1439px | 240px / overlay                 | min 600px      | 320px       | Context rail auto-collapses; toggled with keyboard + button. |
| 960�1199px  | Overlay drawer                  | min 540px      | 320px       | Chat stacks under canvas via tab control.                    |
| < 960px     | Overlay for both rails          | 100% width     | overlay     | Mobile-first: canvas full-screen, chat opens as sheet.       |

### Structural Components

- `ComposerWorkspace` wraps the three shells, manages responsive breakpoints via CSS variables (`--panel-width`, `--chat-width`).
- `ContextRail` exposes sections: `Discover`, `History`, `Assets`, `Suggestions`. Each section renders as accordions with lazy content.
- `ArtifactCanvas` handles block tree rendering with slots-as-cards. Supports inline diff badges (`AI proposal`, `User edit`) and ghost previews for pending media.
- `ChatControlPanel` renders chat stream, composer input, action chips, and cost/latency bar. Integrates typing indicators and error toasts.

## Progressive Disclosure

1. **Default** (idle/drafting): context rail collapsed to icon strip; chat shows conversation + primary chips.
2. **Slot focus**: canvas highlights focused block/slot, reveals slot inspector overlay anchored to chat column top.
3. **Reviewing action**: proposals surface as diff cards; acceptance/branch CTA pinned under chat input and mirrored in canvas header.
4. **Mobile**: top-level tabs (`Canvas`, `Chat`, `Context`) ensure only one active surface; slot inspector becomes bottom sheet.

## Accessibility & Input Model

- Responsive layout respects reduced motion preference (fade/scale transitions disabled when `prefers-reduced-motion` is set).
- Context rail toggle is `Ctrl/Cmd + \`. Screen readers announce open/close state and section changes.
- Canvas supports keyboard navigation with arrow keys cycling blocks and `Enter` focusing slots. Focus ring tokens align with theme (`--focus-ring`).
- Chat input maintains ARIA live region for streaming tokens; diff proposals announced as list items with roles.

## Theming & Visual Language

- Introduce new CSS custom properties under `.composer-workspace` scope:
  - `--composer-bg` (default: `var(--surface-elevated)`)
  - `--composer-rail` (`var(--surface-muted)`)
  - `--composer-outline` (`color-mix(in srgb, var(--accent-500) 40%, transparent)`)
  - `--composer-ghost` (`rgba(255,255,255,0.08)`)
- Tokens drive Tailwind additions under `theme.extend.colors.composer.*` for utility usage.
- Micro-interactions: 140ms ease-out translate for panel reveals, 220ms cubic bezier for slot ghost fade. Pulse animation for "AI is drafting�" uses CSS `@keyframes composerDraftPulse`.

## Interaction Contracts

- `ContextRail` listens for `status_update` with scope `recall` to spotlight new retrieval suggestions.
- `ArtifactCanvas` responds to `preview_media` by rendering ghost block overlay with confirm controls.
- `ChatControlPanel` dispatches `update_slot`/`insert_block` via `useComposerArtifact` actions and exposes branch/rollback buttons.
- Shared `useWorkspaceShortcuts` hook binds keyboard shortcuts (toggle rail, accept diff, open media inspector).

## Implementation Notes

- Layout styles will live in `src/components/composer/workspace/composer-workspace.module.css`; components in matching folder structure.
- Mobile overlays leverage `@radix-ui/react-dialog` primitives already in project (wrap for reuse).
- Telemetry hooks emit events (`composer_view_state_changed`, `composer_panel_toggle`) via existing analytics service.
- Future (Phase 3/4) integration points left as TODO comments with guard to avoid lint failures.

---

This blueprint guides the Phase 2 scaffolding in code (components + styles) and aligns with the state/events authored in Phases 0�1.
