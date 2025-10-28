Video Upload Pipeline (Mux + Cloudflare)

This app can transcode uploaded videos to adaptive playback using a Cloudflare Worker + Mux. Follow these steps to enable it in dev or prod.

Prereqs
- Cloudflare account with: R2, Workers, KV, Queues access
- Supabase project (already configured by the app)
- Mux account with Token ID/Secret and a playback-capable plan

1) App environment (.env.local)
- Ensure these exist:
  - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_UPLOAD_PREFIX
  - R2_PUBLIC_BASE_URL (can be a placeholder like https://media.local.example)
  - CLOUDFLARE_API_TOKEN (token with KV Write and Queues Write is required by the app to enqueue events)
  - R2_KV_NAMESPACE_ID (the KV namespace ID used by the worker/app)
  - R2_UPLOAD_COMPLETIONS_QUEUE=r2-upload-events   ← enable the pipeline
  - CLOUDFLARE_IMAGE_RESIZE_BASE_URL (optional for images)
  - MUX_TOKEN_ID, MUX_TOKEN_SECRET (for Mux transcoding from the worker)

2) Cloudflare Worker resources (one‑time)
Run these from the repo root (Windows PowerShell shown):

  cd workers\r2-pipeline
  npx wrangler login
  npx wrangler r2 bucket create capsules-next
  npx wrangler kv namespace create UPLOAD_SESSIONS_KV
  npx wrangler queues create r2-upload-events
  npx wrangler queues create r2-processing-tasks

Note the new KV namespace ID if you created one, and update both:
- workers/r2-pipeline/wrangler.toml [[kv_namespaces]].id
- .env.local R2_KV_NAMESPACE_ID

3) Worker secrets (per environment)
From workers\r2-pipeline:

  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
  npx wrangler secret put MUX_TOKEN_ID
  npx wrangler secret put MUX_TOKEN_SECRET
  npx wrangler secret put MUX_ENVIRONMENT   # optional (production/test)
  npx wrangler secret put MUX_PLAYBACK_DOMAIN  # optional (e.g. media.example.com)

4) Deploy / logs

  npx wrangler deploy
  npx wrangler tail

5) Test
- Upload an iPhone .mov in the app.
- The app enqueues to r2-upload-events; the worker uploads to Mux, polls until asset is ready, and writes a derived `video.transcode` asset with mp4/HLS and a poster.
- Refresh the feed: video should play via mux-hosted mp4 (or HLS fallback).

Troubleshooting
- No events: ensure .env.local has R2_UPLOAD_COMPLETIONS_QUEUE and CLOUDFLARE_API_TOKEN, and the token has Queues:Write.
- Worker can’t patch Supabase: set SUPABASE_SERVICE_ROLE_KEY secret and confirm SUPABASE_URL in wrangler.toml [vars].
- mp4 missing: Mux may return HLS only for a period. The UI prefers mp4 when available; otherwise it uses HLS URL.

