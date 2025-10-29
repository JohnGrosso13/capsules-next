-- Ensure the Capsules AI assistant system user exists and add assistant task tables.

-- Create the assistant system user if missing.
insert into public.users (id, user_key, provider, full_name, avatar_url)
values (
  '26c6d7b6-b15d-4e0e-9d11-5c457769278e',
  'capsules-assistant',
  'other',
  'Capsules AI',
  null
)
on conflict (id) do update
set
  user_key = excluded.user_key,
  provider = excluded.provider,
  full_name = excluded.full_name,
  avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
  updated_at = now();

-- Assistant task tracking
create table if not exists public.assistant_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  assistant_user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  status text not null default 'pending',
  prompt text,
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_assistant_tasks_owner_status
  on public.assistant_tasks (owner_user_id, status);

create table if not exists public.assistant_task_targets (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.assistant_tasks(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  conversation_id text not null,
  message_id uuid,
  status text not null default 'pending',
  last_response_message_id uuid,
  last_response_at timestamptz,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_assistant_task_targets_task
  on public.assistant_task_targets (task_id);

create index if not exists idx_assistant_task_targets_owner
  on public.assistant_task_targets (owner_user_id, status);

create index if not exists idx_assistant_task_targets_conversation
  on public.assistant_task_targets (conversation_id);

create index if not exists idx_assistant_task_targets_target
  on public.assistant_task_targets (target_user_id);

-- Updated-at triggers
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'assistant_tasks_set_updated_at'
  ) then
    create trigger assistant_tasks_set_updated_at
      before update on public.assistant_tasks
      for each row execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'assistant_task_targets_set_updated_at'
  ) then
    create trigger assistant_task_targets_set_updated_at
      before update on public.assistant_task_targets
      for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.assistant_tasks enable row level security;
alter table public.assistant_task_targets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_tasks'
      and policyname = 'Service role full access assistant_tasks'
  ) then
    create policy "Service role full access assistant_tasks"
      on public.assistant_tasks
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_task_targets'
      and policyname = 'Service role full access assistant_task_targets'
  ) then
    create policy "Service role full access assistant_task_targets"
      on public.assistant_task_targets
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;
