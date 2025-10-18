Supabase Vector Decommission - Phase 3
======================================

Scope
-----
- Provide tooling to backfill Pinecone vectors and Algolia records for any legacy Supabase memories that predate the Pinecone migration.
- Guard application code so Supabase never receives vector payloads again.
- Outline verification steps before proceeding to the final decommission phase.

Key Changes
-----------
- Added `scripts/backfill-pinecone-algolia.mjs`, an idempotent backfill utility that:
  - Streams `memories` rows from Supabase.
  - Reuses existing metadata to rebuild Pinecone vectors **only** when a record is missing in the configured Pinecone index.
  - Upserts corresponding search documents into the Algolia index (matching the runtime schema).
  - Sanitises legacy payloads so `meta.embedding` is stripped before re-indexing.
- Hardened `indexMemory` (`src/server/memories/service.ts:73`) to drop any stray `meta.embedding` values before inserting into Supabase, eliminating accidental reintroductions of vector payloads.

How to Run the Backfill
-----------------------
1. Ensure the following environment variables are available (via `.env.local` or shell export):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY` (+ optional `OPENAI_EMBED_MODEL`, `OPENAI_EMBED_DIM`)
   - `PINECONE_API_KEY`, `PINECONE_INDEX`, and optional namespace/controller host
   - `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `ALGOLIA_INDEX_PREFIX`
2. Execute the script:
   ```bash
   node ./scripts/backfill-pinecone-algolia.mjs
   ```
   The script reports totals for scanned memories, Pinecone upserts, and Algolia updates. Already-synced records are skipped without additional OpenAI calls.

Verification Checklist
----------------------
- [ ] Pinecone index contains vectors for every memory ID referenced in Supabase.
- [ ] Algolia index returns the same number (or more) hits as `memories` rows for keyword queries.
- [ ] Supabase audit logs show no inserts/updates containing an `embedding` column or `meta.embedding`.

Next Steps (Phase 4 Preview)
----------------------------
1. Issue SQL to drop any remaining Supabase vector artifacts (e.g., legacy indexes or helper functions).
2. Revoke Supabase credentials that previously powered vector workloads.
3. Add monitoring/alerting around Pinecone and Algolia health endpoints to catch regressions quickly.

Once the checklist is complete, move on to `supabase-vector-decommission-phase4.md` for the final decommission tasks.
