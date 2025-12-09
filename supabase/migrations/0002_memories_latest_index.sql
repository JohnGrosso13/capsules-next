-- 0002_memories_latest_index.sql
-- Speed up Memory list queries (owner filter + is_latest + kind + created_at/id ordering).

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'memories'
  ) then
    begin
      create index if not exists idx_memories_owner_latest_kind_created_at_id
        on public.memories (owner_user_id, is_latest, kind, created_at desc, id desc);
    exception
      when duplicate_table then null;
    end;
  end if;
end;
$$;

