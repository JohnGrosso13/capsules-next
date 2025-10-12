create table if not exists public.chat_messages (
  id text primary key,
  conversation_id text not null,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  client_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_messages_conversation_not_blank check (length(btrim(conversation_id)) > 0),
  constraint chat_messages_body_not_blank check (length(btrim(body)) > 0)
);

create index if not exists idx_chat_messages_conversation_created
  on public.chat_messages(conversation_id, created_at desc);

create index if not exists idx_chat_messages_sender_created
  on public.chat_messages(sender_id, created_at desc);

do $$
begin
  begin
    create trigger trg_chat_messages_updated_at
      before update on public.chat_messages
      for each row execute function public.set_updated_at();
  exception
    when duplicate_object then null;
  end;
end $$;

alter table public.chat_messages enable row level security;

do $$
begin
  begin
    create policy "Service role full access chat_messages"
      on public.chat_messages
      to service_role
      using (true)
      with check (true);
  exception
    when others then null;
  end;
end $$;
