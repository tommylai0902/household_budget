-- 026: brand + size on grocery items, to narrow the flyer match.
--
-- Searching "milk" against the flyer mirror returns coconut milk, chocolate
-- milk and milk-flavoured drinks -- everything with the word in it. Flipp
-- writes the brand and the pack size straight into the item name
-- ("NEILSON CHOCOLATE MILK 750mL"), so storing them here lets the search add
-- them as extra substring filters and land on the actual product.
--
-- Both optional: an empty brand or size simply contributes no filter, so
-- existing items keep behaving exactly as before.

alter table grocery_list add column if not exists brand text;
alter table grocery_list add column if not exists size text;
