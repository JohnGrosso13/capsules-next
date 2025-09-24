Legacy Reference Artifacts

This folder preserves selected files from the previous non‑Next.js setup for historical reference. None of these are required to run or deploy the Next.js app in `capsules-next`.

- Supabase
  - `supabase/schema.sql` — database schema snapshot used previously.
  - `supabase/functions/oauth-start/index.ts` — legacy Supabase Edge Function (OAuth start).
  - `supabase/functions/oauth-callback/index.ts` — legacy Supabase Edge Function (OAuth callback).

- Legacy Server (Express)
  - `legacy-server/api-index.js` — Vercel serverless wrapper.
  - `legacy-server/server-supabase.js` — Express app with routes that have been migrated to Next.js API routes.
  - `legacy-server/vercel.json` — old Vercel config for the Express variant.

Notes
- Keep these as read‑only references. They are not part of the current build.
- Secrets and environment values should only live in `capsules-next/.env.local` (never commit).
