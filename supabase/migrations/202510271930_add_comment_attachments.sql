alter table public.comments
  add column if not exists attachments jsonb;

comment on column public.comments.attachments is
  'Optional JSON payload describing attachments included with a comment.';
