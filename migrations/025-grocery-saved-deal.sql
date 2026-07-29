-- 025: keep the chosen flyer cutout on the grocery item itself.
--
-- grocery_list already stored the matched merchant and price, which is enough
-- for the one-line badge but not enough to prove anything at the till. Pinning
-- the artwork here (rather than re-querying flyer_items on open) means the
-- picture you showed the cashier is the one you actually chose, and it keeps
-- working after Thursday's refresh sweeps that flyer row away -- the deal you
-- committed to shouldn't vanish mid-shop.

alter table grocery_list add column if not exists deal_image_url text;
alter table grocery_list add column if not exists deal_item_name text;
alter table grocery_list add column if not exists deal_valid_to date;
alter table grocery_list add column if not exists deal_merchant_logo text;
