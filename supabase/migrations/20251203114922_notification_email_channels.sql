
-- Add per-notification email channel toggles mirroring app/bell settings.
alter table if exists public.user_notification_settings
  add column if not exists comment_on_post_email boolean not null default true,
  add column if not exists comment_reply_email boolean not null default true,
  add column if not exists mention_email boolean not null default true,
  add column if not exists post_like_email boolean not null default true,
  add column if not exists capsule_new_post_email boolean not null default true,
  add column if not exists friend_request_email boolean not null default true,
  add column if not exists friend_request_accepted_email boolean not null default true,
  add column if not exists capsule_invite_email boolean not null default true,
  add column if not exists capsule_invite_accepted_email boolean not null default true,
  add column if not exists capsule_invite_declined_email boolean not null default true,
  add column if not exists capsule_request_pending_email boolean not null default true,
  add column if not exists capsule_request_approved_email boolean not null default true,
  add column if not exists capsule_request_declined_email boolean not null default true,
  add column if not exists capsule_role_changed_email boolean not null default true,
  add column if not exists ladder_challenge_email boolean not null default true,
  add column if not exists ladder_challenge_resolved_email boolean not null default true,
  add column if not exists direct_message_email boolean not null default true,
  add column if not exists group_message_email boolean not null default true,
  add column if not exists follow_new_email boolean not null default true,
  add column if not exists ladder_match_scheduled_email boolean not null default true,
  add column if not exists ladder_invited_to_join_email boolean not null default true,
  add column if not exists party_invite_email boolean not null default true,
  add column if not exists party_invite_accepted_email boolean not null default true,
  add column if not exists mention_in_chat_email boolean not null default true,
  add column if not exists live_event_starting_email boolean not null default true,
  add column if not exists stream_status_email boolean not null default true,
  add column if not exists email_digest_frequency text not null default 'instant' check (email_digest_frequency in ('instant','daily','weekly','off'));

comment on column public.user_notification_settings.email_digest_frequency is 'Controls batched email delivery cadence for notifications (instant = send immediately).';
