-- 031: order nearby_merchants alphabetically, not by flyer size.
--
-- 030 ordered by item count, on the theory that the busiest flyers were the
-- most relevant. Measured against the real M5A0E7 mirror (109 merchants),
-- that buries every supermarket: the top of the list is Long & McQuade,
-- Princess Auto and Cabela's, while Food Basics lands at #13, No Frills #15,
-- Farm Boy #30. Item count measures how big a flyer is, not whether you buy
-- groceries there.
--
-- Alphabetical instead: predictable to scan when you're looking for a shop by
-- name, which is the actual task. The panel's search box does the rest.
--
-- (Flipp does expose flyer categories — "Groceries", "Home & Garden" — which
-- would let us filter to food retailers properly. flyer_items doesn't store
-- them, so that needs a column plus a re-run of the weekly mirror. Worth doing
-- if the list ever needs to be shorter rather than just better sorted.)

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
  order by f.merchant;
$$;
