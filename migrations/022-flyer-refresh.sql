-- 022: weekly flyer prefetch.
--
-- Two changes, both in service of the Thursday cron (api/refresh-flyers.js)
-- that warms deals_cache so user searches never call Flipp live:
--
-- 1. ledgers.postal_code. The postal code used to live only in localStorage,
--    which a cron job cannot read -- so the job had no way to know WHICH
--    region to pull flyers for. Storing it on the ledger makes it the
--    household's shopping area, visible server-side. localStorage stays as
--    the device-level cache so the input still paints instantly.
-- 2. deals_cache.refreshed_by. Distinguishes a row the cron wrote from one an
--    older live lookup wrote, so the "have we already run this week?" guard
--    can't be satisfied by stale pre-cron rows.

alter table ledgers add column if not exists postal_code text;

alter table deals_cache add column if not exists refreshed_by text not null default 'live';

-- The cron reads/writes deals_cache with the service role, which bypasses RLS,
-- so no policy change is needed here -- rw_deals_cache (migration 021) already
-- covers the app's own read path.
create index if not exists idx_deals_cache_refreshed on deals_cache (refreshed_by, fetched_at desc);
