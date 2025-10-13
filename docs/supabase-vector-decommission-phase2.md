Supabase Vector Decommission - Phase 2
======================================

Focus
-----
- Remove any code paths that still hinted at Supabase-backed vectors.
- Collapse configuration so Pinecone is the single supported vector vendor.
- Ensure deploy docs and environment scaffolding no longer advertise Supabase vector options.

Key Changes
-----------
- `src/config/vector-store.ts` now always provisions the Pinecone adapter; the old `VECTOR_VENDOR` flag (which previously let us point back to Supabase) has been removed. Runtime behaviour still degrades gracefully when Pinecone env vars are missing because the adapter short-circuits its API calls.
- `.env.example` no longer advertises `VECTOR_VENDOR`, reducing confusion for new environments.
- Phase-1 cleanups (legacy Express server, Supabase embedding scripts) remain deleted, leaving Pinecone + Algolia as the only search stacks.

What to Watch
-------------
- Any service expecting to toggle between vendors must now rely on feature work under `src/adapters/vector/*`. If you need a second vendor, add a new adapter rather than reviving Supabase.
- Pinecone credentials are still required for write paths; make sure staging/production environments expose `PINECONE_API_KEY`, `PINECONE_INDEX`, and optional namespace/controller values.

Hand-off to Phase 3
-------------------
1. Audit live data sets and backfill Pinecone/Algolia for any rows that never migrated off Supabase.
2. Block any residual Supabase writes by monitoring for calls to `upsert_post_memory` with embedding payloads (should now be impossible) and by validating RLS logs.
3. Capture read-only comparisons (Supabase legacy vs Pinecone/Algolia) before dropping remaining database objects in Phase 4.

With configuration and code frozen to Pinecone-only operation, we are ready to migrate data (Phase 3) and decommission Supabase vector storage entirely in Phase 4. See `supabase-vector-decommission-phase3.md` for the backfill tooling and verification checklist.
