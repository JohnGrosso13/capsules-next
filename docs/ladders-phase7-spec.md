# Ladders Phase 7 - Visual Polish & Specs

This note captures the visual refinements, content guidelines, and instrumentation updates introduced in Phase 7 for the ladder creation experience and the supporting capsule surfaces.

## Component Spec

### Wizard Stepper
- Five-step layout with sticky navigation on desktop (`.stepperShell`).
- States: pending (neutral border), active (accent glow plus arrow indicator), complete (gradient background plus checkmark).
- Step index badges reuse the identity ring style; the glow animates on focus and hover.
- Buttons remain keyboard accessible and expose `aria-current="step"` for the active state.

### Live Preview Panel
- Identity avatar ring and seed chip draw from the deterministic palette (`getIdentityAccent`).
- Member stats render as `Seed {n} - W-L(-D) - ELO {rating} - Streak +/-n` with glossary `abbr` helpers.
- Spotlight sections show up to three bullet points; empty state messaging nudges creators to add content.

### Data Tables
- Roster editor introduces inline avatars, accent chips, and helper copy describing ELO and streak behaviour.
- Capsule Events table now surfaces color-coded identity chips beside ladder and tournament names, with standardised visibility badges.
- Hover styles remain subtle (muted background wash) to keep contrast compliant.

### Badges
- Unified badge tokens (`--badge-surface`, `--badge-border`, `--badge-glow`) across status, visibility, and identity chips.
- Status badges carry uppercase labels and a lightweight glow matching the state tone (success, neutral, warn).
- Identity chips reuse palette variables for both the preview panel and capsule list rows.

### Toasts & Empty States
- No structural change; colours reference the shared surface tokens introduced in Phase 6.
- Ladder preview empty messaging and filter-empty states adopt concise, action-first copy such as "Add players to see them listed here" and "Reset filters".

## Content Spec

| Field / Surface | Label | Helper / Microcopy | Error / Guardrail |
| --- | --- | --- | --- |
| Basics | Ladder name | "Name the ladder so captains recognise it." | "Name must include at least 3 characters." |
| Basics | Visibility | Option labels: `Private`, `Capsule`, `Public` | N/A |
| Basics | Publish toggle | "Launch as live ladder" (switch copy shortened) | When false, review step text reads "Save as draft." |
| Sections | Title input | Placeholder "Section title" | "Section title is required." |
| Sections | Bullets | Placeholder "Bullet points (one per line)" | "Limit bullet points to 8 entries." |
| Format | Game title | Label "Game title" | N/A |
| Format | Rating fields | Helper copy: "ELO updates player skill after every match. K-Factor controls how much ratings swing." | Numeric fields bounded by schema |
| Roster | Table columns | Headers: `Name`, `Handle`, `Seed`, `Rating`, `W`, `L`, `Draw`, `Streak` | Table-level hint explains ELO and streak usage |
| Roster | Remove button | Verb "Remove" retained | Confirmation not required (local-only data) |
| Preview | Member stats | Inline copy combines seed, record, ELO, and streak with glossary hints | N/A |

## Tracking Plan

| Event | Fired from | Payload highlights |
| --- | --- | --- |
| `ladders.wizard.view` | Stepper mount or capsule switch | `action` (`initial` or `capsule_switch`), `helperDensity`, `capsulesVisible`, `draftRestored` |
| `ladders.step.enter` / `ladders.step.complete` | Step navigation | `stepId`, `visit`, `durationMs`, `elapsedMs`, `context` (`advance`, `jump`, `publish`) |
| `ladders.validation.issue` | Step validation failures | `stepId`, `fields` array, `issueCount`, `context` |
| `ladders.publish.start` / `ladders.publish.complete` | Publish CTA | `publishType`, `attempt`, `stepsCompleted`, `stepVisits`, `templateSource`, `membersCount`, `firstChallengeMs` |
| `ladders.section.first_challenge` | Upcoming Challenges filled (user or blueprint) | `source` (`user` or `blueprint`), `elapsedMs` |
| Capsule Events interactions | Filters, sort toggles, load more | Existing Phase 6 payloads, now consumed alongside identity styling |

All events continue to pass through `src/lib/telemetry/ladders.ts`, which still suppresses dispatches during automated tests. Updated payloads feed the Phase 7 dashboards that monitor time-to-create, per-step drop-off, validation hotspots, and publish success rate.
