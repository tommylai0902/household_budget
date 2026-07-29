-- 028: remember which flyer a saved deal came from.
--
-- The cutout image proves the price, but some cashiers want the whole flyer.
-- Flipp publishes every flyer at
--   https://flipp.com/en-ca/flyer/{flyer_id}?postal_code={postal_code}
-- (verified: the city segment and name slug in their own links are optional),
-- so the numeric flyer_id already on flyer_items is all that's needed to link
-- straight to it -- no image mirroring.
--
-- Why link out rather than store the pages: a Flipp flyer is one enormous
-- tiled image -- the Canadian Tire one measures 99852 x 2560 px -- so showing
-- it means reimplementing their tile viewer, and the only whole-flyer asset
-- they hand out is a 140x107 cover thumbnail, useless at a till. Their page is
-- also always current and is the authoritative source, which is worth more in
-- front of a cashier than a copy inside a budgeting app.
--
-- postal_code is stored alongside because the flyer URL needs the region it
-- was matched in, and the ledger's own postal code can be edited later.

alter table grocery_list add column if not exists deal_flyer_id bigint;
alter table grocery_list add column if not exists deal_postal_code text;
