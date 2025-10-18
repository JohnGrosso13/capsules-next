Supabase Vector Decommission - Phase 4
======================================

Scope
-----
- Remove any remaining Supabase database artifacts tied to the old pgvector workflow.
- Rotate / revoke credentials that previously allowed vector writes.
- Add operational guidance to keep Pinecone + Algolia pathways healthy hereafter.

Key Changes
-----------
- Introduced `supabase/migrations/0004_drop_supabase_vector_artifacts.sql`, which:
  - Drops the `vector` extension if it still exists.
  - Removes legacy tables/indices (`memory_embeddings`, `memory_vectors`, `idx_memories_embedding`, etc.).
  - Cleans up superseded helper functions such as the embedding-aware `upsert_post_memory` RPC.
- Earlier phases already hardened the runtime code, so applying this migration finishes the Supabase cleanup with no application changes.

Operational Checklist
---------------------
1. **Apply migrations**  
   ```bash
   npm run db:migrate
   ```  
   Use a privileged database user—`0004_drop_supabase_vector_artifacts.sql` must run against every Supabase project (prod/staging/dev).
2. **Revoke unused credentials**  
   - Rotate / delete service-role keys that were dedicated to vector pipelines or the retired Express server.
   - Remove network egress rules or RLS policies that targeted now-dropped tables.
3. **Billing/asset audit**  
   - Delete any Supabase storage buckets or functions that solely existed for vector backups.
   - Confirm pgvector extension charges are gone after the migration.
4. **Monitoring & Alerts**  
   - Add health checks for Pinecone (e.g., `/describe_index_stats`) and Algolia (e.g., `listIndexes`) to your observability stack.
   - Alert on failures from `scripts/backfill-pinecone-algolia.mjs` in case it is scheduled for periodic verification.
5. **Documentation & Post-mortem**  
   - Record migration timestamps and the rotated credential IDs.
   - Link this Phase 4 doc + CLI outputs in your internal runbook for future reference.

Outcome
-------
With Supabase free of vector-specific schema, credentials rotated, and monitoring pointed at Pinecone/Algolia, the pgvector pathway is fully decommissioned. Future work should happen exclusively in the Pinecone/Algolia adapters—if another vector backend is required, add a new adapter rather than reintroducing Supabase dependencies.
