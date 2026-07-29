-- 023: mirror whole flyers, not just per-search results.
--
-- Supersedes the deals_cache approach from 022. That table keyed on the exact
-- search string, so it could only ever answer questions somebody had already
-- asked -- an item added to a list on Friday had no data until the next
-- Thursday run. Here the Thursday job copies EVERY item out of EVERY flyer for
-- the region, so any product that appears in a flyer is searchable straight
-- away, whenever it gets added to a list.
--
-- Scale, measured against postal code M5A0E7: ~170 flyers x ~790 items =
-- roughly 130k rows per postal code, refreshed weekly.

create extension if not exists pg_trgm;

create table if not exists flyer_items (
  id          bigserial primary key,
  postal_code text not null,          -- normalised: uppercase, no spaces
  merchant    text not null,
  name        text not null,
  price       numeric not null,
  valid_from  date,
  valid_to    date,
  flyer_id    bigint,
  fetched_at  timestamptz not null default now()
);

-- Search is `where postal_code = ? and name ilike '%term%'`. The btree handles
-- the region, the trigram GIN handles the substring match -- without it that
-- ILIKE is a sequential scan over every row for the region.
create index if not exists idx_flyer_items_postal on flyer_items (postal_code);
create index if not exists idx_flyer_items_name_trgm on flyer_items using gin (name gin_trgm_ops);
-- The refresh deletes the previous run's rows once the new ones are safely in.
create index if not exists idx_flyer_items_sweep on flyer_items (postal_code, fetched_at);

alter table flyer_items enable row level security;
-- Flyer prices are public advertising, not household data -- same reasoning as
-- deals_cache had in 021: readable by anyone signed in, written only by the
-- cron (which uses the service role and bypasses RLS entirely).
create policy sel_flyer_items on flyer_items for select using (true);

-- deals_cache is now dead: nothing reads or writes it after this migration.
-- It only ever held cached public flyer lookups, no household data.
drop table if exists deals_cache;
