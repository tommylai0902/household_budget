-- 024: keep the flyer artwork alongside the price.
--
-- The point is price matching at the till: a number on screen proves nothing,
-- the flyer cutout does. Flipp gives every item a `cutout_image_url` (the
-- product clipped out of the flyer, price included) and every flyer a
-- `merchant_logo`; both are stored here so the app can show the evidence.
--
-- Note both arrive from Flipp as http:// URLs. They are rewritten to https on
-- the way in (api/refresh-flyers.js) -- the app is served over HTTPS and
-- browsers block mixed-content images outright, so an http URL would render
-- as a broken image with no obvious cause.

alter table flyer_items add column if not exists image_url text;
alter table flyer_items add column if not exists merchant_logo text;
