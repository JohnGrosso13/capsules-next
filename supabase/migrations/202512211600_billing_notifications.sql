-- Add billing-related notification toggles (app + email).
alter table if exists public.user_notification_settings
  add column if not exists billing_issues boolean not null default true,
  add column if not exists billing_issues_email boolean not null default true,
  add column if not exists billing_updates boolean not null default true,
  add column if not exists billing_updates_email boolean not null default true,
  add column if not exists capsule_support_sent boolean not null default true,
  add column if not exists capsule_support_sent_email boolean not null default true,
  add column if not exists capsule_support_received boolean not null default true,
  add column if not exists capsule_support_received_email boolean not null default true,
  add column if not exists store_orders boolean not null default true,
  add column if not exists store_orders_email boolean not null default true,
  add column if not exists store_sales boolean not null default true,
  add column if not exists store_sales_email boolean not null default true;

-- Extend the notification type enum for billing events.
alter table if exists public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table if exists public.user_notifications
  add constraint user_notifications_type_check check (type in (
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
    'stream_status',
    'billing_payment_failed',
    'billing_payment_succeeded',
    'billing_plan_changed',
    'capsule_power_sent',
    'capsule_power_received',
    'capsule_pass_sent',
    'capsule_pass_received',
    'store_order_paid',
    'store_order_failed',
    'store_order_sold'
  ));
