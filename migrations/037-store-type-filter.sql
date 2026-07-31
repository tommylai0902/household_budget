-- 037: split "show all shop types" into an actual type filter instead of one
-- toggle that visually duplicated the separate "Show all" (mine vs everyone)
-- control next to it.
--
-- Flipp has no dedicated "Hardware" category -- hardware, furniture and
-- home-goods flyers are all filed under "Home & Garden" -- but that's still
-- the bucket a household means by "五金舖": Home Hardware, RONA, Home Depot,
-- Canadian Tire all fall in it, alongside furniture shops sharing the region.
--
-- Same pattern as is_grocery (migration 032): a merchant can run several
-- flyers at once, so it counts as Home & Garden if ANY of them are.

drop function if exists nearby_merchants(text);

create function nearby_merchants(p_postal_code text)
returns table (merchant text, merchant_logo text, item_count bigint, is_grocery boolean, is_home_garden boolean)
language sql
stable
as $$
  select f.merchant,
         min(f.merchant_logo) as merchant_logo,
         count(*)             as item_count,
         bool_or(f.categories ilike '%Groceries%')    as is_grocery,
         bool_or(f.categories ilike '%Home & Garden%') as is_home_garden
  from flyer_items f
  where f.postal_code = upper(regexp_replace(coalesce(p_postal_code, ''), '\s', '', 'g'))
  group by f.merchant
  order by bool_or(f.categories ilike '%Groceries%') desc nulls last, f.merchant;
$$;
