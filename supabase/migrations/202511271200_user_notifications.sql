create table if not exists public.user_notification_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  comment_on_post boolean not null default true,
  comment_reply boolean not null default true,
  mention boolean not null default true,
  post_like boolean not null default true,
  capsule_new_post boolean not null default true,
  friend_request boolean not null default true,
  friend_request_accepted boolean not null default true,
  capsule_invite boolean not null default true,
  capsule_invite_accepted boolean not null default true,
  capsule_invite_declined boolean not null default true,
  capsule_request_pending boolean not null default true,
  capsule_request_approved boolean not null default true,
  capsule_request_declined boolean not null default true,
  capsule_role_changed boolean not null default true,
  ladder_challenge boolean not null default true,
  ladder_challenge_resolved boolean not null default true,
  direct_message boolean not null default true,
  group_message boolean not null default true,
  follow_new boolean not null default true,
  ladder_match_scheduled boolean not null default true,
  ladder_invited_to_join boolean not null default true,
  party_invite boolean not null default true,
  party_invite_accepted boolean not null default true,
  mention_in_chat boolean not null default true,
  live_event_starting boolean not null default true,
  stream_status boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger user_notification_settings_set_updated_at
  before update on public.user_notification_settings
  for each row
  execute procedure public.set_updated_at();

alter table public.user_notification_settings enable row level security;

create policy "user_notification_settings_self_select"
  on public.user_notification_settings
  for select
  using (auth.uid() = user_id);

create policy "user_notification_settings_self_insert"
  on public.user_notification_settings
  for insert
  with check (auth.uid() = user_id);

create policy "user_notification_settings_self_update"
  on public.user_notification_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in (
    'comment_on_post',
    'comment_reply',
    'mention',
    'post_like',
    'capsule_new_post',
    'friend_request',
    'friend_request_accepted',
    'capsule_invite',
    'capsule_invite_accepted',
    'capsule_invite_declined',
    'capsule_request_pending',
    'capsule_request_approved',
    'capsule_request_declined',
    'capsule_role_changed',
    'ladder_challenge',
    'ladder_challenge_resolved',
    'direct_message',
    'group_message',
    'follow_new',
    'ladder_match_scheduled',
    'ladder_invited_to_join',
    'party_invite',
    'party_invite_accepted',
    'mention_in_chat',
    'live_event_starting',
    'stream_status'
  )),
  title text not null,
  body text,
  href text,
  data jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create index if not exists idx_user_notifications_user_created_at
  on public.user_notifications (user_id, created_at desc);

create index if not exists idx_user_notifications_unread
  on public.user_notifications (user_id)
  where read_at is null;

alter table public.user_notifications enable row level security;

create policy "user_notifications_self_select"
  on public.user_notifications
  for select
  using (auth.uid() = user_id);

create policy "user_notifications_self_insert"
  on public.user_notifications
  for insert
  with check (auth.uid() = user_id);

create policy "user_notifications_self_update"
  on public.user_notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
