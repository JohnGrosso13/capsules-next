# AI Image Runs

Server-side image operations now persist structured run records in the `ai_image_runs`
table (see migration `202510221205_ai_image_runs.sql`).

Each record tracks:
- `asset_kind`, `mode` (`generate` or `edit`), and the original user prompt.
- The resolved prompt after modifier composition (`resolved_prompt`) plus the `style_preset`.
- The model/provider chosen, retry count, OpenAI response metadata, and any image URL returned.
- A JSON array of individual attempts (`attempts`), including timestamps, model, and failure details when relevant.

### Realtime Channel
UI clients can subscribe to `ai:image:{userId}` (lower-cased) for live progress:
- `ai.image.run.started` — includes `runId`, user prompt, resolved prompt, style, and options saved for the run.
- `ai.image.run.attempt` — fired for each attempt with status `started`, `succeeded`, or `failed` and any OpenAI error message.
- `ai.image.run.completed` — emitted once per run with final status plus the image URL on success.

Auth tokens issued by `POST /api/realtime/token` now grant `subscribe` capability to this channel.

### Integrating New Callers
Helpers `generateImageFromPrompt` and `editImageWithInstruction` accept an optional third argument:

```ts
await generateImageFromPrompt(resolvedPrompt, imageOptions, {
  ownerId,               // string | null
  assetKind: "avatar",   // descriptive category for analytics
  mode: "generate",      // or "edit"
  userPrompt,            // raw text from the customer
  resolvedPrompt,        // prompt after style modifiers
  stylePreset,           // string | null
  options: { size, quality, ... }, // any extra context to persist
  retryDelaysMs: [0, 1500, 4000],  // optional overrides for backoff schedule
});
```

Supplying the context enables both run persistence and realtime streaming. Calls without the context continue to work without logging.

### Deployment Checklist

- Apply migration `supabase/migrations/202510221205_ai_image_runs.sql` in each environment (`dev`, `staging`, `production`) before deploying code that inserts into the table.  
  ```bash
  node scripts/run-sql.mjs \
    --file supabase/migrations/202510221205_ai_image_runs.sql \
    --url "$SUPABASE_DB_URL"
  ```
- Ensure the web client subscribes to the Ably channel `ai:image:{userId}` (lower-cased) to receive prompt/error updates emitted by the server.
- Capture the selected `stylePreset` and resolved prompt in logs or UI diagnostics so the team can reuse real examples when iterating in Phase 2.
