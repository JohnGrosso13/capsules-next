Legacy Reference Artifacts

This folder preserves selected files from the previous non-Next.js setup for historical reference. None of these are required to run or deploy the Next.js app in `capsules-next`.

- Supabase
  - `supabase/schema.sql` - database schema snapshot used previously.
  - `supabase/functions/oauth-start/index.ts` - legacy Supabase Edge Function (OAuth start).
  - `supabase/functions/oauth-callback/index.ts` - legacy Supabase Edge Function (OAuth callback).

- Legacy Server (Express)
  - The legacy Express implementation has been removed from the repo (see git history prior to the Supabase vector decommission work if a historical reference is needed).

Notes
- Keep these as read-only references. They are not part of the current build.
- Secrets and environment values should only live in `capsules-next/.env.local` (never commit).
