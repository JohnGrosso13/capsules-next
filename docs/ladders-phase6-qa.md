# Ladders Phase 6 QA Readiness

This note captures the instrumentation and verification updates that unblock the Phase 6 monitoring and QA plan.

## Telemetry Coverage

- **Client helper** `src/lib/telemetry/ladders.ts` centralises event dispatch (wizard entry, step progression, validation, autosave, publish funnel, roster mutations, filters, load-more, retries). The helper no-ops in test environments to keep specs deterministic.
- **API endpoint** `/api/telemetry/ladders` accepts the events and logs them server-side (JSON schema validated via Zod).
- Instrumented surfaces:
  - Ladder Builder: time-to-create (`ladders.wizard.view`, `ladders.publish.start` / `ladders.publish.complete`), completion rate per step (`ladders.step.enter` / `ladders.step.complete`), validation hotspots (`ladders.validation.issue`), autosave timing (`ladders.autosave.status`), first challenge write (`ladders.section.first_challenge`), draft generation lifecycle, offline blocks, discard action, experiment metadata (template source, helper density).
  - Roster Manager: add/update/remove success and failure, retry click, load errors.
  - Capsule Events list: filter and sort changes, load-more executions, error retries, offline banner.

## Automated Tests

- `src/components/create/ladders/__tests__/LadderBuilder.autosave.test.tsx` ensures autosave writes the draft payload to localStorage when editing.
- `src/components/create/ladders/__tests__/LadderBuilder.publish.test.tsx` covers the draft, publish, and events redirect flow with mocked network responses and router assertions.
- `src/components/create/ladders/__tests__/ladderFormState.schema.test.ts` verifies schema limits for basics, sections, and roster collections to guard validation edge cases.
- `src/components/capsule/__tests__/LadderRosterManager.test.tsx` validates the offline banner, disabled controls, and retry path wiring.
- `src/components/capsule/__tests__/CapsuleEventsSection.test.tsx` exercises chunked table rendering, status filters, and the sortable column interactions.

These specs rely on the telemetry helper guard (`NODE_ENV === "test"`) so they remain isolated from network side-effects.

## Manual Regression Matrix Updates

- Documented scenarios added to the Live Studio QA checklist:
  1. Offline draft creation -> verify warning toast plus telemetry (`ladders.error.surface` with `reason: offline`).
  2. Publish success and failure -> confirm `ladders.publish.complete` entries include `publishType`.
  3. Roster add/remove failure -> confirm `ladders.roster.change` `status:error` events are emitted.
  4. Events view load-more and reset filters -> confirm `ladders.load_more` / `ladders.filter.change` events recorded.
- Fixtures: mock responses for the roster API and ladder listings now live in `tests/services/` (see repository README) so QA can script error and recovery runs without hitting production services.

## Next Steps

- Hook the telemetry stream into the analytics pipeline (Segment dashboards) and set alerting thresholds for:
  - `ladders.autosave.status` errors > 5 per minute.
  - `ladders.publish.complete` failures > 2 per minute.
  - `ladders.retry.click` spikes indicating systemic load issues.
- Extend Playwright e2e coverage to cover publish success/failure flows once the API stabilises. The unit specs above prevent regressions in local logic.
