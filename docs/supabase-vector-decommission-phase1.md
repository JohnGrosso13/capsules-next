Supabase Vector Decommission - Phase 1
======================================

Scope
-----
- Audited the codebase for any remaining dependencies on Supabase-hosted vectors (pgvector/ivfflat).
- Retired unused tooling and legacy server code paths that depended on those vectors.
- Documented the production search/vector stack hand-off to Pinecone and Algolia so Phase 2 implementation work can begin.

Key Findings
------------
- All active memory flows (`src/server/memories/service.ts`, `src/app/api/.../memory/route.ts`) already target Pinecone for vector storage and Algolia for keyword recall; the Supabase `memories` table retains only metadata columns.
- The deprecated `scripts/backfill-memory-embeddings.mjs` script still attempted to write to `memories.embedding`, which no longer exists. The script has been removed to prevent accidental failures.
- The archived Express server (`archive/legacy-server/*`) was the only remaining consumer of the Supabase cosine-search RPC. The entire archive has been deleted; historical context remains available via git history and `docs/reference/README.md`.

Phase 2 Starting Checklist
--------------------------
1. Remove any residual Supabase configuration/env references that are specific to vector workflows (service role grants, unused env vars, docs).
2. Strip `memories.embedding` from database snapshots (`supabase/schema_consolidated.sql`) if any historical dumps reintroduce it, and ensure future migrations do not add pgvector extensions by default.
3. Update CI/deployment scripts to drop Supabase vector-focused jobs (e.g., ensure no pipelines try to run the deleted backfill script).
4. Tighten telemetry/tests around Pinecone/Algolia usage so regressions surface quickly once Supabase fallbacks disappear.
5. Prepare migration notes for environments that might still have the legacy column/index to drop them safely (SQL snippet is already in `supabase/migrations/0003_memories_remove_embedding.sql`).

With these cleanups in place, Phase 2 can focus on deleting remaining Supabase vector schema objects, refactoring configs, and expanding monitoring on the Pinecone/Algolia stack without worrying about legacy fallbacks. See `supabase-vector-decommission-phase2.md` for the follow-up actions and outcomes.
