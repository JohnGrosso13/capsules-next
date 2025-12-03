-- Ladder challenges and history tables with backfill from legacy meta

create table if not exists public.capsule_ladder_challenges (
  id uuid primary key default gen_random_uuid(),
  ladder_id uuid not null references public.capsule_ladders(id) on delete cascade,
  participant_type text not null default 'member' check (participant_type in ('member','capsule')),
  challenger_member_id uuid references public.capsule_ladder_members(id),
  opponent_member_id uuid references public.capsule_ladder_members(id),
  challenger_capsule_id uuid references public.capsules(id),
  opponent_capsule_id uuid references public.capsules(id),
  status text not null default 'pending' check (status in ('pending','resolved','void')),
  outcome text check (outcome in ('challenger','opponent','draw')),
  note text,
  proof_url text,
  reported_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_capsule_ladder_challenges_ladder_status
  on public.capsule_ladder_challenges(ladder_id, status);
create index if not exists idx_capsule_ladder_challenges_challenger_member
  on public.capsule_ladder_challenges(challenger_member_id);
create index if not exists idx_capsule_ladder_challenges_opponent_member
  on public.capsule_ladder_challenges(opponent_member_id);
create index if not exists idx_capsule_ladder_challenges_challenger_capsule
  on public.capsule_ladder_challenges(challenger_capsule_id);
create index if not exists idx_capsule_ladder_challenges_opponent_capsule
  on public.capsule_ladder_challenges(opponent_capsule_id);

do $$
begin
  create trigger trg_capsule_ladder_challenges_updated_at
    before update on public.capsule_ladder_challenges
    for each row execute function public.set_updated_at();
exception when duplicate_object then
  null;
end $$;

alter table public.capsule_ladder_challenges enable row level security;

do $$
begin
  create policy "Service role full access capsule_ladder_challenges"
    on public.capsule_ladder_challenges
    to service_role
    using (true)
    with check (true);
exception when others then
  null;
end $$;

create table if not exists public.capsule_ladder_history (
  id uuid primary key default gen_random_uuid(),
  ladder_id uuid not null references public.capsule_ladders(id) on delete cascade,
  challenge_id uuid references public.capsule_ladder_challenges(id) on delete set null,
  participant_type text not null default 'member' check (participant_type in ('member','capsule')),
  challenger_member_id uuid references public.capsule_ladder_members(id),
  opponent_member_id uuid references public.capsule_ladder_members(id),
  challenger_capsule_id uuid references public.capsules(id),
  opponent_capsule_id uuid references public.capsules(id),
  outcome text not null check (outcome in ('challenger','opponent','draw')),
  note text,
  proof_url text,
  rank_changes jsonb,
  rating_changes jsonb,
  resolved_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_capsule_ladder_history_ladder
  on public.capsule_ladder_history(ladder_id);
create index if not exists idx_capsule_ladder_history_challenge
  on public.capsule_ladder_history(challenge_id);

alter table public.capsule_ladder_history enable row level security;

do $$
begin
  create policy "Service role full access capsule_ladder_history"
    on public.capsule_ladder_history
    to service_role
    using (true)
    with check (true);
exception when others then
  null;
end $$;

-- Enforce explicit ladder member status (with metadata fallback)
alter table public.capsule_ladder_members
  add column if not exists status text;

alter table public.capsule_ladder_members
  alter column status set default 'active';

update public.capsule_ladder_members
  set status = coalesce((metadata ->> 'status'), 'active')
  where status is null;

do $$
begin
  alter table public.capsule_ladder_members
    alter column status set not null;
exception when others then
  null;
end $$;

do $$
begin
  alter table public.capsule_ladder_members
    add constraint chk_capsule_ladder_members_status
      check (status in ('pending','invited','active','rejected','banned'));
exception when duplicate_object then
  null;
end $$;

-- Optional backfill from meta.ladderState into first-class tables
do $$
declare
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ladder record;
  state jsonb;
  challenge jsonb;
  history jsonb;
  challenge_id uuid;
  participant text;
  challenger_member uuid;
  opponent_member uuid;
  challenger_capsule uuid;
  opponent_capsule uuid;
  status_value text;
  outcome_value text;
  note_value text;
  proof_value text;
  created_by uuid;
  reported_by uuid;
  created_at_value timestamptz;
  reported_at_value timestamptz;
  history_id uuid;
  rank_changes_value jsonb;
  rating_changes_value jsonb;
  resolved_at_value timestamptz;
  challenge_exists boolean;
begin
  for ladder in
    select id, meta
    from public.capsule_ladders
    where coalesce(meta->>'ladderStateMigrated', 'false') <> 'true'
  loop
    state := null;
    if coalesce(ladder.meta->'ladderState', ladder.meta->'state') is not null then
      state := coalesce(ladder.meta->'ladderState', ladder.meta->'state');
    end if;

    if state is null or jsonb_typeof(state) <> 'object' then
      continue;
    end if;

    select exists(select 1 from public.capsule_ladder_challenges where ladder_id = ladder.id)
      into challenge_exists;
    if challenge_exists then
      continue;
    end if;

    -- Challenges
    if state ? 'challenges' and jsonb_typeof(state->'challenges') = 'array' then
      for challenge in select * from jsonb_array_elements(state->'challenges') loop
        begin
          status_value := coalesce(nullif(challenge->>'status', ''), 'pending');
          if status_value not in ('pending','resolved','void') then
            status_value := 'pending';
          end if;

          participant := coalesce(nullif(challenge->>'participantType', ''), 'member');
          if participant not in ('member','capsule') then
            participant := 'member';
          end if;

          challenge_id := gen_random_uuid();
          if (challenge->>'id') ~* uuid_pattern then
            challenge_id := (challenge->>'id')::uuid;
          end if;

          challenger_member := null;
          opponent_member := null;
          if (challenge->>'challengerId') ~* uuid_pattern then
            challenger_member := (challenge->>'challengerId')::uuid;
          end if;
          if (challenge->>'opponentId') ~* uuid_pattern then
            opponent_member := (challenge->>'opponentId')::uuid;
          end if;

          challenger_capsule := null;
          opponent_capsule := null;
          if (challenge->>'challengerCapsuleId') ~* uuid_pattern then
            challenger_capsule := (challenge->>'challengerCapsuleId')::uuid;
          end if;
          if (challenge->>'opponentCapsuleId') ~* uuid_pattern then
            opponent_capsule := (challenge->>'opponentCapsuleId')::uuid;
          end if;

          outcome_value := null;
          if (challenge->'result'->>'outcome') in ('challenger','opponent','draw') then
            outcome_value := challenge->'result'->>'outcome';
          end if;

          note_value := null;
          if nullif(challenge->>'note', '') is not null then
            note_value := left(challenge->>'note', 1000);
          elsif nullif(challenge->'result'->>'note', '') is not null then
            note_value := left(challenge->'result'->>'note', 1000);
          end if;

          proof_value := null;
          if nullif(challenge->>'proofUrl', '') is not null then
            proof_value := left(challenge->>'proofUrl', 8000);
          elsif nullif(challenge->'result'->>'proofUrl', '') is not null then
            proof_value := left(challenge->'result'->>'proofUrl', 8000);
          end if;

          created_by := null;
          if (challenge->>'createdById') ~* uuid_pattern then
            created_by := (challenge->>'createdById')::uuid;
          end if;

          reported_by := null;
          if (challenge->'result'->>'reportedById') ~* uuid_pattern then
            reported_by := (challenge->'result'->>'reportedById')::uuid;
          end if;

          created_at_value := timezone('utc', now());
          if nullif(challenge->>'createdAt', '') is not null then
            begin
              created_at_value := (challenge->>'createdAt')::timestamptz;
            exception when others then
              created_at_value := timezone('utc', now());
            end;
          end if;

          reported_at_value := null;
          if nullif(challenge->'result'->>'reportedAt', '') is not null then
            begin
              reported_at_value := (challenge->'result'->>'reportedAt')::timestamptz;
            exception when others then
              reported_at_value := null;
            end;
          end if;

          insert into public.capsule_ladder_challenges (
            id,
            ladder_id,
            participant_type,
            challenger_member_id,
            opponent_member_id,
            challenger_capsule_id,
            opponent_capsule_id,
            status,
            outcome,
            note,
            proof_url,
            reported_by,
            created_by,
            created_at,
            updated_at
          )
          values (
            challenge_id,
            ladder.id,
            participant,
            challenger_member,
            opponent_member,
            challenger_capsule,
            opponent_capsule,
            status_value,
            outcome_value,
            note_value,
            proof_value,
            reported_by,
            created_by,
            created_at_value,
            coalesce(reported_at_value, created_at_value)
          )
          on conflict (id) do nothing;
        exception when others then
          raise notice 'Skipped ladder challenge backfill for ladder %: %', ladder.id, sqlerrm;
        end;
      end loop;
    end if;

    -- History
    if state ? 'history' and jsonb_typeof(state->'history') = 'array' then
      for history in select * from jsonb_array_elements(state->'history') loop
        begin
          outcome_value := history->>'outcome';
          if outcome_value not in ('challenger','opponent','draw') then
            continue;
          end if;

          participant := coalesce(nullif(history->>'participantType', ''), 'member');
          if participant not in ('member','capsule') then
            participant := 'member';
          end if;

          history_id := gen_random_uuid();
          if (history->>'id') ~* uuid_pattern then
            history_id := (history->>'id')::uuid;
          end if;

          challenge_id := null;
          if (history->>'challengeId') ~* uuid_pattern then
            challenge_id := (history->>'challengeId')::uuid;
          end if;
          if challenge_id is not null then
            perform 1 from public.capsule_ladder_challenges where id = challenge_id;
            if not found then
              challenge_id := null;
            end if;
          end if;

          challenger_member := null;
          opponent_member := null;
          if (history->>'challengerId') ~* uuid_pattern then
            challenger_member := (history->>'challengerId')::uuid;
          end if;
          if (history->>'opponentId') ~* uuid_pattern then
            opponent_member := (history->>'opponentId')::uuid;
          end if;

          challenger_capsule := null;
          opponent_capsule := null;
          if (history->>'challengerCapsuleId') ~* uuid_pattern then
            challenger_capsule := (history->>'challengerCapsuleId')::uuid;
          end if;
          if (history->>'opponentCapsuleId') ~* uuid_pattern then
            opponent_capsule := (history->>'opponentCapsuleId')::uuid;
          end if;

          note_value := null;
          if nullif(history->>'note', '') is not null then
            note_value := left(history->>'note', 1000);
          end if;

          proof_value := null;
          if nullif(history->>'proofUrl', '') is not null then
            proof_value := left(history->>'proofUrl', 8000);
          end if;

          rank_changes_value := null;
          if history ? 'rankChanges' then
            rank_changes_value := history->'rankChanges';
          end if;

          rating_changes_value := null;
          if history ? 'ratingChanges' then
            rating_changes_value := history->'ratingChanges';
          end if;

          resolved_at_value := timezone('utc', now());
          if nullif(history->>'resolvedAt', '') is not null then
            begin
              resolved_at_value := (history->>'resolvedAt')::timestamptz;
            exception when others then
              resolved_at_value := timezone('utc', now());
            end;
          end if;

          insert into public.capsule_ladder_history (
            id,
            ladder_id,
            challenge_id,
            participant_type,
            challenger_member_id,
            opponent_member_id,
            challenger_capsule_id,
            opponent_capsule_id,
            outcome,
            note,
            proof_url,
            rank_changes,
            rating_changes,
            resolved_at,
            created_at
          )
          values (
            history_id,
            ladder.id,
            challenge_id,
            participant,
            challenger_member,
            opponent_member,
            challenger_capsule,
            opponent_capsule,
            outcome_value,
            note_value,
            proof_value,
            rank_changes_value,
            rating_changes_value,
            resolved_at_value,
            resolved_at_value
          )
          on conflict (id) do nothing;
        exception when others then
          raise notice 'Skipped ladder history backfill for ladder %: %', ladder.id, sqlerrm;
        end;
      end loop;
    end if;

    update public.capsule_ladders
      set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('ladderStateMigrated', true)
      where id = ladder.id;
  end loop;
end $$;
