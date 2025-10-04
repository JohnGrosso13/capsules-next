# Composer Revamp – Phases 0 & 1

## Context Snapshot
- Goal: transform the current drawer-based AI composer into a canvas-driven artifact editor composed of blocks with addressable slots and a companion chat engine.
- Baseline implementation lives inside `src/components/composer/*` and `src/components/ai-composer.tsx`; it produces flat post drafts (text, poll, or single media) stored via the existing `/api/posts` pipeline.
- Data services today persist posts, memories, and media upload sessions in Supabase; binary assets are stored in Cloudflare R2 (`capsules-media`). Pinecone is already wired for "memories" vector search via `src/adapters/vector/pinecone.ts`.

## Phase 0 – Discovery & Alignment

### Artifact Family Requirements
| Family | Primary Use Cases | Block Types | Slot Expectations | Notes |
| --- | --- | --- | --- | --- |
| Narrative Documents (presentations, proposals, briefs) | Sequential storytelling with hero, body, highlights | `text.rich`, `media.hero`, `callout`, `timeline`, `quote` | Named slots per section (e.g. `hero.media`, `body.summary`, `callout.actions`) that accept markdown-ish text or featured media | Needs branching to compare alternate narratives. |
| Operational SOPs & Forms | Structured instructions, checklists, data capture | `list.checklist`, `form.field_group`, `table.grid`, `stepper` | Slots for inputs (`field.email`), validation meta, default values | Must expose schema for downstream automation export. |
| Commerce & Campaign Capsules | Product drops, launch teasers, social snippets | `media.gallery`, `cta.block`, `stats.mini`, `embed.social` | Media slots support image/video sequence with descriptors (prompt, seed). CTA slots link to storefront. | Requires real-time cost estimation for media generation. |
| Interactive Polls & Feedback Artifacts | Branching polls, vibe checks | `poll.multi`, `poll.slider`, `text.caption` | Slots that preserve poll configuration and optional follow-up text. | Shares persistence with existing post poll structure but within artifact tree. |
| Knowledge Base & Templates | Reusable block trees | `text.rich`, `faq.group`, `timeline`, `media.thumbnail` | Slots must support variable placeholders (e.g. `{{product_name}}`). | Templates versioned; AI should reference history when instantiating.

### AI Persona Definition
- Tone: collaborative strategist who surfaces options, explains trade-offs, and respects brand guardrails.
- Behaviours: always propose a clear next action, cite reasoning when altering existing blocks, flag uncertainty before modifying media, and default to additive diffs instead of destructive rewrites.
- Safety & scope: declines tasks outside artifact editing (e.g. account settings), escalates ambiguous legal/compliance questions, and never auto-publishes without an explicit user confirm.
- Memory strategy: references relevant drafts/assets from left rail context; avoids hallucinating sources by quoting artifact titles and slot ids.

### Performance & Cost Targets
- Text-only block mutations should stream first tokens < 600 ms from request receipt; full completion = 2.5 s p95.
- Media generation or retrieval actions should acknowledge intent (typing indicator) immediately and deliver preview URLs = 4.5 s p95; background renders may exceed but must emit status events.
- Pinecone recall queries capped at 200 ms budget; aggregate per-chat session vector cost < $0.02.
- Target per-artifact Supabase writes < 5 per user-visible action; queue fan-out stays under 3 downstream jobs to contain worker spend.

### Current Composer Audit
- Drawer UX (`src/components/ai-composer.tsx`, `src/components/composer/ComposerForm.tsx`) centers around a single draft with optional media or poll; no block hierarchy, no diff acceptance, limited slot semantics.
- State is maintained via `ComposerContext` inside `ComposerProvider`; actions from the prompter resolve to `ComposerDraft` updates and eventually `/api/posts` persistence.
- Media handling relies on existing upload sessions and simple URL injection; no R2 slot mapping or provenance metadata.
- Guardrails limited to schema validation; no event bus abstraction between AI intent and UI—mutations occur directly in provider callbacks.

### Data & Infra Inventory
- **Supabase**
  - `public.posts`, `public.comments`, `public.memories`, `public.media_upload_sessions`, plus social graph tables (`friend_*`, `capsule_*`).
  - Analytics schema houses `analytics.daily_active_users`, `analytics.daily_posts` for instrumentation.
  - No dedicated artifact tables yet; migrations 0001-0009 govern existing domain features.
- **Cloudflare R2** (`capsules-media` bucket)
  - Direct upload pipeline documented in `docs/cloudflare-r2-pipeline.md`; worker manages derivative assets and queue notifications (`r2-upload-events`, `r2-processing-tasks`).
  - Slots currently not modelled; everything is keyed by upload session ID.
- **Pinecone**
  - Client abstraction in `src/adapters/vector/pinecone.ts`; namespaces configured via env (`PINECONE_NAMESPACE`).
  - Used today for `memories` embeddings; no artifact-specific index yet.

### Success Metrics
- Editing velocity: median time from prompt submission to accepted block diff < 20 s; = 60% of prompts resolved without manual correction.
- Canvas adoption: 75% of beta users create = 2 artifacts/week using the new composer.
- Reliability: < 1% of artifact mutations fail without recovery suggestion; embedding sync lag < 1 min.
- Cost guardrail: AI-assisted artifact session average spend = $0.60, with visibility provided in cost dashboard.

## Phase 1 – Core Platform Foundations

### Artifact Schema Design
```ts
export type Artifact = {
  id: string;
  artifactType: "presentation" | "proposal" | "sop" | "form" | "campaign" | "custom";
  status: "draft" | "published" | "archived";
  title: string;
  description?: string;
  version: number;
  metadata: {
    themeId?: string;
    personaIntent?: string;
    tags?: string[];
    derivedFromId?: string | null;
  };
  blocks: ArtifactBlock[];
  context?: ArtifactContext;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactBlock = {
  id: string;
  type: BlockType;
  label?: string;
  state: BlockState;
  slots: Record<string, ArtifactSlot>;
  children?: ArtifactBlock[];
  annotations?: BlockAnnotation[];
};

export type ArtifactSlot = {
  id: string;
  kind: SlotKind;
  status: SlotStatus;
  value?: SlotValue;
  provenance?: SlotProvenance;
  constraints?: SlotConstraints;
};
```
- Blocks are nested to support multi-page compositions; slots carry status (`empty`, `pending`, `ready`, `error`) so the AI can address `blockId.slotId` directly.
- `provenance` captures whether the slot came from AI generation, user upload, or imported asset (with pointers to R2 keys or template IDs).
- `annotations` hold diff metadata for chat proposals (e.g. `suggestion`, `branch`, `rollbackRef`).

### Supabase Migration Plan
1. **Table `artifact_artifacts`**
   - Columns: `id uuid pk`, `owner_user_id`, `artifact_type text`, `status text`, `title`, `description`, `version int`, `metadata jsonb`, `blocks jsonb`, `context jsonb`, timestamps, soft delete flags.
   - RLS: owners + service role; support collaborator policy once Phase 7 begins.
2. **Table `artifact_assets`**
   - Maps slots to R2 or external binaries: `id uuid pk`, `artifact_id uuid fk`, `block_id text`, `slot_id text`, `r2_bucket text`, `r2_key text`, `content_type`, `descriptor jsonb` (prompt, seed, style), `created_at`.
3. **Table `artifact_events`** (append-only audit for Phase 7 reuse)
   - Stores event bus payload snapshots for analytics / debugging.
4. Indices on `artifact_id`, `owner_user_id`, and `((blocks->'root'->>'id'))` for fast lookup by block id.
5. Migration script seeds `artifact_type` enum and backfills from future templates when available.

### Event Bus Contracts
| Event | Payload | Emitted By | Consumed By | Notes |
| --- | --- | --- | --- | --- |
| `insert_block` | `{ artifactId, parentId?, position, block }` | Chat engine, template actions | Canvas state, persistence layer | Inserts new block; triggers diff annotation.
| `update_slot` | `{ artifactId, blockId, slotId, patch, draftId }` | Chat engine, media worker | Canvas, autosave worker | `patch` merges into slot value/state.
| `remove_block` | `{ artifactId, blockId, reason }` | User action, AI rollback | Canvas, persistence | Soft delete flag for undo.
| `preview_media` | `{ artifactId, blockId, slotId, previewUrl, expiresAt }` | Media pipeline | Canvas (ghost preview), chat (status) | Mark slot `pending` until confirmed.
| `commit_artifact` | `{ artifactId, version, diffSummary }` | Canvas when user accepts | Persistence, analytics, embedding worker | Bumps version and queues embeddings.
| `branch_artifact` | `{ sourceArtifactId, newArtifactId, summary }` | Chat engine | Persistence, context rail | Creates fork and wires context rail entry.
| `status_update` | `{ artifactId, scope, status, message? }` | Any worker | UI notifications | Used for cost / latency feedback.

Events flow through a typed `EventEmitter` abstraction (React context) so UI, chat, and background workers stay loosely coupled.

### Shared Type Library Layout
- New module `src/shared/types/artifacts.ts` exports the schema types above plus helper enums (`BlockType`, `SlotKind`, `SlotStatus`).
- Runtime validation lives in `src/shared/schemas/artifacts.ts` (Zod) for reuse across client/server.
- `@/lib/ai/intents` imports these types to coerce GPT outputs; `/api/artifacts` routes validate incoming payloads against shared schemas.

### `useComposerArtifact` State Layer
- Implemented in `src/hooks/useComposerArtifact.ts`; wraps a `useReducer` that tracks `artifact`, `selectedBlockId`, `focusSlotId`, `viewState` (idle ? drafting ? focusing-slot ? reviewing-action).
- Consumes the event bus via context, applies events to local state, and surfaces imperative actions (`dispatchIntent`, `acceptDiff`, `branchFromProposal`).
- Maintains an optimistic change queue with debounced persistence triggers (default 1.2 s) and exposes derived selectors for canvas panes and chat summaries.

### Persistence Endpoints
- REST namespace `src/app/api/artifacts`:
  - `POST /api/artifacts` creates a blank artifact from template or scratch; validates request (`CreateArtifactRequestSchema`).
  - `GET /api/artifacts/[id]` hydrates artifact with blocks, slots, associated assets.
  - `PATCH /api/artifacts/[id]` applies diffs (e.g. block/slot patches) using optimistic concurrency via `version` and event log append.
  - `POST /api/artifacts/[id]/commit` finalizes a version and schedules embedding ingestion.
- Each handler calls `src/server/artifacts/service.ts` which encapsulates Supabase access and R2 asset registration, reusing `getSupabaseAdminClient` and new repository helpers.

### Pinecone Embedding Pipeline Skeleton
- New worker entry `workers/artifact-embeddings` (stub) consumes queue `artifact-commit-events` and updates Pinecone index `capsules-artifacts`.
- Server-side helper `queueArtifactEmbedding(artifactId: string)` publishes events when commits succeed.
- Embedding payload: flatten blocks -> slots, generate text chunks (slot text, descriptors), include metadata (`artifactType`, `blockType`, `slotId`, `tags`).
- Supports streaming back into chat via `recall` intent filtering by `artifactId` or semantic similarity.
- Reuses existing Pinecone client but namespaces under `${PINECONE_NAMESPACE}-artifacts` to isolate from memories.

### Open Questions & Risks
- Need alignment on collaborative editing before finalizing RLS policies (Phase 7 dependency).
- Media derivatives may outgrow single `artifact_assets` table; monitor for eventual move to dedicated asset service.
- Ensure diff model is representable in GPT output constraints (prompt engineering TBD in Phase 3).
- Confirm cost targets with finance once diffusion/video integrations priced (Phase 4/5).
