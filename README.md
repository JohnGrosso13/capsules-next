# Capsules Platform

Next.js + Supabase foundation for the Capsules social, commerce, and live platform.

## Environment setup

1. Copy `.env.example` to `.env.local` and fill in the required keys.
2. Provision separate Supabase projects (or at minimum separate keys) per environment and keep the service role key private.
3. Provide a Postgres connection string via `DATABASE_URL` (or `SUPABASE_DB_URL`) when running migrations.

> Tip: keep production secrets in your secret manager (1Password, Doppler, Supabase Vault) and only export them when running tooling locally.

## Database migrations

The canonical schema baseline lives in `supabase/migrations/0001_base.sql`. Add new changes as incrementally numbered files (`0002_<feature>.sql`, `0003_<feature>.sql`, ...); all applied migrations remain tracked in `public.__migrations`.

- `supabase/schema_consolidated.sql` mirrors the latest baseline and is safe to use for `supabase db reset` or local bootstraps. Do not edit it by hand - regenerate it from the migrations folder (`cp supabase/migrations/0001_base.sql supabase/schema_consolidated.sql`) whenever the baseline changes.
- After resetting the database, restore local privileges with `npm run db:grants:dev` so the Supabase service role can access the tables.

```bash
# Apply any new migrations to the database referenced by DATABASE_URL
npm run db:migrate
```

- Migrations run inside a transaction; failures roll back.
- Use a dedicated database user with migration privileges instead of the global service role.

## Development workflow

```bash
npm install
npm run db:migrate         # requires DATABASE_URL or SUPABASE_DB_URL
npm run dev                # Starts Next.js with Turbopack
```

### Chat development helpers

- `npm run db:reset:chat` — truncate direct + group chat tables (uses `SUPABASE_MIGRATIONS_URL` / `DATABASE_URL` if set).
- `npm run db:prune-chat -- --days 30` — delete chat messages older than the provided retention window (defaults to 30 days).
- `npm run db:cleanup:reactions` — remove corrupted/invalid reaction rows (e.g., legacy `??` entries) if you ran the app before this fix.
- Manual QA checklist lives in [`docs/chat-group-qa.md`](docs/chat-group-qa.md).

Environment knobs:

- `CHAT_GROUP_MAX_PARTICIPANTS` (default 50) — upper bound enforced when creating/inviting to group chats.

## Frontend architecture

- Tailwind CSS 4.1 is enabled through `postcss.config.cjs` and `@import "tailwindcss";` in `src/app/globals.css`.
- Design tokens live as CSS variables on `:root` / `[data-theme]`; utilities should rely on them via Tailwind theme keys.
- Shared primitives (Button, Input, Card, Tabs, Badge, Alert) are available in `src/components/ui` and map typed props to Tailwind classes.
- Run `npm run format` before opening a PR to align Prettier 3.6.2 output and Tailwind class ordering.

Useful environment variables:

- `NEXT_PUBLIC_STAGE` (recommended) to distinguish local/staging/prod in logging.
- `SITE_URL` so links in emails and metadata resolve correctly per environment.

## Production readiness checklist

- CI should run `npm run lint` and `npm run db:migrate` against a staging database before deploy.
- Deploy the Next.js app (Vercel, Supabase Functions, etc.) with read-only access to environment secrets.
- Rotate the Supabase service role key per environment and store it outside of the repo.

## Project structure highlights

- `src/server/**` � typed service layer (friends, posts, etc.)
- `src/components/**` � UI components shared across routes
- `src/app/(authenticated)/**` � authenticated surfaces rendered inside the shared app shell
- `supabase/migrations/**` � ordered SQL migrations for every schema change

## Analytics scaffolding

- Overview metrics live in the `analytics` schema (see the analytics section inside `supabase/migrations/0001_base.sql`).
- Use `fetchAnalyticsOverview` and related helpers (`src/server/analytics/service.ts`) for admin dashboards.
- Refresh materialized views via Supabase cron/Scheduled Functions (call `analytics.refresh_*`).
  \n\n## Request validation
- All API routes validate payloads with Zod schemas (see `src/server/validation/**`).
- Use `parseJsonBody` for new POST/PATCH endpoints and define query schemas alongside domain services.
- Keep response shapes typed; reuse the shared schemas when exposing new data.

## Questions

Reach out to the Capsules platform team for access to production credentials or to coordinate schema migrations.

## Cloudflare R2 Pipeline

Direct upload support, background processing, and worker configuration are documented in [docs/cloudflare-r2-pipeline.md](docs/cloudflare-r2-pipeline.md).

## AI Prompter overhaul

- The prompter now suggests context-aware tools from `src/components/prompter/tools.ts` (polls, logo generation, image vibe/edit), shown as quick chips under the input. Selecting a tool routes the prompt appropriately (e.g., creates a poll draft or generates/edits an image) and opens the Composer.
- New API routes power image workflows:
  - `src/app/api/ai/image/generate/route.ts` – generates an image from a prompt (OpenAI).
  - `src/app/api/ai/image/edit/route.ts` – edits an existing image by instruction.
- Video attachments are supported in the prompter picker (images and videos). The upload pipeline remains unchanged.
- The system is designed to extend with more tools (documents, tournaments, ladders) with minimal UI/logic changes.
