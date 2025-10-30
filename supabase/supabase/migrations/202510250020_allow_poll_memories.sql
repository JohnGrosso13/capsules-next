do $$
begin
  begin
    alter table public.memories drop constraint if exists memories_kind_check;
  exception
    when undefined_table then
      return;
  end;

  begin
    alter table public.memories
      add constraint memories_kind_check
      check (kind in ('upload','generated','post','video','theme','text','poll'));
  exception
    when undefined_table then
      null;
  end;
end
$$;
