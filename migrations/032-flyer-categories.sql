-- 032: keep each flyer's category, so store setup can lead with supermarkets.
--
-- 030 ordered the store picker by flyer size; 031 changed that to
-- alphabetical. Measured against the real 109-merchant M5A0E7 list, neither
-- actually solves the problem: by size the top is Long & McQuade and Princess
-- Auto, alphabetically it's 2001 Audio Video and Bath Depot, and No Frills
-- falls from #15 to #66. Sort order was never the issue — the list simply
-- contains hardware, electronics and furniture shops that nobody buys
-- groceries from.
--
-- Flipp already labels this. Its flyers endpoint returns categories_csv per
-- flyer ("All Flyers,Groceries" vs "All Flyers,Home & Garden,Automotive"), we
-- just weren't storing it. One column and the picker can put food retailers
-- first and keep the rest behind a toggle.
--
-- Stored as the raw CSV rather than a parsed array: it comes that way, it is
-- only ever matched against, and a text[] would mean parsing on write for no
-- gain at this scale.
--
-- Existing rows stay NULL until the next mirror run — is_grocery below treats
-- NULL as "not known to be a grocer", so an un-refreshed region degrades to
-- the old behaviour rather than showing an empty picker.

alter table flyer_items add column if not exists categories text;

-- Adds is_grocery so the picker can lead with supermarkets. Replaces the 031
-- definition; ordering puts grocers first, then alphabetical within each group.
--
-- Dropped first, not just "create or replace": adding a column to the returned
-- row changes the function's return type, which replace refuses
-- ("cannot change return type of existing function"). Safe to drop — nothing
-- in the database depends on it, only the app calls it by name.
drop function if exists nearby_merchants(text);

create function nearby_merchants(p_postal_code text)
returns table (merchant text, merchant_logo text, item_count bigint, is_grocery boolean)
language sql
stable
as $$
  select f.merchant,
         min(f.merchant_logo) as merchant_logo,
         count(*)             as item_count,
         -- A merchant counts as a grocer if ANY of its flyers is filed under
         -- Groceries: Walmart and Canadian Tire run several flyers at once and
         -- only some are food, but they do sell groceries.
         bool_or(f.categories ilike '%Groceries%') as is_grocery
  from flyer_items f
  where f.postal_code = upper(regexp_replace(coalesce(p_postal_code, ''), '\s', '', 'g'))
  group by f.merchant
  order by bool_or(f.categories ilike '%Groceries%') desc nulls last, f.merchant;
$$;
