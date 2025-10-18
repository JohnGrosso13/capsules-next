-- Add promo_tile_url column to store vertical promo tile images for capsules
alter table public.capsules
  add column if not exists promo_tile_url text;
