-- 039: capture Flipp's own per-item id, so a saved deal (or a live
-- price-match report row) can link straight to that item's position within
-- the flyer instead of always landing on the flyer's front page.
--
-- Verified against Flipp's own site: https://flipp.com/en-ca/item/{id}-<any
-- text>?postal_code={postal_code} resolves purely by the numeric id — the
-- slug segment is cosmetic, a deliberately wrong one still opens the exact
-- right item. No merchant-name-to-slug mapping needed.

alter table flyer_items add column if not exists item_id bigint;
alter table grocery_list add column if not exists deal_item_id bigint;
