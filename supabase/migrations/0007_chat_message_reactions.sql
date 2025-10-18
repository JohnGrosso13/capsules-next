-- Message reaction storage supporting direct and group chats.

create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint chat_message_reactions_pkey primary key (message_id, user_id, emoji),
  constraint chat_message_reactions_emoji_not_blank check (length(btrim(emoji)) > 0)
);

create index if not exists idx_chat_message_reactions_message
  on public.chat_message_reactions (message_id, created_at desc);

alter table public.chat_message_reactions enable row level security;

do $$
begin
  begin
    create policy "Service role full access chat_message_reactions"
      on public.chat_message_reactions
      to service_role
      using (true)
      with check (true);
  exception
    when others then null;
  end;
end
$$;
