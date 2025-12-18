-- Capsule-owned memories: add owner_type and owner_capsule_id to distinguish memory scope

alter table if exists public.memories
  add column if not exists owner_type text not null default 'user' check (owner_type in ('user', 'capsule'));

alter table if exists public.memories
  add column if not exists owner_capsule_id uuid references public.capsules(id) on delete cascade;

update public.memories
  set owner_type = coalesce(owner_type, 'user');

create index if not exists idx_memories_owner_capsule
  on public.memories(owner_capsule_id, created_at desc);

create index if not exists idx_memories_owner_scope
  on public.memories(owner_type, owner_user_id, owner_capsule_id);
