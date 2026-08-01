-- 038: Inventory Hub, Smart Grocery and Store Setup become household-wide.
--
-- inventory_items / grocery_list / inventory_labels / store_policies were all
-- scoped to whichever ledger_id you happened to be viewing, same RLS shape as
-- expenses/budgets/every other per-book table. But the Home page already
-- presents "Ledger & Transactions", "Inventory Hub" and "Smart Grocery" as
-- three peer cards -- switching the ledger switcher silently emptied the
-- other two, because their data was never actually shared, just
-- coincidentally populated under whichever ledger you'd been adding items
-- from. Fix: stop scoping them to a ledger at all.
--
-- Authorization moves from has_ledger_role(ledger_id, ...) to membership in
-- `members` -- the original login allowlist, still populated and still used
-- by scan-receipt.js/scan-product.js/scan-statement.js for the same purpose,
-- but unused for data RLS since migration 009 moved everything to per-ledger
-- roles. No VIEWER/EDITOR split: presence grants full read/write, matching
-- how these features already behave (no read-only guest concept here).

create or replace function is_household_member() returns boolean
language sql security definer stable as $$
  select exists (select 1 from members where user_id = auth.uid());
$$;

-- ---- inventory_items ----
drop policy if exists sel_inventory_items on inventory_items;
drop policy if exists ins_inventory_items on inventory_items;
drop policy if exists upd_inventory_items on inventory_items;
drop policy if exists del_inventory_items on inventory_items;
alter table inventory_items drop constraint if exists inventory_items_ledger_id_name_key;
alter table inventory_items drop column if exists ledger_id;
alter table inventory_items add constraint inventory_items_name_key unique (name);
create policy rw_inventory_items on inventory_items for all
  using (is_household_member()) with check (is_household_member());

-- ---- grocery_list ----
drop policy if exists sel_grocery_list on grocery_list;
drop policy if exists ins_grocery_list on grocery_list;
drop policy if exists upd_grocery_list on grocery_list;
drop policy if exists del_grocery_list on grocery_list;
alter table grocery_list drop column if exists ledger_id;
create policy rw_grocery_list on grocery_list for all
  using (is_household_member()) with check (is_household_member());

-- ---- inventory_labels ----
drop policy if exists sel_inventory_labels on inventory_labels;
drop policy if exists ins_inventory_labels on inventory_labels;
drop policy if exists upd_inventory_labels on inventory_labels;
drop policy if exists del_inventory_labels on inventory_labels;
alter table inventory_labels drop constraint if exists inventory_labels_ledger_id_kind_name_key;
alter table inventory_labels drop column if exists ledger_id;
alter table inventory_labels add constraint inventory_labels_kind_name_key unique (kind, name);
create policy rw_inventory_labels on inventory_labels for all
  using (is_household_member()) with check (is_household_member());

-- ---- store_policies ----
drop policy if exists sel_store_policies on store_policies;
drop policy if exists ins_store_policies on store_policies;
drop policy if exists upd_store_policies on store_policies;
drop policy if exists del_store_policies on store_policies;
-- migration 036's partial unique index enforced "one local store per
-- ledger" -- rebuilt as a true singleton: one local store, period, matching
-- "one shared shopping list" now that there's only one list.
drop index if exists uq_store_policies_one_local;
alter table store_policies drop constraint if exists store_policies_ledger_id_merchant_key;
alter table store_policies drop column if exists ledger_id;
alter table store_policies add constraint store_policies_merchant_key unique (merchant);
create unique index uq_store_policies_one_local on store_policies ((1)) where is_local;
create policy rw_store_policies on store_policies for all
  using (is_household_member()) with check (is_household_member());

-- If any of the three "add constraint unique(...)" statements above fail
-- with a duplicate-key error, the same item/label/merchant name already
-- exists under more than one ledger today -- stop and resolve that specific
-- collision by hand rather than guessing at a merge policy.

-- ---- notifications: allow household-wide rows alongside per-ledger ones ----
-- Only the inventory-expiry producer (inventory_item_id) writes ledger_id
-- null going forward -- per-expense and upcoming-charge reminders stay
-- ledger-scoped, since expenses genuinely are per-ledger.
alter table notifications alter column ledger_id drop not null;
drop policy if exists sel_notifications on notifications;
drop policy if exists ins_notifications on notifications;
drop policy if exists upd_notifications on notifications;
drop policy if exists del_notifications on notifications;
create policy sel_notifications on notifications for select using (
  (ledger_id is not null and has_ledger_role(ledger_id,'VIEWER'))
  or (ledger_id is null and is_household_member()));
create policy ins_notifications on notifications for insert with check (
  (ledger_id is not null and has_ledger_role(ledger_id,'EDITOR'))
  or (ledger_id is null and is_household_member()));
create policy upd_notifications on notifications for update using (
  (ledger_id is not null and has_ledger_role(ledger_id,'EDITOR'))
  or (ledger_id is null and is_household_member())
) with check (
  (ledger_id is not null and has_ledger_role(ledger_id,'EDITOR'))
  or (ledger_id is null and is_household_member()));
create policy del_notifications on notifications for delete using (
  (ledger_id is not null and has_ledger_role(ledger_id,'EDITOR'))
  or (ledger_id is null and is_household_member()));

-- ---- household_settings: one shared postal code ----
-- GroceryListPanel/StoreSetupPanel/PriceMatchModePanel all keyed off
-- ledgers.postal_code -- no longer has a home once they're not tied to one
-- ledger. Singleton row, same RLS as everything else above.
create table if not exists household_settings (
  id smallint primary key default 1 check (id = 1),
  postal_code text
);
insert into household_settings (id) values (1) on conflict (id) do nothing;
alter table household_settings enable row level security;
create policy rw_household_settings on household_settings for all
  using (is_household_member()) with check (is_household_member());
alter publication supabase_realtime add table household_settings;
