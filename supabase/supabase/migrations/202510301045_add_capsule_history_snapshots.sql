-- Create table to persist generated capsule history snapshots.
create table if not exists public.capsule_history_snapshots (
  capsule_id uuid primary key references public.capsules(id) on delete cascade,
  generated_at timestamptz not null default now(),
  latest_post_at timestamptz null,
  post_count integer not null default 0,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capsule_history_snapshots_latest_post_idx
  on public.capsule_history_snapshots(latest_post_at desc);

