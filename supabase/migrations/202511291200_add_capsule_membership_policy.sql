-- Add membership_policy to capsules to support open/request-only/invite-only access
alter table public.capsules
  add column if not exists membership_policy text not null default 'request_only'
    check (membership_policy in ('open', 'request_only', 'invite_only'));

comment on column public.capsules.membership_policy is
  'Membership policy for the capsule: open (auto-join), request_only (requires approval), invite_only (owner/admin invite only).';
