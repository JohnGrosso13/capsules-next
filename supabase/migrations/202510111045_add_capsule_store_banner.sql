-- Add store banner URL column for Capsule storefront hero artwork.
alter table public.capsules
  add column if not exists store_banner_url text;

comment on column public.capsules.store_banner_url is
  'Optional storefront hero banner image for a capsule.';
