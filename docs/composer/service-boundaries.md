# Composer Service Boundaries (Nov 2025 refresh)

## Why
- ComposerProvider had to juggle UI state and every network concern, which made the bundle heavy and tough to test.
- Extracting network helpers into `src/services/composer/*` lets us write unit coverage later without mounting React trees and gives us a single place to adapt fetch/retry logic for higher traffic.

## What changed
- `callAiPrompt` now lives in `src/services/composer/ai.ts` alongside the attachment-context helper, so any surface (composer, chat, prompter) can reuse the same request shaper.
- `persistPost` moved to `src/services/composer/posts.ts`, isolating post mutations from UI state.
- `callStyler`, composer save-to-memory, and logo/image-edit flows now live in `src/services/composer/{styler,memories,images}.ts`, so intent handlers simply await service calls.
- Remote sidebar hydration and summary comments now go through `src/services/composer/conversations.ts` and `src/services/comments.ts`, removing the last `fetch` calls from React components.
- `ComposerProvider` now composes dedicated `ComposerSmartContextProvider`, `ComposerSidebarProvider`, and the session provider so consumers can subscribe to smaller contexts without re-rendering the entire composer tree.
- `ComposerForm` renders feature panes (`panes/PromptPane.tsx`, `panes/PreviewPane.tsx`) so prompt, history, and preview logic can be lazy-loaded or unit-tested in isolation instead of living in one 3.7k LOC file.
- `AiPrompterStage` now delegates attachment, intent, and voice orchestration to `usePrompterStageController`, so other prompter surfaces can reuse the same controller without bundling UI state.
- ComposerProvider imports these helpers, trimming more than 400 LOC from the provider and clarifying its role as a coordinator rather than a transport layer.

## Follow-up
1. Add unit tests around `callAiPrompt` that stub `fetch` and validate payload shaping (options, attachments, context). With the function isolated we can use Vitest/Jest without React.
2. Introduce a retry/debounce layer in `src/services/composer/ai.ts` so high-volume usage can exponential-backoff without re-rendering providers.
3. Apply the same service extraction to `callStyler`, summary fetches, and feed-syncing to finish separating UI and transport concerns before splitting providers.
