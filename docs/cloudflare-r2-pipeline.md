# Cloudflare R2 Media Pipeline

This document describes the direct-to-R2 upload flow, background processing pipeline, and the Cloudflare resources required to support media ingestion.

## Architecture Overview

1. **Client** requests an upload session from `/api/uploads/r2/create`. The server verifies Turnstile, seeds Supabase + Workers KV with session metadata, and returns signed multipart URLs.
2. **Browser** uploads parts directly to R2 using the pre-signed URLs produced above and calls `/api/uploads/r2/complete` once all parts finish.
3. **Server** finalises the multipart upload, updates Supabase, and enqueues an `upload.completed` event via Cloudflare Queues.
4. **Worker (`workers/r2-pipeline`)** consumes the queue, coordinates processing through a Durable Object, and emits derived artefacts (thumbnails, transcripts, etc.) back into R2. It also patches Supabase session rows so application state stays in sync.
5. **Supabase** continues to hold metadata only. All binary assets (original and derived) live in R2.

> ?? The Worker ships with placeholder implementations for heavy tasks such as video transcoding and safety scanning. Replace the marked TODOs with actual integrations (Cloudflare Stream, Workers AI, third-party scanners) before going to production.

## Required Cloudflare Resources

- **R2 bucket** for raw + derived media (`capsules-media` by default).
- **Workers KV namespace** for upload session hints (bind as `UPLOAD_SESSIONS_KV`).
- **Durable Object** class `UploadCoordinator` (migrated via `wrangler`).
- **Queues**
  - `r2-upload-events` ? consumed by the worker when `/api/uploads/r2/complete` enqueues messages.
  - `r2-processing-tasks` ? used internally by the worker to fan out work items.
- **Turnstile** site & secret keys for abuse protection on upload session creation.
- **Optional**: Cloudflare Stream & Workers AI tokens if you wire the TODO sections to real services.

### Worker deployment

```
cd workers/r2-pipeline
wrangler deploy
```

Update `wrangler.toml` with your real bucket name, KV namespace id, queue names, and `PUBLIC_MEDIA_BASE_URL` before deploying. The [`vars`] section also expects Supabase URL/service role key and Cloudflare account id.

### Wiring queues

1. Create the two queues (`r2-upload-events`, `r2-processing-tasks`).
2. Attach the worker as a consumer (already declared in `wrangler.toml`).
3. In the Cloudflare dashboard, configure an **R2 event notification** or a Workers REST call to push messages to `r2-upload-events`. The application already posts to the Cloudflare queue API on upload completion.

### KV namespace

Create a KV namespace and bind it to the worker as `UPLOAD_SESSIONS_KV`. The Next.js API writes `session:<id>` and `upload:<multipartId>` entries so Workers can hydrate owner/bucket metadata without touching Postgres.

## Application Configuration

Populate `.env.local` (and `.env.example`) with the following new variables:

```
STORAGE_VENDOR=r2
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret>
R2_BUCKET=<bucket-name>
R2_UPLOAD_PREFIX=uploads
R2_PUBLIC_BASE_URL=https://media.example.com
CLOUDFLARE_API_TOKEN=<token with KV + Queues + Stream permissions>
R2_KV_NAMESPACE_ID=<kv-namespace-id>
R2_UPLOAD_COMPLETIONS_QUEUE=r2-upload-events
CLOUDFLARE_IMAGE_RESIZE_BASE_URL=https://media.example.com/cdn-cgi/image
TURNSTILE_SECRET_KEY=<turnstile-secret>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<turnstile-site-key>
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://media.example.com
```

The server automatically degrades Turnstile checks to "pass" in non-production environments if the secret is omitted.

## Database Migration

Apply `supabase/migrations/0008_r2_upload_pipeline.sql` (or run `npm run db:migrate`) to create the `media_upload_sessions` table and supporting indexes/RLS policies. The consolidated schema file was updated so umbrella deployments stay consistent.

## Local Development

- Install dependencies (`npm install`).
- Run the wrangler dev server for the worker if you need to iterate locally: `wrangler dev` inside `workers/r2-pipeline`.
- Start the Next.js app as usual (`npm run dev`).

Remember that the worker currently stores placeholder derivatives. Swap in real implementations as you integrate Cloudflare Stream, Workers AI, or third-party services for transcoding, scanning, and transcription.

## WAF / Bot Mitigation

Uploads remain gated by Turnstile; in production also add a Cloudflare WAF rule that only allows multipart POSTs to `/api/uploads/r2/*` from authenticated sessions (e.g. check for Clerk session cookie + Turnstile token). The doc here only covers the application changes—the rule needs to be created in the Cloudflare dashboard.
