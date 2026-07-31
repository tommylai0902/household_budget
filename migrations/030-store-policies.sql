-- 030: per-store settings for Price Match Mode.
--
-- One row per (ledger, Flipp merchant name). Holds which shops are "mine"
-- and whether each honours a price match.
--
-- Keyed on the merchant NAME, not an id, because that is all flyer_items
-- carries (migration 023) -- Flipp's own feed does expose a merchant_id, but
-- storing it would mean re-running the weekly mirror to backfill, and the
-- names are stable enough within a region. Revisit if a rename ever splits a
-- store's history in two.
--
-- price_matches is deliberately NULLABLE, giving three states:
--   true  = confirmed it matches        false = confirmed it doesn't
--   null  = not asked yet
-- "Unknown" and "no" must not collapse together: a wrong "no" silently hides
-- real savings, and a wrong "yes" sends you to the till for an argument. No
-- policy data ships pre-filled for the same reason -- policies vary by
-- franchise owner (most No Frills and Food Basics are franchised) and change
-- without notice, so a shipped table would be wrong somewhere on day one and
-- wrong everywhere within a year. Every store starts null and is filled in
-- from actual experience.
--
-- confirmed_at backs the staleness nudge: past ~6 months the UI asks whether
-- it still holds rather than trusting it silently.
--
-- `note` carries what the boolean cannot -- real policies come with
-- conditions ("identical item and size", "local competitors only", "excludes
-- online-only prices", "limit one per customer"), and that is the text you
-- actually want in front of you at the counter.

create table if not exists store_policies (
  id            uuid primary key default gen_random_uuid(),
  ledger_id     uuid not null references ledgers(id) on delete cascade,
  merchant      text not null,
  is_local      boolean not null default false,
  price_matches boolean,
  note          text,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (ledger_id, merchant)
);

-- The Price Match panel's main read is "my local stores for this ledger".
create index if not exists idx_store_policies_local on store_policies (ledger_id, is_local);

alter table store_policies enable row level security;
create policy sel_store_policies on store_policies for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_store_policies on store_policies for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_store_policies on store_policies for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_store_policies on store_policies for delete using (has_ledger_role(ledger_id,'EDITOR'));

-- Viewers see the panel, they just can't edit the settings — matching the
-- brief's "visibility isn't role-gated, actions are".
alter publication supabase_realtime add table store_policies;

-- The "nearby supermarkets" list for store setup. This replaces what a
-- places/geocoding API would have provided: Flipp already returns flyers per
-- postal code, so the distinct merchants in that region ARE the nearby shops
-- -- and specifically the ones that publish flyers, which is the only set
-- price matching can act on anyway. A Places lookup would add stores we hold
-- no flyer data for.
--
-- Lives here rather than in PostgREST because that has no DISTINCT/GROUP BY;
-- pulling 21k rows to dedupe them client-side is not the trade to make.
-- Plain (not SECURITY DEFINER) so flyer_items' RLS still applies to callers.
create or replace function nearby_merchants(p_postal_code text)
returns table (merchant text, merchant_logo text, item_count bigint)
language sql
stable
as $$
  select f.merchant,
         min(f.merchant_logo) as merchant_logo,
         count(*)             as item_count
  from flyer_items f
  where f.postal_code = upper(regexp_replace(coalesce(p_postal_code, ''), '\s', '', 'g'))
  group by f.merchant
  -- Busiest flyers first: the big grocers surface above the one-item
  -- hardware shops that happen to share the region.
  order by count(*) desc, f.merchant;
$$;
