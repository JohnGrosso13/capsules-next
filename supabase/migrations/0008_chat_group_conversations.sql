-- Authoritative storage for group chat conversations and their membership.

create table if not exists public.chat_conversations (
  id text not null,
  type text not null default 'group' check (type in ('group','direct')),
  title text not null default '',
  avatar_url text,
  created_by uuid not null references public.users(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_conversations_pkey primary key (id),
  constraint chat_conversations_id_not_blank check (length(btrim(id)) > 0),
  constraint chat_conversations_group_prefix check (
    type <> 'group' or id like 'chat:group:%'
  )
);

create index if not exists idx_chat_conversations_creator
  on public.chat_conversations (created_by, created_at desc);

create index if not exists idx_chat_conversations_type_created
  on public.chat_conversations (type, created_at desc);

alter table public.chat_conversations enable row level security;

do $$
begin
  begin
    create policy "Service role full access chat_conversations"
      on public.chat_conversations
      to service_role
      using (true)
      with check (true);
  exception
    when others then null;
  end;
end
$$;

do $$
begin
  begin
    create trigger trg_chat_conversations_updated_at
      before update on public.chat_conversations
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end
$$;

create table if not exists public.chat_conversation_members (
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  invited_by uuid references public.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_conversation_members_pkey primary key (conversation_id, user_id),
  constraint chat_conversation_members_group_only check (conversation_id like 'chat:group:%')
);

create index if not exists idx_chat_conversation_members_user
  on public.chat_conversation_members (user_id, joined_at desc);

create index if not exists idx_chat_conversation_members_conversation_role
  on public.chat_conversation_members (conversation_id, role);

alter table public.chat_conversation_members enable row level security;

do $$
begin
  begin
    create policy "Service role full access chat_conversation_members"
      on public.chat_conversation_members
      to service_role
      using (true)
      with check (true);
  exception
    when others then null;
  end;
end
$$;

do $$
begin
  begin
    create trigger trg_chat_conversation_members_updated_at
      before update on public.chat_conversation_members
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end
$$;
