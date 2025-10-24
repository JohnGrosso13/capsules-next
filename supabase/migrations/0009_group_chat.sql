-- Persistent storage for group chat conversations, membership, messages, and reactions.

create table if not exists public.chat_group_conversations (
  id text not null,
  created_by uuid references public.users(id) on delete set null,
  title text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_group_conversations_pkey primary key (id),
  constraint chat_group_conversations_id_not_blank check (length(btrim(id)) > 0)
);

create table if not exists public.chat_group_participants (
  conversation_id text not null references public.chat_group_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_group_participants_pkey primary key (conversation_id, user_id)
);

create table if not exists public.chat_group_messages (
  id uuid not null,
  conversation_id text not null references public.chat_group_conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  client_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_group_messages_pkey primary key (id),
  constraint chat_group_messages_body_not_blank check (length(btrim(body)) > 0)
);

create table if not exists public.chat_group_message_reactions (
  message_id uuid not null references public.chat_group_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint chat_group_message_reactions_pkey primary key (message_id, user_id, emoji),
  constraint chat_group_message_reactions_emoji_not_blank check (length(btrim(emoji)) > 0)
);

create index if not exists idx_chat_group_participants_user
  on public.chat_group_participants (user_id, conversation_id);

create index if not exists idx_chat_group_messages_conversation_created_at
  on public.chat_group_messages (conversation_id, created_at desc);

create index if not exists idx_chat_group_messages_sender
  on public.chat_group_messages (sender_id, created_at desc);

create index if not exists idx_chat_group_reactions_message
  on public.chat_group_message_reactions (message_id, created_at desc);

alter table public.chat_group_conversations enable row level security;
alter table public.chat_group_participants enable row level security;
alter table public.chat_group_messages enable row level security;
alter table public.chat_group_message_reactions enable row level security;

do $$
begin
  begin
    create policy "Service role full access chat_group_conversations"
      on public.chat_group_conversations
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
    create policy "Service role full access chat_group_participants"
      on public.chat_group_participants
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
    create policy "Service role full access chat_group_messages"
      on public.chat_group_messages
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
    create policy "Service role full access chat_group_message_reactions"
      on public.chat_group_message_reactions
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
    create trigger trg_chat_group_conversations_updated_at
      before update on public.chat_group_conversations
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end
$$;

do $$
begin
  begin
    create trigger trg_chat_group_participants_updated_at
      before update on public.chat_group_participants
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end
$$;

do $$
begin
  begin
    create trigger trg_chat_group_messages_updated_at
      before update on public.chat_group_messages
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end
$$;

do $$
begin
  begin
    create trigger trg_chat_group_message_reactions_updated_at
      before update on public.chat_group_message_reactions
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end
$$;
